import "server-only";
import { serviceClient, createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { runCortex } from "@/lib/ai/cortex";

export type Memory = {
  id: string; org_id: string; author: string | null;
  kind: string; title: string | null; content: string;
  entities: string[]; tags: string[]; source: string; source_ref: string | null;
  importance: number; confidence: number; status: string; supersedes: string | null;
  pinned: boolean; ref_count: number; valid_from: string | null; valid_until: string | null;
  created_at: string; updated_at: string;
};
export type Entity = {
  id: string; org_id: string; name: string; type: string; summary: string | null;
  attributes: any; mention_count: number; created_at: string; updated_at: string;
};

const KINDS = ["fact", "preference", "decision", "insight", "instruction", "event"];
function normKind(k?: string) { const v = String(k || "fact").toLowerCase(); return KINDS.includes(v) ? v : "fact"; }
function clampImp(n: any) { const v = Math.round(Number(n) || 3); return Math.max(1, Math.min(5, v)); }

/* ------------------------------------------------------------------ writing */

/** Create (remember) a memory and register any entities it mentions. */
export async function remember(input: {
  content: string; title?: string; kind?: string; entities?: string[]; tags?: string[];
  importance?: number; source?: string; source_ref?: string; author?: string | null; orgId?: string;
}): Promise<Memory | null> {
  const svc = serviceClient();
  if (!svc || !input.content?.trim()) return null;
  const orgId = input.orgId || (await getUserAndOrg()).orgId;
  if (!orgId) return null;

  const entities = (input.entities || []).map((e) => e.trim()).filter(Boolean).slice(0, 12);
  const row = {
    org_id: orgId, author: input.author ?? null, kind: normKind(input.kind),
    title: input.title?.slice(0, 200) || null, content: input.content.trim().slice(0, 4000),
    entities, tags: (input.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10),
    importance: clampImp(input.importance), source: input.source || "manual", source_ref: input.source_ref || null,
  };
  try {
    const { data, error } = await svc.from("memories").insert(row).select("*").single();
    if (error) return null;
    for (const name of entities) { await upsertEntity(orgId, name).catch(() => {}); }
    return data as Memory;
  } catch { return null; }
}

/** Replace an existing memory with an updated one (evolving facts). */
export async function supersedeMemory(orgId: string, oldId: string, next: Parameters<typeof remember>[0]) {
  const svc = serviceClient();
  if (!svc) return null;
  const created = await remember({ ...next, orgId, source: next.source || "revision" });
  if (created) {
    try {
      await svc.from("memories").update({ status: "superseded" }).eq("id", oldId).eq("org_id", orgId);
      await svc.from("memories").update({ supersedes: oldId }).eq("id", created.id);
    } catch {}
  }
  return created;
}

export async function updateMemory(orgId: string, id: string, patch: Partial<Memory>) {
  const svc = serviceClient(); if (!svc) return false;
  const allowed: any = {};
  for (const k of ["title", "content", "kind", "importance", "pinned", "tags", "entities", "status"]) {
    if (k in patch) (allowed as any)[k] = (patch as any)[k];
  }
  if ("kind" in allowed) allowed.kind = normKind(allowed.kind);
  if ("importance" in allowed) allowed.importance = clampImp(allowed.importance);
  try { const { error } = await svc.from("memories").update(allowed).eq("id", id).eq("org_id", orgId); return !error; } catch { return false; }
}

export async function setPinned(orgId: string, id: string, pinned: boolean) {
  return updateMemory(orgId, id, { pinned } as any);
}
export async function archiveMemory(orgId: string, id: string) {
  return updateMemory(orgId, id, { status: "archived" } as any);
}

/* ------------------------------------------------------------------ reading */

function score(m: Memory): number {
  const ageDays = (Date.now() - new Date(m.created_at).getTime()) / 86_400_000;
  const recency = Math.max(0, 1 - ageDays / 365);          // decays over a year
  return m.importance * 2 + (m.pinned ? 6 : 0) + Math.min(m.ref_count, 8) * 0.5 + recency * 3;
}

/** Retrieve the most relevant memories for a query (hybrid FTS + ranking). */
export async function recall(orgId: string, query: string, opts: { limit?: number; kinds?: string[] } = {}): Promise<Memory[]> {
  const svc = serviceClient(); if (!svc || !orgId) return [];
  const limit = opts.limit ?? 8;
  try {
    let rows: Memory[] = [];
    const q = (query || "").trim();
    if (q) {
      // Full-text first, then a fuzzy ilike pass, then merge.
      const ft = await svc.from("memories").select("*").eq("org_id", orgId).eq("status", "active")
        .textSearch("search", q, { type: "websearch", config: "english" }).limit(40);
      rows = (ft.data as Memory[]) || [];
      if (rows.length < limit) {
        const like = await svc.from("memories").select("*").eq("org_id", orgId).eq("status", "active")
          .ilike("content", `%${q.slice(0, 60)}%`).limit(40);
        const seen = new Set(rows.map((r) => r.id));
        for (const r of ((like.data as Memory[]) || [])) if (!seen.has(r.id)) rows.push(r);
      }
    } else {
      const base = await svc.from("memories").select("*").eq("org_id", orgId).eq("status", "active")
        .order("created_at", { ascending: false }).limit(60);
      rows = (base.data as Memory[]) || [];
    }
    if (opts.kinds?.length) rows = rows.filter((r) => opts.kinds!.includes(r.kind));
    rows.sort((a, b) => score(b) - score(a));
    return rows.slice(0, limit);
  } catch { return []; }
}

/** Formatted memory block for injection into an AI prompt. Bumps recall counters. */
export async function recallContext(orgId: string | null, query: string, limit = 8): Promise<string> {
  if (!orgId) return "";
  const mems = await recall(orgId, query, { limit });
  if (!mems.length) return "";
  const svc = serviceClient();
  if (svc) { try { await svc.rpc("bump_memory_refs", { p_ids: mems.map((m) => m.id) }); } catch {} }
  const lines = mems.map((m) => `- [${m.kind}${m.pinned ? "★" : ""}] ${m.title ? m.title + ": " : ""}${m.content}`);
  return `WHAT CORTEX REMEMBERS (long-term memory — treat as trusted context):\n${lines.join("\n")}`;
}

export async function listMemories(orgId: string, filters: { kind?: string; entity?: string; status?: string; q?: string; limit?: number } = {}) {
  const svc = serviceClient(); if (!svc || !orgId) return [] as Memory[];
  try {
    let qb = svc.from("memories").select("*").eq("org_id", orgId).eq("status", filters.status || "active");
    if (filters.kind) qb = qb.eq("kind", filters.kind);
    if (filters.entity) qb = qb.contains("entities", [filters.entity]);
    if (filters.q) qb = qb.textSearch("search", filters.q, { type: "websearch", config: "english" });
    const { data } = await qb.order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(filters.limit ?? 200);
    return (data as Memory[]) || [];
  } catch { return []; }
}

export async function memoryStats(orgId: string) {
  const svc = serviceClient(); if (!svc || !orgId) return { total: 0, pinned: 0, entities: 0, byKind: {} as Record<string, number> };
  try {
    const [{ data: mems }, { count: entities }] = await Promise.all([
      svc.from("memories").select("kind,pinned").eq("org_id", orgId).eq("status", "active").limit(2000),
      svc.from("memory_entities").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);
    const byKind: Record<string, number> = {};
    let pinned = 0;
    for (const m of ((mems as any[]) || [])) { byKind[m.kind] = (byKind[m.kind] || 0) + 1; if (m.pinned) pinned++; }
    return { total: ((mems as any[]) || []).length, pinned, entities: entities || 0, byKind };
  } catch { return { total: 0, pinned: 0, entities: 0, byKind: {} }; }
}

/* --------------------------------------------------------------- entities/graph */

export async function upsertEntity(orgId: string, name: string, type?: string, summary?: string) {
  const svc = serviceClient(); if (!svc || !orgId || !name?.trim()) return null;
  const clean = name.trim().slice(0, 120);
  try {
    const { data: existing } = await svc.from("memory_entities").select("id,mention_count").eq("org_id", orgId).ilike("name", clean).maybeSingle();
    if (existing) {
      await svc.from("memory_entities").update({ mention_count: ((existing as any).mention_count || 1) + 1, updated_at: new Date().toISOString(), ...(summary ? { summary } : {}), ...(type ? { type } : {}) }).eq("id", (existing as any).id);
      return (existing as any).id;
    }
    const { data } = await svc.from("memory_entities").insert({ org_id: orgId, name: clean, type: type || "concept", summary: summary || null }).select("id").single();
    return (data as any)?.id ?? null;
  } catch { return null; }
}

export async function listEntities(orgId: string) {
  const svc = serviceClient(); if (!svc || !orgId) return [] as Entity[];
  try { const { data } = await svc.from("memory_entities").select("*").eq("org_id", orgId).order("mention_count", { ascending: false }).limit(300); return (data as Entity[]) || []; }
  catch { return []; }
}

export async function linkEntities(orgId: string, from: string, to: string, relation = "related") {
  const svc = serviceClient(); if (!svc || !orgId) return false;
  try { await svc.from("memory_links").upsert({ org_id: orgId, from_name: from.trim(), to_name: to.trim(), relation }, { onConflict: "org_id,from_name,to_name,relation" }); return true; }
  catch { return false; }
}

export async function getGraph(orgId: string) {
  const svc = serviceClient(); if (!svc || !orgId) return { entities: [] as Entity[], links: [] as any[] };
  try {
    const [{ data: entities }, { data: links }] = await Promise.all([
      svc.from("memory_entities").select("*").eq("org_id", orgId).order("mention_count", { ascending: false }).limit(200),
      svc.from("memory_links").select("*").eq("org_id", orgId).limit(400),
    ]);
    return { entities: (entities as Entity[]) || [], links: (links as any[]) || [] };
  } catch { return { entities: [], links: [] }; }
}

/* --------------------------------------------------------------- AI synthesis */

function firstJson(text: string): any {
  const s = text.indexOf("["); const e = text.lastIndexOf("]");
  const so = text.indexOf("{"); const eo = text.lastIndexOf("}");
  try { if (s !== -1 && e > s) return JSON.parse(text.slice(s, e + 1)); } catch {}
  try { if (so !== -1 && eo > so) return JSON.parse(text.slice(so, eo + 1)); } catch {}
  return null;
}

/** Extract structured memories from free text using the model, and store them. */
export async function extractMemories(orgId: string, text: string, author?: string | null) {
  if (!orgId || !text?.trim()) return { count: 0, items: [] as any[] };
  const prompt = `Extract durable business facts worth remembering long-term from the text below.
Return ONLY a JSON array. Each item: {"kind":"fact|preference|decision|insight|instruction|event","title":"short label","content":"the fact in one sentence","entities":["names of people/customers/vendors/products"],"tags":["lowercase"],"importance":1-5}.
Skip trivia and pleasantries. Max 8 items.

TEXT:
${text.slice(0, 6000)}`;
  let out = "";
  try { out = await runCortex([{ role: "user", content: prompt }], ""); } catch { return { count: 0, items: [] }; }
  const arr = firstJson(out);
  if (!Array.isArray(arr)) return { count: 0, items: [] };
  const items: any[] = [];
  for (const it of arr.slice(0, 8)) {
    if (!it?.content) continue;
    const m = await remember({
      orgId, author: author ?? null, kind: it.kind, title: it.title, content: it.content,
      entities: Array.isArray(it.entities) ? it.entities : [], tags: Array.isArray(it.tags) ? it.tags : [],
      importance: it.importance, source: "extract",
    });
    if (m) items.push(m);
  }
  return { count: items.length, items };
}

/** Synthesize a living "company brain" profile from the workspace's memories. */
export async function regenerateProfile(orgId: string) {
  const svc = serviceClient(); if (!svc || !orgId) return null;
  const mems = await listMemories(orgId, { limit: 120 });
  if (!mems.length) {
    const empty = "No memories yet. Capture facts, decisions and preferences and Cortex will build a living profile of your business here.";
    try { await svc.from("memory_profile").upsert({ org_id: orgId, profile_md: empty, updated_at: new Date().toISOString() }); } catch {}
    return empty;
  }
  const corpus = mems.map((m) => `- [${m.kind}] ${m.title ? m.title + ": " : ""}${m.content}`).join("\n").slice(0, 6000);
  const prompt = `You are the memory of an AI Chief Operating Officer. From these remembered facts, write a concise living profile of the business in Markdown with sections: **What the business is**, **Priorities & goals**, **Key people & relationships**, **Preferences & ways of working**, **Watch-outs**. Be specific, use only what's given, no fluff.\n\nMEMORIES:\n${corpus}`;
  let md = "";
  try { md = await runCortex([{ role: "user", content: prompt }], ""); } catch { md = ""; }
  if (!md) return null;
  try { await svc.from("memory_profile").upsert({ org_id: orgId, profile_md: md, updated_at: new Date().toISOString() }); } catch {}
  return md;
}

export async function getProfile(orgId: string) {
  const svc = serviceClient(); if (!svc || !orgId) return null;
  try { const { data } = await svc.from("memory_profile").select("*").eq("org_id", orgId).maybeSingle(); return data as any; }
  catch { return null; }
}

/** Teach Cortex from the workspace's existing data: customers, team, KPIs, insights. */
export async function ingestBusinessData(orgId: string, author?: string | null) {
  const svc = serviceClient(); if (!svc || !orgId) return { memories: 0, entities: 0 };
  let entities = 0;
  const lines: string[] = [];
  const pick = (o: any, keys: string[]) => { for (const k of keys) if (o?.[k]) return String(o[k]); return ""; };

  try {
    const { data } = await svc.from("customers").select("*").eq("org_id", orgId).limit(120);
    for (const c of ((data as any[]) || [])) {
      const name = pick(c, ["name", "customer_name", "company", "title"]); if (!name) continue;
      await upsertEntity(orgId, name, "customer", pick(c, ["segment", "notes"]) || undefined).catch(() => {}); entities++;
      const bits = [pick(c, ["city", "location"]), pick(c, ["segment"]) && `segment ${pick(c, ["segment"])}`, pick(c, ["status"]), pick(c, ["notes"])].filter(Boolean);
      lines.push(`Customer ${name}${bits.length ? " — " + bits.join(", ") : ""}`);
    }
  } catch {}
  try {
    const { data } = await svc.from("employees").select("*").eq("org_id", orgId).limit(120);
    for (const e of ((data as any[]) || [])) {
      const name = pick(e, ["name", "full_name"]); if (!name) continue;
      await upsertEntity(orgId, name, "person", pick(e, ["role", "title"]) || undefined).catch(() => {}); entities++;
      const bits = [pick(e, ["role", "title"]), pick(e, ["department", "dept"])].filter(Boolean);
      lines.push(`Team member ${name}${bits.length ? " — " + bits.join(", ") : ""}`);
    }
  } catch {}
  try {
    const { data } = await svc.from("health_metrics").select("label,value,unit,status").eq("org_id", orgId).limit(40);
    for (const m of ((data as any[]) || [])) lines.push(`KPI ${m.label}: ${m.value}${m.unit ? " " + m.unit : ""}${m.status ? ` (${m.status})` : ""}`);
  } catch {}
  try {
    const { data } = await svc.from("ai_insights").select("title,detail").eq("org_id", orgId).limit(20);
    for (const i of ((data as any[]) || [])) lines.push(`Insight — ${i.title}: ${i.detail}`);
  } catch {}

  let memories = 0;
  if (lines.length) {
    const res = await extractMemories(orgId, lines.join("\n"), author ?? null);
    memories = res.count;
  }
  return { memories, entities };
}

/** Cluster memories into themes (qualitative analysis). */
export async function clusterThemes(orgId: string) {
  if (!orgId) return [];
  const mems = await listMemories(orgId, { limit: 120 });
  if (mems.length < 3) return [];
  const corpus = mems.map((m) => `- ${m.content}`).join("\n").slice(0, 6000);
  const prompt = `Cluster these business memories into 4-7 themes. Return ONLY a JSON array of {"theme":"short name","summary":"one line","count":approx_number}. Order by importance.\n\nMEMORIES:\n${corpus}`;
  let out = "";
  try { out = await runCortex([{ role: "user", content: prompt }], ""); } catch { return []; }
  const arr = firstJson(out);
  return Array.isArray(arr) ? arr.slice(0, 7) : [];
}
