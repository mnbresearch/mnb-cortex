import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { serviceClient } from "@/lib/supabase/server";

/*
  LIVE SHARE LINKS (table shared_pages).

  create → a 32-byte random token, shown ONCE; only its SHA-256 is stored.
  resolve → public lookup by hash; refuses expired or revoked links and counts
  the view. The referenced task or grid is re-read on every view, so the page
  is live, and it is read with org_id taken from the link row — a token can
  never reach another workspace's data.
*/

export const SHARE_KINDS = ["agent_task", "grid"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];
export const SHARE_DAYS = [1, 7, 30, 90] as const;

const db = () => serviceClient() as any;
export const hashToken = (t: string) => createHash("sha256").update(String(t)).digest("hex");

export async function sharesReady(): Promise<boolean> {
  try { const { error } = await db().from("shared_pages").select("id").limit(1); return !error; } catch { return false; }
}

async function refExists(orgId: string, kind: ShareKind, refId: string): Promise<string | null> {
  const table = kind === "grid" ? "grids" : "agent_tasks";
  const col = kind === "grid" ? "name" : "title";
  const { data } = await db().from(table).select(`id, ${col}`).eq("id", refId).eq("org_id", orgId).maybeSingle();
  return data ? String((data as any)[col] || "") : null;
}

export async function createShare(orgId: string, userId: string | null, kind: ShareKind, refId: string, days: number) {
  if (!SHARE_KINDS.includes(kind)) return { ok: false as const, error: "Unknown kind." };
  const d = (SHARE_DAYS as readonly number[]).includes(days) ? days : 7;
  const title = await refExists(orgId, kind, refId);
  if (title == null) return { ok: false as const, error: "Nothing to share in this workspace with that id." };
  const token = randomBytes(32).toString("base64url");
  const expires_at = new Date(Date.now() + d * 86400_000).toISOString();
  const { data, error } = await db().from("shared_pages").insert({ org_id: orgId, created_by: userId, token_hash: hashToken(token), kind, ref_id: refId, title: title.slice(0, 200), expires_at }).select("id, expires_at").single();
  if (error || !data) return { ok: false as const, error: error?.message || "Could not create the link." };
  return { ok: true as const, id: data.id, token, expires_at: data.expires_at };
}

export async function listShares(orgId: string, kind: ShareKind, refId: string) {
  const { data } = await db().from("shared_pages").select("id, expires_at, revoked_at, views, last_viewed_at, created_at").eq("org_id", orgId).eq("kind", kind).eq("ref_id", refId).order("created_at", { ascending: false }).limit(20);
  return (data as any[]) || [];
}

export async function revokeShare(orgId: string, id: string) {
  /* Read the row back: zero rows (wrong id, another workspace's link) is not a success. */
  const { data, error } = await db().from("shared_pages").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("org_id", orgId).select("id");
  return !error && ((data as any[]) || []).length > 0;
}

/** Public: the link row if it is live, with its view counted. */
export async function resolveShare(token: string) {
  if (!token || token.length < 20) return null;
  const { data } = await db().from("shared_pages").select("*").eq("token_hash", hashToken(token)).maybeSingle();
  const row = data as any;
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) return null;
  await db().from("shared_pages").update({ views: (row.views || 0) + 1, last_viewed_at: new Date().toISOString() }).eq("id", row.id);
  return row as { id: string; org_id: string; kind: ShareKind; ref_id: string; title: string; expires_at: string };
}
