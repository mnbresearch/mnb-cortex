import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { citationFor, safeSnippet, searchTerms, type KnowledgeKind, type KnowledgeProvider } from "@/lib/knowledge/core";

/*
  Company Knowledge — storage and search. Every function takes the workspace
  id from its caller (a session-checked route, the task runner, or the
  sweeper) and filters on it. The encrypted `secret` column is read only by
  tokenFor(), on the server, and never selected anywhere else.
*/

const db = () => serviceClient() as any;
const SAFE_SOURCE_COLS = "id, org_id, created_by, provider, label, status, status_reason, account, scopes, config, item_count, last_synced_at, next_sync_at, created_at, updated_at";

export type SourceRow = {
  id: string; org_id: string; created_by: string | null; provider: KnowledgeProvider; label: string;
  status: "active" | "paused" | "error" | "needs_reauth"; status_reason: string | null; account: string | null;
  scopes: string[]; config: Record<string, any>; item_count: number; last_synced_at: string | null; next_sync_at: string;
  created_at: string; updated_at: string;
};

export type ItemInput = {
  kind: KnowledgeKind; external_id: string; title?: string | null; author?: string | null; occurred_at?: string | null;
  url?: string | null; content: string; metadata?: Record<string, unknown>;
};

export async function knowledgeReady(): Promise<boolean> {
  const sb = db(); if (!sb) return false;
  try { const { error } = await sb.from("knowledge_sources").select("id").limit(1); return !error; } catch { return false; }
}
export const KNOWLEDGE_SETUP = "Company Knowledge needs its database tables. Run supabase/RUN-2026-11-20-company-knowledge.sql in the Supabase SQL editor, then reload.";

export async function listSources(orgId: string): Promise<SourceRow[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("knowledge_sources").select(SAFE_SOURCE_COLS).eq("org_id", orgId).order("created_at", { ascending: false }).limit(100);
  return (data as SourceRow[]) || [];
}

export async function getSource(orgId: string, id: string): Promise<SourceRow | null> {
  const sb = db(); if (!sb) return null;
  const { data } = await sb.from("knowledge_sources").select(SAFE_SOURCE_COLS).eq("org_id", orgId).eq("id", id).maybeSingle();
  return (data as SourceRow) || null;
}

/** The decrypted token for a source. Server-only; never returned to a client. */
export async function tokenFor(orgId: string, id: string): Promise<string | null> {
  const sb = db(); if (!sb) return null;
  const { data } = await sb.from("knowledge_sources").select("secret").eq("org_id", orgId).eq("id", id).maybeSingle();
  const enc = (data as any)?.secret;
  return enc ? decryptSecret(enc) : null;
}

export async function createSource(input: {
  orgId: string; userId: string | null; provider: KnowledgeProvider; label: string; account?: string | null;
  scopes?: string[]; config?: Record<string, unknown>; secret?: string | null;
}): Promise<{ ok: true; source: SourceRow } | { ok: false; error: string }> {
  const sb = db(); if (!sb) return { ok: false, error: "The database is not configured." };
  let secret: string | null = null;
  if (input.secret) {
    secret = encryptSecret(input.secret);
    if (!secret) return { ok: false, error: "Credentials cannot be stored: ENCRYPTION_KEY is not configured on this deployment." };
  }
  const { data, error } = await sb.from("knowledge_sources").insert({
    org_id: input.orgId, created_by: input.userId, provider: input.provider, label: input.label.slice(0, 120),
    account: input.account ?? null, scopes: input.scopes ?? [], config: input.config ?? {}, secret,
  }).select(SAFE_SOURCE_COLS).single();
  if (error || !data) return { ok: false, error: error?.message || "Could not save the source." };
  return { ok: true, source: data as SourceRow };
}

export async function updateSource(orgId: string, id: string, patch: Partial<SourceRow> & { secret?: string | null }): Promise<void> {
  const sb = db(); if (!sb) return;
  const row: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.secret !== undefined) row.secret = patch.secret ? encryptSecret(patch.secret) : null;
  await sb.from("knowledge_sources").update(row).eq("org_id", orgId).eq("id", id);
}

/** Deleting a source deletes everything read from it (ON DELETE CASCADE). */
export async function deleteSource(orgId: string, id: string): Promise<boolean> {
  const sb = db(); if (!sb) return false;
  const { error } = await sb.from("knowledge_sources").delete().eq("org_id", orgId).eq("id", id);
  return !error;
}

/** Upsert items for a source, keyed on (source_id, external_id): re-syncing updates, never duplicates. */
export async function upsertItems(source: SourceRow, items: ItemInput[]): Promise<number> {
  const sb = db(); if (!sb || !items.length) return 0;
  const now = new Date().toISOString();
  let written = 0;
  for (let i = 0; i < items.length; i += 200) {
    const rows = items.slice(i, i + 200).map((it) => ({
      org_id: source.org_id, source_id: source.id, provider: source.provider, kind: it.kind,
      external_id: String(it.external_id).slice(0, 400), title: it.title?.slice(0, 400) ?? null, author: it.author?.slice(0, 200) ?? null,
      occurred_at: it.occurred_at ?? null, url: it.url?.slice(0, 2000) ?? null, content: String(it.content || "").slice(0, 20_000),
      metadata: it.metadata ?? {}, updated_at: now,
    }));
    const { error } = await sb.from("knowledge_items").upsert(rows, { onConflict: "source_id,external_id" });
    if (!error) written += rows.length;
  }
  const { count } = await sb.from("knowledge_items").select("id", { count: "exact", head: true }).eq("org_id", source.org_id).eq("source_id", source.id);
  await updateSource(source.org_id, source.id, { item_count: count ?? 0 } as any);
  return written;
}

export type SearchHit = {
  id: string; citation: string; kind: string; provider: string; title: string | null; author: string | null;
  date: string | null; url: string | null; excerpt: string; source: string;
};

/**
 * Search the workspace's knowledge. Full-text first (indexed), then a plain
 * substring pass so a short code or a name that full-text tokenises oddly is
 * still found. Every hit carries its citation.
 */
export async function searchKnowledge(orgId: string, query: string, opts: { limit?: number; kind?: string; provider?: string } = {}): Promise<SearchHit[]> {
  const sb = db(); if (!sb || !orgId) return [];
  const q = searchTerms(query);
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 20));
  const sources = await listSources(orgId);
  const labelOf = new Map(sources.map((s) => [s.id, s.label]));
  const cols = "id, source_id, provider, kind, title, author, occurred_at, url, content, metadata";
  const scope = (b: any) => {
    let x = b.eq("org_id", orgId);
    if (opts.kind) x = x.eq("kind", opts.kind);
    if (opts.provider) x = x.eq("provider", opts.provider);
    return x;
  };
  let rows: any[] = [];
  if (q) {
    try {
      const ft = await scope(sb.from("knowledge_items").select(cols)).textSearch("search", q, { type: "websearch", config: "simple" }).limit(limit * 3);
      rows = (ft.data as any[]) || [];
    } catch { rows = []; }
    if (rows.length < limit) {
      const word = q.split(" ").sort((a, b) => b.length - a.length)[0] || q;
      const like = await scope(sb.from("knowledge_items").select(cols)).ilike("content", `%${word.replace(/[\\%_]/g, "\\$&")}%`).order("occurred_at", { ascending: false }).limit(limit * 2);
      const seen = new Set(rows.map((r) => r.id));
      for (const r of ((like.data as any[]) || [])) if (!seen.has(r.id)) rows.push(r);
    }
  } else {
    const recent = await scope(sb.from("knowledge_items").select(cols)).order("occurred_at", { ascending: false }).limit(limit);
    rows = (recent.data as any[]) || [];
  }
  return rows.slice(0, limit).map((r) => {
    const source_label = labelOf.get(r.source_id) || null;
    return {
      id: r.id, citation: citationFor({ ...r, source_label }), kind: r.kind, provider: r.provider, title: r.title, author: r.author,
      date: r.occurred_at ? String(r.occurred_at).slice(0, 10) : null, url: r.url, excerpt: safeSnippet(r.content, q), source: source_label || r.provider,
    };
  });
}

export async function knowledgeStats(orgId: string) {
  const sources = await listSources(orgId);
  return { sources: sources.length, items: sources.reduce((n, s) => n + (s.item_count || 0), 0) };
}
