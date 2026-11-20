import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { refreshAccess, type OAuthProvider } from "@/lib/knowledge/oauth";
import { syncMicrosoft, syncGoogle } from "@/lib/knowledge/workspace-sync";
import { discoverTools } from "@/lib/knowledge/mcp-client";
import { allowableTools } from "@/lib/knowledge/core";
import { tokenFor, updateSource, upsertItems, type SourceRow } from "@/lib/knowledge/store";

/*
  Syncing a source: refresh its token, read what is new since the last sync
  (the first sync reads the last 30 days), upsert it, and schedule the next
  sync six hours out. A sign-in that has expired or been revoked marks the
  source needs_reauth — shown to the owner, never retried in a loop.
*/

export const SYNC_EVERY_MS = 6 * 3600_000;
const FIRST_SYNC_DAYS = 30;

export async function syncSource(source: SourceRow): Promise<{ ok: boolean; written: number; note: string }> {
  const now = new Date();
  const next = new Date(Date.now() + SYNC_EVERY_MS).toISOString();
  try {
    if (source.provider === "upload") return { ok: true, written: 0, note: "Uploaded documents do not sync." };

    if (source.provider === "mcp") {
      const token = await tokenFor(source.org_id, source.id);
      const { server, tools } = await discoverTools(String(source.config?.url || ""), token);
      const readable = allowableTools(tools).map((t) => ({ name: t.name, description: t.description }));
      const allowed = (source.config?.allowed as string[] | undefined) ?? readable.map((t) => t.name);
      await updateSource(source.org_id, source.id, {
        status: "active", status_reason: `${readable.length} read-only tool(s) available, ${allowed.filter((a) => readable.some((r) => r.name === a)).length} allowed.`,
        config: { ...source.config, server, tools: readable, allowed: allowed.filter((a) => readable.some((r) => r.name === a)) },
        last_synced_at: now.toISOString(), next_sync_at: next,
      } as any);
      return { ok: true, written: 0, note: `${readable.length} read-only tool(s)` };
    }

    const refresh = await tokenFor(source.org_id, source.id);
    if (!refresh) {
      await updateSource(source.org_id, source.id, { status: "needs_reauth", status_reason: "Sign in again to reconnect this account." } as any);
      return { ok: false, written: 0, note: "No stored sign-in." };
    }
    const tok = await refreshAccess(source.provider as OAuthProvider, refresh, source.org_id);
    if ("error" in tok) {
      await updateSource(source.org_id, source.id, { status: "needs_reauth", status_reason: `Sign in again: ${tok.error}`, next_sync_at: next } as any);
      return { ok: false, written: 0, note: tok.error };
    }
    const since = source.last_synced_at ? new Date(new Date(source.last_synced_at).getTime() - 3600_000) : new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000);
    const read = source.provider === "microsoft365"
      ? await syncMicrosoft(tok.access_token, since, source.scopes)
      : await syncGoogle(tok.access_token, since, source.scopes);
    const written = await upsertItems(source, read.items);
    await updateSource(source.org_id, source.id, {
      status: "active", status_reason: read.notes.length ? read.notes.join(" ") : `Read ${read.items.length} new item(s).`,
      last_synced_at: now.toISOString(), next_sync_at: next,
      ...(tok.refresh_token && tok.refresh_token !== refresh ? { secret: tok.refresh_token } : {}),
    } as any);
    return { ok: true, written, note: read.notes.join(" ") };
  } catch (e: any) {
    await updateSource(source.org_id, source.id, {
      status: e?.reauth ? "needs_reauth" : "error",
      status_reason: String(e?.message || e).slice(0, 300), next_sync_at: next,
    } as any);
    return { ok: false, written: 0, note: String(e?.message || e) };
  }
}

/** For the sweeper: sync sources that are due, claiming each before it runs, within a time budget. */
export async function syncDueSources(budgetMs = 60_000): Promise<number> {
  const sb = serviceClient() as any; if (!sb) return 0;
  const started = Date.now();
  const now = new Date().toISOString();
  const { data } = await sb.from("knowledge_sources")
    .select("id, org_id, created_by, provider, label, status, status_reason, account, scopes, config, item_count, last_synced_at, next_sync_at, created_at, updated_at")
    .in("status", ["active", "error"]).neq("provider", "upload").lte("next_sync_at", now).order("next_sync_at", { ascending: true }).limit(10);
  let done = 0;
  for (const s of ((data as SourceRow[]) || [])) {
    if (Date.now() - started > budgetMs) break;
    /* Claim: push next_sync_at forward only if no other sweeper already did. */
    const { data: claimed } = await sb.from("knowledge_sources").update({ next_sync_at: new Date(Date.now() + 15 * 60_000).toISOString() })
      .eq("id", s.id).eq("next_sync_at", s.next_sync_at).select("id");
    if (!claimed || (claimed as any[]).length !== 1) continue;
    await syncSource(s);
    done++;
  }
  return done;
}
