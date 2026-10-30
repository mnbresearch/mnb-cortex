import { recomputeQuietly } from "@/lib/metrics";
import { apiAuth, apiError, apiOk } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 5 MB. 10,000 rows of ordinary records is ~2–3 MB; anything larger is a mistake, refused before parsing. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const TABLES = ["sales_orders", "invoices", "inventory_items", "customers", "leads"] as const;

export async function POST(req: Request) {
  /*
    AUTH FIRST, through the one door every /api/v1 route uses: scope
    ingest:write, not revoked, not expired, per-key write limit for the plan
    (lib/api/auth.ts). This replaces the bespoke key-hash bucket that lived here.
  */
  const auth = await apiAuth(req, ["ingest:write", "connector:write"], "write", "/api/v1/ingest");
  if (!auth.ok) return auth.res;
  const { ctx, svc } = auth;
  const key = (await import("@/lib/api-keys")).keyFromHeaders(req.headers);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) return apiError(ctx.rid, 413, "payload_too_large", `Body is over ${MAX_BODY_BYTES / 1024 / 1024} MB. Split the batch. Nothing was written.`);
  let body: any = {};
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return apiError(ctx.rid, 413, "payload_too_large", `Body is over ${MAX_BODY_BYTES / 1024 / 1024} MB. Split the batch. Nothing was written.`);
    body = JSON.parse(text);
  } catch { return apiError(ctx.rid, 400, "bad_request", "Body is not valid JSON."); }
  const table = body?.table; const rows = Array.isArray(body?.rows) ? body.rows : (body?.row ? [body.row] : []);
  if (!table || !rows.length) return apiError(ctx.rid, 400, "bad_request", "Provide { table, rows: [...] }.");
  if (!(TABLES as readonly string[]).includes(table)) return apiError(ctx.rid, 400, "bad_request", `table must be one of: ${TABLES.join(", ")}.`);
  /*
    A CONNECTOR KEY (connector:write — e.g. the Tally bridge) syncs books, not
    a sales feed: no leads, and batches sized by plan. It reaches this route on
    every plan, so these are the lines that keep it what it says it is.
  */
  const K = await import("@/lib/api-keys");
  if (ctx.scope === "connector:write") {
    if (!(K.CONNECTOR_TABLES as readonly string[]).includes(table)) {
      return apiError(ctx.rid, 403, "insufficient_scope", `A connector key can write ${K.CONNECTOR_TABLES.join(", ")}. Pushing ${table} needs a key with ingest:write. Nothing was written.`);
    }
    const cap = K.connectorRowsPerCall(ctx.plan);
    if (rows.length > cap) {
      return apiError(ctx.rid, 413, "payload_too_large", `Too many rows for one connector call on your plan (${rows.length}; at most ${cap}). Split the batch — the Tally bridge does this for you. Nothing was written.`);
    }
  }

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

    The rate limit (in apiAuth) is keyed on the key's row id, not the IP: a
    server-to-server integration has one key and may legitimately move IPs.
    The hourly allowance is per plan (lib/api-keys.ts API_LIMITS) — 60 calls
    on the smallest, i.e. up to 600k rows an hour, far above a real
    integration and far below anything that threatens the database.
  */
  const MAX_ROWS = 10_000;
  if (rows.length > MAX_ROWS) {
    return apiError(ctx.rid, 413, "payload_too_large",
      `Too many rows in one call (${rows.length}). Send at most ${MAX_ROWS} — split the batch and repeat. Nothing was written.`);
  }

  /*
    SERVICE CLIENT, AFTER THE LIMITS ABOVE. api_ingest is granted to
    service_role only (2026_zzzt) and re-checks the key itself — revoked,
    expired and out-of-scope included (2026_zzzw) — and scopes every write to
    that key's workspace.
  */
  const { data, error } = await svc.rpc("api_ingest", { p_key: key, p_table: table, p_rows: rows });
  /* The database's own wording stays in our logs, not in a third party's integration. */
  /*
    A DATA error is the caller's to fix (400); anything else is ours (500).
    Every database failure used to come back as 400 "check your types", so an
    outage or a broken migration told integrators their data was wrong — and a
    well-behaved client does not retry a 400. SQLSTATE class 22 (bad value:
    number, date, length) and 23 (constraint) are data; the rest is internal.
  */
  if (error) {
    const code = String((error as any).code || "");
    if (/^2[23]/.test(code)) {
      return apiError(ctx.rid, 400, "bad_request", "The rows could not be written. Check types (numbers, YYYY-MM-DD dates) and retry. Nothing was written.");
    }
    console.error("[api/v1/ingest] api_ingest failed (not a data error):", code, error.message);
    return apiError(ctx.rid, 500, "internal", "Something went wrong on our side. Nothing was written — it is safe to retry.");
  }

  // An invalid key used to come back inside a 200, so integrators never noticed
  // their pipeline was silently doing nothing.
  const result = (data || {}) as any;
  if (result.ok === false) {
    const unauthorised = /invalid api key/i.test(String(result.error || ""));
    return apiError(ctx.rid, unauthorised ? 401 : 400, unauthorised ? "invalid_key" : "bad_request", String(result.error || "Not written."));
  }

  // Refresh the dashboard KPIs for the key's workspace, so data pushed through
  // the API shows up immediately like a UI import does.
  try {
    await recomputeQuietly(ctx.orgId);
    /* LLM01 tripwire: data pushed from outside is where an injection is planted. */
    const { flagSuspiciousRows } = await import("@/lib/ingest-scan");
    await flagSuspiciousRows(ctx.orgId, "the public API", rows);
  } catch { /* swept nightly */ }

  const { ok: _ok, ...rest } = result;
  return apiOk(ctx.rid, rest);
}
