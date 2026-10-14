/*
  THE WORKSPACE EXPORT, SHARED BY /api/export AND THE PRE-DELETION EXPORT.

  Both used to read each table with one `select("*").eq("org_id")`:

    - PostgREST caps a response at max-rows (1000 by default) and says nothing,
      so a busy workspace's invoices came out as the first thousand.
    - `{ data }` was read and `{ error }` ignored, so a table that failed to
      read came out as `[]` — indistinguishable from "you had none".
    - The Settings list had 17 tables; leads, quotes, collections, memories,
      approvals, the credit ledger, goals and two dozen more were missing.

  This is the backup offered immediately before an irreversible delete. A
  partial file that looks complete is worse than a refusal, so:

    - every table is paged to the end (pageAll), in a stable order;
    - ANY read error, or a table too big to read in full, fails the WHOLE
      export with the table named — the caller returns non-200;
    - a table that does not exist in this deployment (migration not applied) is
      not an error and is listed under `absent`, so the file says so.

  The list is every table with an org_id in supabase/ (derived from the
  migrations), plus chat_messages (keyed by thread) and referrals (keyed by
  referrer/referred org). Excluded on purpose, and why:
    payments          another product's table in this project (lib/pay/table.ts)
    org_billing_log   defined, never applied, read by nothing
    funnel_events, lifecycle_sends, operator_alerts
                      our own telemetry / send ledger / incident queue about the
                      workspace, not the workspace's data

  Pure on purpose (no "server-only", relative .ts import) so scripts/ can run it.
*/
import { pageAll } from "../../../lib/page-all.ts";

type Spec = { table: string; order?: string[] };

/** Ordering columns for tables whose key is not `id`. Paging without a stable
 *  order can skip and duplicate rows between pages. */
const ORDER: Record<string, string[]> = {
  collection_policies: ["org_id"],
  memory_profile: ["org_id"],
  metric_snapshots: ["metric_key", "as_of"],
  weekly_plan_sends: ["week"],
  app_settings: ["key"],
  action_policies: ["action"],
  api_usage_daily: ["key_id", "endpoint", "day"],
  cortex_payments: ["order_id"],
  payment_intents: ["order_id"],
  checkout_followups: ["order_id"],
};

export const WORKSPACE_TABLES: string[] = [
  "memberships", "invites",
  "subscriptions", "cortex_payments", "payment_intents", "checkout_followups", "credit_ledger", "renewal_notices",
  "customers", "leads", "sales_pipeline", "sales_orders", "purchase_orders",
  "invoices", "quotes", "vendors", "finance_ledger", "inventory_items",
  "employees", "meetings", "production_runs",
  "collection_policies", "collection_threads", "collection_messages",
  "chat_threads",
  "health_metrics", "alerts", "alert_rules", "activity", "ai_insights", "goals",
  "documents", "strategy_docs", "market_reports", "report_links",
  "memories", "memory_entities", "memory_links", "memory_profile",
  "agent_specs", "agent_runs", "workflows", "workflow_runs",
  "action_tasks", "action_proposals", "action_policies", "decisions",
  "integrations", "api_keys", "api_key_events", "api_usage_daily",
  "webhook_endpoints", "webhook_deliveries",
  "email_campaigns", "campaign_recipients", "email_templates", "email_replies", "email_sends",
  "scheduled_reports", "weekly_plan_sends", "metric_snapshots", "visibility_runs", "media_assets",
  "app_settings",
];

/** Columns replaced with "[redacted]". Live credentials must not leave in a
 *  file that gets copied to laptops; knowing WHICH integration/key existed is
 *  the customer's data, the secret is not (and is useless once deleted). */
export const EXPORT_REDACT: Record<string, string[]> = {
  api_keys: ["key", "key_hash"],
  webhook_endpoints: ["secret"],
  integrations: ["config", "credentials", "credentials_encrypted", "api_key", "token", "secret"],
  report_links: ["token"],
};

/** app_settings is key/value: redact the value of any secret-looking key. */
export const SECRET_SETTING = /secret|token|key|password/i;

export function redactRows(table: string, rows: any[], mark = "[redacted]"): any[] {
  const cols = EXPORT_REDACT[table];
  if (table === "app_settings") {
    return rows.map((r) => (r && SECRET_SETTING.test(String(r.key ?? "")) && r.value != null ? { ...r, value: mark } : r));
  }
  if (!cols?.length) return rows;
  return rows.map((r) => {
    const c = { ...r };
    for (const k of cols) if (k in c && c[k] != null) c[k] = mark;
    return c;
  });
}

/** "This table does not exist here" — a migration not applied — as opposed to a
 *  real failure. Only these are tolerated. */
export function isMissingTable(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /could not find the table|relation "?[\w.]+"? does not exist/i.test(String(err.message || ""));
}

export type CollectResult =
  | { ok: true; data: Record<string, any[]>; counts: Record<string, number>; absent: string[] }
  | { ok: false; error: string; table: string };

/** Per-table ceiling. Past this we refuse rather than hand over a partial file. */
const MAX_ROWS = 200_000;

type Page = { data: any[] | null; error: { message: string; code?: string } | null };

async function readTable(
  sb: any, table: string, orgId: string, max: number,
): Promise<{ rows: any[]; error: { message: string; code?: string } | null; truncated: boolean }> {
  const order = ORDER[table] || ["id"];
  let lastErr: { message: string; code?: string } | null = null;
  const r = await pageAll<any>((a, b) => {
    let q = sb.from(table).select("*");
    q = table === "referrals"
      ? q.or(`referrer_org_id.eq.${orgId},referred_org_id.eq.${orgId}`)
      : q.eq("org_id", orgId);
    for (const c of order) q = q.order(c, { ascending: true });
    return (q.range(a, b) as PromiseLike<Page>).then((res) => { if (res.error) lastErr = res.error; return res; });
  }, { max: max + 1 });
  /* Ask for one row more than the ceiling: pageAll's short-page test compares
     against the page size, so a final page clipped by `max` reads as "done".
     Getting max+1 rows back is the unambiguous "there is more". */
  return {
    rows: r.rows.slice(0, max),
    error: r.error ? (lastErr || { message: r.error }) : null,
    truncated: r.truncated || r.rows.length > max,
  };
}

/**
 * Read every workspace table in full, or fail.
 * @param sb a supabase client (service role for the owner's pre-deletion
 *           export; the member's RLS client for /api/export).
 */
export async function collectWorkspace(
  sb: any, orgId: string, opts: { extraTables?: string[]; concurrency?: number; maxRows?: number } = {},
): Promise<CollectResult> {
  const tables = [...WORKSPACE_TABLES, "referrals", ...(opts.extraTables || [])];
  const max = opts.maxRows ?? MAX_ROWS;
  const data: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  const absent: string[] = [];
  const st: { failure: { error: string; table: string } | null } = { failure: null };

  const note = (table: string, res: { rows: any[]; error: any; truncated: boolean }): boolean => {
    if (res.error) {
      if (isMissingTable(res.error)) { absent.push(table); return true; }
      st.failure = st.failure || { table, error: `Could not read ${table}: ${res.error.message || "unknown error"}` };
      return false;
    }
    if (res.truncated) {
      st.failure = st.failure || { table, error: `${table} has more than ${max.toLocaleString("en-IN")} rows — too large to export in one file. Nothing was exported; contact support for a full export.` };
      return false;
    }
    data[table] = redactRows(table, res.rows);
    counts[table] = res.rows.length;
    return true;
  };

  // Bounded concurrency: fast enough for the 25s first-byte window, without
  // firing sixty queries at the pool at once.
  const queue = [...tables];
  const workers = Array.from({ length: Math.max(1, opts.concurrency ?? 6) }, async () => {
    for (let t = queue.shift(); t !== undefined && !st.failure; t = queue.shift()) {
      try { note(t, await readTable(sb, t, orgId, max)); }
      catch (e: any) { st.failure = st.failure || { table: t, error: `Could not read ${t}: ${e?.message || "unknown error"}` }; }
    }
  });
  await Promise.all(workers);
  if (st.failure) return { ok: false, ...st.failure };

  // chat_messages has no org_id; it hangs off chat_threads.
  const threadIds = (data.chat_threads || []).map((t: any) => t.id).filter(Boolean);
  if (threadIds.length) {
    const msgs: any[] = [];
    for (let i = 0; i < threadIds.length; i += 100) {
      const ids = threadIds.slice(i, i + 100);
      const r = await pageAll<any>((a, b) => sb.from("chat_messages").select("*").in("thread_id", ids)
        .order("id", { ascending: true }).range(a, b), { max: max + 1 });
      if (r.error) return { ok: false, table: "chat_messages", error: `Could not read chat_messages: ${r.error}` };
      if (r.truncated || r.rows.length > max) return { ok: false, table: "chat_messages", error: `chat_messages is too large to export in one file. Nothing was exported; contact support.` };
      msgs.push(...r.rows);
    }
    data.chat_messages = msgs;
    counts.chat_messages = msgs.length;
  } else if (!absent.includes("chat_threads")) {
    data.chat_messages = [];
    counts.chat_messages = 0;
  }

  return { ok: true, data, counts, absent: absent.sort() };
}
