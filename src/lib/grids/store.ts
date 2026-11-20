import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { chargeOrgForMode, refundIfCharged } from "@/lib/credits";
import { runCortex, isEngineFailure } from "@/lib/ai/cortex";
import { FAST } from "@/lib/ai/generation";
import { withOrgAiKeys } from "@/lib/ai/byo";
import { citationFor } from "@/lib/knowledge/core";
import { cellPrompt, cleanColumns, pendingCells, pruneCells, toCell, newId, GRID_LIMITS, type Grid, type GridCell, type GridColumn, type GridRow } from "@/lib/grids/core";

/*
  Grids storage and the cell runner.

  Every read and write is scoped to the caller's org_id (service client, after
  the route's role check). A cell is charged at the "document" price; a cell
  the model fails on is refunded and left as "error" so the next run retries
  it. Documents come only from this workspace's knowledge_items.

  Fails soft: no table → no grids, and the page says which SQL to run.
*/

const db = () => serviceClient() as any;
const MODE = "document";

function shape(d: any): Grid & { updated_at?: string } {
  return { id: String(d.id), name: String(d.name || ""), rows: Array.isArray(d.rows) ? d.rows : [], columns: Array.isArray(d.columns) ? d.columns : [], cells: d.cells && typeof d.cells === "object" ? d.cells : {}, updated_at: d.updated_at };
}

export async function gridsReady(): Promise<boolean> {
  const sb = db(); if (!sb) return false;
  try { const { error } = await sb.from("grids").select("id").limit(1); return !error; } catch { return false; }
}

export async function listGrids(orgId: string) {
  const sb = db(); if (!sb) return [];
  try {
    const { data } = await sb.from("grids").select("id, name, rows, columns, updated_at").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(100);
    return ((data as any[]) || []).map((d) => ({ id: d.id, name: d.name, rows: (d.rows || []).length, columns: (d.columns || []).length, updated_at: d.updated_at }));
  } catch { return []; }
}

export async function getGrid(orgId: string, id: string) {
  const sb = db(); if (!sb) return null;
  const { data } = await sb.from("grids").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  return data ? shape(data) : null;
}

export async function createGrid(orgId: string, userId: string | null, name: string, columns: unknown) {
  const sb = db(); if (!sb) return null;
  const { data, error } = await sb.from("grids").insert({ org_id: orgId, created_by: userId, name: String(name || "Untitled grid").trim().slice(0, GRID_LIMITS.name) || "Untitled grid", columns: cleanColumns(columns) }).select("*").single();
  return error || !data ? null : shape(data);
}

/** Rows come from this workspace's knowledge items only — the ids are looked up, never trusted. */
export async function rowsFor(orgId: string, itemIds: string[]): Promise<GridRow[]> {
  const sb = db(); if (!sb || !itemIds.length) return [];
  const ids = Array.from(new Set(itemIds.map(String))).slice(0, GRID_LIMITS.rows);
  const { data: items } = await sb.from("knowledge_items").select("id, source_id, provider, kind, title, author, occurred_at, url, metadata").eq("org_id", orgId).in("id", ids);
  const { data: sources } = await sb.from("knowledge_sources").select("id, label").eq("org_id", orgId);
  const label = new Map(((sources as any[]) || []).map((s) => [s.id, s.label]));
  return ((items as any[]) || []).map((r) => ({
    id: newId(), item_id: r.id, title: r.title || "Untitled", url: r.url || null, kind: r.kind, provider: r.provider,
    citation: citationFor({ ...r, source_label: label.get(r.source_id) || null }),
  }));
}

export async function updateGrid(orgId: string, id: string, patch: { name?: string; columns?: unknown; addItems?: string[]; removeRows?: string[] }) {
  const g = await getGrid(orgId, id); if (!g) return null;
  let rows = g.rows;
  if (patch.removeRows?.length) { const rm = new Set(patch.removeRows); rows = rows.filter((r) => !rm.has(r.id)); }
  if (patch.addItems?.length) {
    const have = new Set(rows.map((r) => r.item_id));
    const add = await rowsFor(orgId, patch.addItems.filter((x) => !have.has(x)));
    rows = [...rows, ...add].slice(0, GRID_LIMITS.rows);
  }
  let columns = g.columns;
  const changed = new Set<string>();
  if (patch.columns !== undefined) {
    columns = cleanColumns(patch.columns);
    const before = new Map(g.columns.map((c) => [c.id, c]));
    for (const c of columns) { const b = before.get(c.id); if (b && (b.question !== c.question || b.format !== c.format)) changed.add(c.id); }
  }
  const cells = pruneCells(g.cells, rows, columns, changed);
  const name = patch.name !== undefined ? (String(patch.name).trim().slice(0, GRID_LIMITS.name) || g.name) : g.name;
  const { data } = await db().from("grids").update({ name, rows, columns, cells, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", orgId).select("*").single();
  return data ? shape(data) : null;
}

export async function deleteGrid(orgId: string, id: string) {
  const { error } = await db().from("grids").delete().eq("id", id).eq("org_id", orgId);
  return !error;
}

async function itemContent(orgId: string, itemId: string): Promise<string | null> {
  const { data } = await db().from("knowledge_items").select("content").eq("id", itemId).eq("org_id", orgId).maybeSingle();
  return data ? String((data as any).content || "") : null;
}

/**
 * Answer up to GRID_LIMITS.runBatch pending cells, GRID_LIMITS.concurrency at a
 * time. Returns the saved grid and why it stopped (done / batch / credits).
 */
export async function runGridBatch(orgId: string, userId: string | null, id: string) {
  const g = await getGrid(orgId, id); if (!g) return { grid: null, stopped: "missing" as const };
  const todo = pendingCells(g).slice(0, GRID_LIMITS.runBatch);
  if (!todo.length) return { grid: g, stopped: "done" as const };
  const results: Record<string, GridCell> = {};
  let outOfCredits = false;

  const work = async (t: { row: GridRow; col: GridColumn; key: string }) => {
    if (outOfCredits) return;
    const gate = await chargeOrgForMode(orgId, MODE, { userId });
    if (!gate.ok) { outOfCredits = true; return; }
    try {
      const content = await itemContent(orgId, t.row.item_id);
      if (content == null) { results[t.key] = { status: "error", answer: "", quote: "", verified: false, error: "This document is no longer in Company Knowledge.", at: new Date().toISOString() }; await refundIfCharged(gate, MODE); return; }
      const text = await withOrgAiKeys(orgId, () => runCortex([{ role: "user", content: cellPrompt(t.col.question, t.col.format, t.row.title, content) }], "", FAST));
      if (isEngineFailure(text)) { await refundIfCharged(gate, MODE); results[t.key] = { status: "error", answer: "", quote: "", verified: false, error: "The AI engine did not answer; this cell will be retried.", at: new Date().toISOString() }; return; }
      const cell = toCell(text, content);
      if (cell.status === "error") await refundIfCharged(gate, MODE);
      results[t.key] = cell;
    } catch (e: any) {
      await refundIfCharged(gate, MODE);
      results[t.key] = { status: "error", answer: "", quote: "", verified: false, error: String(e?.message || "Failed").slice(0, 200), at: new Date().toISOString() };
    }
  };

  for (let i = 0; i < todo.length; i += GRID_LIMITS.concurrency) {
    await Promise.all(todo.slice(i, i + GRID_LIMITS.concurrency).map(work));
    if (outOfCredits) break;
  }

  /* Re-read before writing so an edit made during the run is not overwritten. */
  const fresh = await getGrid(orgId, id); if (!fresh) return { grid: null, stopped: "missing" as const };
  const cells = { ...fresh.cells };
  const live = new Set(fresh.rows.flatMap((r) => fresh.columns.map((c) => `${r.id}:${c.id}`)));
  for (const [k, v] of Object.entries(results)) if (live.has(k)) cells[k] = v;
  const { data } = await db().from("grids").update({ cells, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", orgId).select("*").single();
  const grid = data ? shape(data) : fresh;
  return { grid, stopped: outOfCredits ? ("credits" as const) : pendingCells(grid).length ? ("batch" as const) : ("done" as const) };
}
