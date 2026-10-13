import "server-only";
import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { hasSupabase, serviceClient } from "@/lib/supabase/server";
import { keyFromHeaders, plausibleKey, judgeKey, hourlyLimit, shouldTouch, type ApiScope, type KeyRow } from "@/lib/api-keys";
import { requestId, type ErrorCode } from "@/lib/api/http";

/*
  ONE DOOR FOR EVERY /api/v1 CALL.

  Before this file each route authenticated on its own — by handing the raw
  key to a SQL function — so there was nowhere to put scopes, expiry,
  revocation, last-used or per-key limits. Now every route calls apiAuth()
  first and gets back either a context (org, key id, scopes) or a finished
  error response.

  Order matters and is deliberate:
    1. shape check  — refuse garbage without touching the database
    2. lookup by SHA-256 — the plaintext is never compared, stored or logged
    3. judgeKey     — revoked / expired / scope (pure, tested)
    4. rate limit   — bucket named from the key's ROW ID, never the secret
    5. last_used_at — at most every 5 minutes, best-effort
    6. usage count  — per key per endpoint per day, best-effort

  DEPLOY ORDER SAFETY. If this code reaches production before
  2026_zzzw_api_platform.sql, the scope/expiry columns do not exist yet. The
  lookup then falls back to (id, org_id) and the key keeps exactly its v1
  powers (LEGACY_SCOPES) — integrations keep running, and nothing gains a
  power it did not have.
*/

export type ApiCtx = { orgId: string; keyId: string; prefix: string | null; scopes: ApiScope[]; plan: string; rid: string };

export function apiError(rid: string, status: number, code: ErrorCode, error: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, error, code, request_id: rid }, { status, headers: { "X-Request-Id": rid, ...headers } });
}

export function apiOk(rid: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return NextResponse.json({ ok: true, ...body, request_id: rid }, { headers: { "X-Request-Id": rid, "Cache-Control": "no-store", ...headers } });
}

const missingColumn = (e: any) => String(e?.code || "") === "42703" || /column .* does not exist/i.test(String(e?.message || ""));

export async function apiAuth(
  req: Request,
  need: ApiScope | ApiScope[],
  kind: "read" | "write",
  endpoint: string,
): Promise<{ ok: true; ctx: ApiCtx; svc: NonNullable<ReturnType<typeof serviceClient>> } | { ok: false; res: NextResponse }> {
  const rid = requestId(randomUUID);
  if (!hasSupabase()) return { ok: false, res: apiError(rid, 503, "not_configured", "The API is not configured on this deployment.") };

  const key = keyFromHeaders(req.headers);
  if (!key) return { ok: false, res: apiError(rid, 401, "missing_key", "Send your key as `Authorization: Bearer <key>` (or the x-api-key header).") };
  if (!plausibleKey(key)) return { ok: false, res: apiError(rid, 401, "invalid_key", "Invalid API key.") };

  const svc = serviceClient();
  if (!svc) return { ok: false, res: apiError(rid, 503, "not_configured", "The API is not configured on this deployment (service role missing).") };

  const hash = createHash("sha256").update(key).digest("hex");
  let row: (KeyRow & { key_prefix?: string | null; last_used_at?: string | null }) | null = null;
  {
    const r = await svc.from("api_keys").select("id, org_id, key_prefix, scopes, expires_at, revoked_at, last_used_at").eq("key_hash", hash).maybeSingle();
    if (r.error && missingColumn(r.error)) {
      const legacy = await svc.from("api_keys").select("id, org_id, key_prefix").eq("key_hash", hash).maybeSingle();
      if (legacy.error) return { ok: false, res: apiError(rid, 500, "internal", "Could not verify the key. Retry shortly.") };
      row = legacy.data ? { ...(legacy.data as any), scopes: undefined } : null;
    } else if (r.error) {
      return { ok: false, res: apiError(rid, 500, "internal", "Could not verify the key. Retry shortly.") };
    } else {
      row = (r.data as any) || null;
    }
  }

  const now = Date.now();
  const verdict = judgeKey(row, need, now);
  if (!verdict.ok) {
    if (row) await bump(svc, row.org_id, row.id, endpoint, false);
    return { ok: false, res: apiError(rid, verdict.status, verdict.code, verdict.message) };
  }
  const k = row!;

  let plan = "";
  try {
    const { data } = await svc.from("organizations").select("plan").eq("id", k.org_id).maybeSingle();
    plan = String((data as any)?.plan || "");
  } catch { /* default limits */ }

  const limit = hourlyLimit(plan, kind);
  {
    const { enforce } = await import("@/lib/ratelimit");
    const over = await enforce([{ key: `api:${kind}:${k.id}`, limit, windowSecs: 3600 }]);
    if (over) {
      await bump(svc, k.org_id, k.id, endpoint, false);
      return { ok: false, res: apiError(rid, 429, "rate_limited", `Rate limit reached for this key (${limit} ${kind} calls an hour on your plan). Nothing was done; retry later.`, { "Retry-After": "300", "X-RateLimit-Limit": String(limit) }) };
    }
  }

  /* Awaited, not fire-and-forget: a serverless function may be frozen the moment the response is sent. Both are one small write and failures are swallowed. */
  await Promise.all([
    (row as any).scopes !== undefined && shouldTouch((row as any).last_used_at, now)
      ? Promise.resolve(svc.from("api_keys").update({ last_used_at: new Date(now).toISOString() }).eq("id", k.id)).catch(() => {})
      : null,
    bump(svc, k.org_id, k.id, endpoint, true),
  ]);

  return { ok: true, svc, ctx: { orgId: k.org_id, keyId: k.id, prefix: (row as any)?.key_prefix ?? null, scopes: verdict.scopes, plan, rid } };
}

/* Per key, per endpoint, per day — powers "API usage" on /developers and the operator console. Missing function = migration not run yet = skip. */
async function bump(svc: any, orgId: string, keyId: string, endpoint: string, ok: boolean) {
  try { await svc.rpc("api_usage_bump", { p_org: orgId, p_key: keyId, p_endpoint: endpoint, p_ok: ok }); } catch { /* best-effort */ }
}
