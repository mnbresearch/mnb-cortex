import "server-only";
import { gzipSync } from "zlib";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Logical backup of every application table.
 *
 * WHY THIS EXISTS: the project is on Supabase's free tier, which has no
 * automated backups and no point-in-time recovery. Until now there was
 * literally no way back from a bad migration, a mistaken DELETE, or a bug that
 * wrote over a customer's ledger. For a product holding other companies'
 * financial records that was the largest unmanaged risk in the system.
 *
 * WHAT THIS IS NOT — and these limits are real, not disclaimers:
 *
 *  - Row data only, no schema. The schema does live in this repo — across
 *    supabase/schema.sql, supabase/migration_*.sql and supabase/migrations/ —
 *    and `npm run rehearse:restore` builds 52 tables from it, so a restore has
 *    somewhere to land. But that schema is maintained by hand and the live
 *    database is edited through the Supabase dashboard, so it can drift.
 *    `npm run dump:schema` compares the two.
 *  - No auth.users. Restoring rows would leave every foreign key to a user
 *    pointing at nobody. This is the real remaining hole.
 *  - No storage objects.
 *  - Not a consistent snapshot. Table 1 is read minutes before table 47, so a
 *    restore can hit foreign keys that were written in between.
 *  - user_org_ids(), which the RLS policies depend on, is defined nowhere in
 *    the repo — it exists only in the live database.
 *
 * The restore path IS tested: scripts/rehearse-restore.mjs runs
 * backup → wipe → restore → verify against a real PostgreSQL on every run of
 * `npm run rehearse:restore`.
 *
 * Treat it as protection against your own mistakes, not against losing the
 * project. Supabase Pro's PITR is the real answer and this does not replace it.
 *
 * SECRETS ARE REDACTED. api_keys.key and webhook_endpoints.secret are stored in
 * plaintext and are live bearer credentials — a customer's API key grants write
 * access to their workspace, and a webhook secret lets you forge signed calls at
 * their servers. A backup file is copied to laptops and cloud drives; it must
 * not be a portable, non-expiring credential store. They come out as
 * "[REDACTED]" and must be reissued after any restore.
 *
 * TRUNCATION AND LOSS ARE REPORTED, NEVER HIDDEN. A backup that silently drops
 * rows is worse than no backup, because you will trust it.
 */

/**
 * Explicit list rather than introspection. A table added later will be missing
 * until someone adds it here — a visible omission in code review, unlike a
 * clever auto-discovery query that quietly stops matching.
 */
export const BACKUP_TABLES = [
  "organizations", "memberships", "profiles", "invites",
  "subscriptions", "payments", "credit_ledger", "renewal_notices",
  "customers", "leads", "sales_pipeline", "sales_orders", "purchase_orders",
  "invoices", "finance_ledger", "inventory_items", "employees", "meetings",
  "health_metrics", "alerts", "activity", "ai_insights",
  "documents", "strategy_docs", "market_reports", "report_links",
  "memories", "memory_entities", "memory_links", "memory_profile",
  "agent_specs", "agent_runs", "workflows", "workflow_runs",
  "integrations", "api_keys", "webhook_endpoints", "webhook_deliveries",
  "email_campaigns", "campaign_recipients", "email_templates", "email_replies",
  "email_optouts", "weekly_email_sends", "scheduled_reports",
  "app_settings", "system_status",
];

/**
 * Columns blanked on the way out. integrations.credentials_encrypted is NOT
 * here on purpose: it is AES-GCM sealed with ENCRYPTION_KEY, which lives in
 * Vercel and never enters this file, so the ciphertext is inert on its own and
 * is worth keeping for a restore.
 */
const REDACT: Record<string, string[]> = {
  api_keys: ["key"],
  webhook_endpoints: ["secret"],
};

/** Rows per request. PostgREST's default max-rows is 1000; asking for exactly
 *  that is deliberate but leaves no margin — see the short-page check below. */
const PAGE = 1000;

/** Per-table ceiling. */
const MAX_ROWS_PER_TABLE = 50_000;

/** Global ceiling. The per-table cap alone permits 47 × 50,000 = 2.35M rows,
 *  which would exhaust a serverless function's memory long before it was hit —
 *  everything is held as parsed objects, then a JSON string, then a Buffer,
 *  then gzip output, all at once. Stopping deliberately and saying so beats
 *  being OOM-killed. */
const MAX_ROWS_TOTAL = 400_000;

export type TableResult = {
  table: string;
  rows: number;
  expected?: number | null;
  truncated: boolean;
  ordered: boolean;
  error?: string;
  mismatch?: string;
};

export type BackupManifest = {
  takenAt: string;
  finishedAt: string;
  project: string;
  tables: TableResult[];
  totalRows: number;
  complete: boolean;
  redacted: Record<string, string[]>;
  limitations: string[];
  notes: string[];
};

export type BackupResult =
  | { ok: true; manifest: BackupManifest; gz: Buffer; filename: string }
  | { ok: false; error: string };

function scrub(table: string, rows: any[]): any[] {
  const cols = REDACT[table];
  if (!cols?.length) return rows;
  return rows.map((r) => {
    const c = { ...r };
    for (const k of cols) if (k in c && c[k] != null) c[k] = "[REDACTED]";
    return c;
  });
}

async function dumpTable(sb: any, table: string, budget: number): Promise<{ rows: any[]; result: TableResult }> {
  // Exact count first. Comparing it against what we actually collected is the
  // only way to catch the failure mode that matters: pages that overlap or skip
  // and still look like a clean finish.
  let expected: number | null = null;
  try {
    const { count } = await sb.from(table).select("*", { count: "exact", head: true });
    expected = typeof count === "number" ? count : null;
  } catch { /* a missing count is not fatal; it just weakens verification */ }

  const rows: any[] = [];
  let ordered = true;
  let from = 0;

  try {
    for (;;) {
      const to = from + PAGE - 1;

      // ORDER BY is not cosmetic. Postgres gives no ordering guarantee without
      // it, and two LIMIT/OFFSET queries can disagree about row order — so
      // pages silently overlap and skip. That produces a backup that is missing
      // rows and reports itself complete, which is the exact outcome this
      // module exists to prevent.
      let q = sb.from(table).select("*").range(from, to);
      if (ordered) q = q.order("id", { ascending: true });
      let { data, error } = await q;

      // Not every table has an `id` (app_settings is keyed org_id+key). Fall
      // back to unordered, but record it so the manifest never implies a
      // guarantee we didn't get.
      if (error && ordered && /column .*id.* does not exist|42703/i.test(`${error.message} ${(error as any).code || ""}`)) {
        ordered = false;
        ({ data, error } = await sb.from(table).select("*").range(from, to));
      }

      if (error) {
        return { rows, result: { table, rows: rows.length, expected, truncated: false, ordered, error: error.message } };
      }

      const batch = (data as any[]) || [];
      rows.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;

      if (rows.length >= MAX_ROWS_PER_TABLE || rows.length >= budget) {
        return { rows, result: { table, rows: rows.length, expected, truncated: true, ordered } };
      }
    }

    const result: TableResult = { table, rows: rows.length, expected, truncated: false, ordered };
    if (expected != null && expected !== rows.length) {
      result.mismatch = `expected ${expected} rows, collected ${rows.length}`;
    }
    return { rows, result };
  } catch (e: any) {
    return { rows, result: { table, rows: rows.length, expected, truncated: false, ordered, error: e?.message || "unknown error" } };
  }
}

/**
 * Produce a gzipped JSON snapshot of every table.
 *
 * Sequential on purpose. Firing 47 concurrent range queries at the free tier's
 * connection pool would turn a backup into an outage for whoever is using the
 * app at the time.
 */
export async function createBackup(): Promise<BackupResult> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured, so a backup cannot be taken." };

  const takenAt = new Date().toISOString();
  const data: Record<string, any[]> = {};
  const results: TableResult[] = [];
  let used = 0;

  for (const table of BACKUP_TABLES) {
    const { rows, result } = await dumpTable(sb, table, Math.max(0, MAX_ROWS_TOTAL - used));
    data[table] = scrub(table, rows);
    results.push(result);
    used += rows.length;
  }

  const totalRows = used;
  const failed = results.filter((r) => r.error);
  const capped = results.filter((r) => r.truncated);
  const mismatched = results.filter((r) => r.mismatch);
  const unordered = results.filter((r) => !r.ordered);

  const notes: string[] = [];
  if (failed.length) notes.push(`${failed.length} table(s) could not be read: ${failed.map((f) => f.table).join(", ")}.`);
  if (capped.length) notes.push(`${capped.length} table(s) hit a row cap and are INCOMPLETE: ${capped.map((c) => c.table).join(", ")}.`);
  if (mismatched.length) notes.push(`${mismatched.length} table(s) returned a different number of rows than the server counted — treat these as unreliable: ${mismatched.map((m) => `${m.table} (${m.mismatch})`).join("; ")}.`);
  if (unordered.length) notes.push(`${unordered.length} table(s) had no 'id' to page by and were read unordered: ${unordered.map((u) => u.table).join(", ")}. Rows may be duplicated or missing if the table changed mid-read.`);
  if (totalRows >= MAX_ROWS_TOTAL) notes.push(`The global ${MAX_ROWS_TOTAL.toLocaleString()}-row ceiling was reached; later tables may be empty or short.`);

  const manifest: BackupManifest = {
    takenAt,
    finishedAt: new Date().toISOString(),
    project: process.env.NEXT_PUBLIC_SUPABASE_URL || "unknown",
    tables: results,
    totalRows,
    // "complete" means every table was read in full, in a verifiable order,
    // and matched the server's own count. Anything less is not complete.
    complete: failed.length === 0 && capped.length === 0 && mismatched.length === 0 && unordered.length === 0,
    redacted: REDACT,
    limitations: [
      "Row data only. The schema is in the repo (supabase/schema.sql + migrations) but is maintained by hand and can drift from live — run `npm run dump:schema` to check.",
      "Does not include auth.users, so restored rows would reference users that no longer exist.",
      "Does not include Supabase Storage objects.",
      "Not a point-in-time snapshot: tables are read one after another over minutes.",
      "api_keys.key and webhook_endpoints.secret are redacted and must be reissued after a restore.",
      "Restore path is tested by `npm run rehearse:restore` against a real PostgreSQL. Restore with `node scripts/restore.mjs <file> > restore.sql`.",
    ],
    notes,
  };

  const gz = gzipSync(Buffer.from(JSON.stringify({ manifest, data }), "utf8"));
  const stamp = takenAt.slice(0, 19).replace(/[:T]/g, "-");
  return { ok: true, manifest, gz, filename: `cortex-backup-${stamp}.json.gz` };
}
