import { NextResponse } from "next/server";
import { createClient, hasSupabase, serviceClient } from "@/lib/supabase/server";
import { recomputeQuietly } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!hasSupabase()) return NextResponse.json({ ok: false, error: "not configured" }, { status: 200 });
  const key = req.headers.get("x-api-key") || "";
  if (!key) return NextResponse.json({ ok: false, error: "missing x-api-key header" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  const table = body.table; const rows = Array.isArray(body.rows) ? body.rows : (body.row ? [body.row] : []);
  if (!table || !rows.length) return NextResponse.json({ ok: false, error: "provide { table, rows: [...] }" }, { status: 400 });

  /*
    A BOUND ON THE PAYLOAD, AND A BOUND ON THE RATE. This endpoint had neither.

    `rows` came straight off the request body and went to api_ingest(), which
    does `insert … from jsonb_array_elements(p_rows)` with no cap of its own —
    so a single POST could carry an arbitrary number of rows, and nothing
    limited how many POSTs arrived. lib/ratelimit.ts existed and was applied
    only to the public unauthenticated forms; the authenticated write path,
    which is the one that costs storage and triggers a KPI recompute per call,
    was the one left open.

    Being precise about the risk, because it is not "anyone can do this": the
    key is valid or the RPC refuses, and org scoping is enforced inside
    api_ingest from the key hash. This is a bound on what a LEGITIMATE
    integrator can do by accident — a retry loop with no backoff, or a
    migration script pointed at the wrong environment — which is the realistic
    way this endpoint hurts us, and it would hurt the whole database rather
    than just their workspace.

    The UI importer caps at ROW_CEILING = 10,000 per import and says so
    (lib/import-outcome.ts). Matching it here means the two ways into the same
    tables behave the same, which is worth more than picking a cleverer number.

    Keyed on the API key, not on the IP: a server-to-server integration has one
    key and may legitimately move IPs. 60 calls an hour × 10,000 rows is 600k
    rows an hour, far above any real integration and far below anything that
    threatens the database.
  */
  const MAX_ROWS = 10_000;
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({
      ok: false,
      error: `Too many rows in one call (${rows.length}). Send at most ${MAX_ROWS} — split the batch and repeat. `
        + `Nothing was written.`,
    }, { status: 413 });
  }

  {
    const { enforce } = await import("@/lib/ratelimit");
    const { createHash } = await import("node:crypto");
    /* The key is hashed before it becomes a rate-limit bucket name, so a raw
       secret never lands in a cache key, a log line or an error message. */
    const bucket = createHash("sha256").update(key).digest("hex").slice(0, 32);
    const over = await enforce([{ key: `ingest:${bucket}`, limit: 60, windowSecs: 3600 }]);
    if (over) {
      return NextResponse.json({
        ok: false,
        error: "Rate limit reached for this API key (60 calls an hour). Nothing was written; retry shortly.",
      }, { status: 429 });
    }
  }

  const sb = await createClient();
  const { data, error } = await sb.rpc("api_ingest", { p_key: key, p_table: table, p_rows: rows });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  // An invalid key used to come back inside a 200, so integrators never noticed
  // their pipeline was silently doing nothing.
  const result = (data || {}) as any;
  if (result.ok === false) {
    const unauthorised = /invalid api key/i.test(String(result.error || ""));
    return NextResponse.json(result, { status: unauthorised ? 401 : 400 });
  }

  // Refresh the dashboard KPIs for the workspace this key belongs to, so data
  // pushed through the API shows up immediately like a UI import does.
  try {
    const svc = serviceClient();
    if (svc) {
      /* Hash, like api_ingest() does — `key` is empty after
         2026_zzze_api_key_hash.sql, so comparing against it silently matched
         nothing and the KPI refresh stopped happening. */
      const { createHash } = await import("node:crypto");
      const keyHash = createHash("sha256").update(key).digest("hex");
      const { data: k } = await svc.from("api_keys").select("org_id").eq("key_hash", keyHash).maybeSingle();
      await recomputeQuietly((k as any)?.org_id);
    }
  } catch { /* swept nightly */ }

  return NextResponse.json(result);
}
