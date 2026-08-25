import "server-only";
import { gzipSync } from "zlib";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Logical backup of every application table.
 *
 * WHY THIS EXISTS: the project is on Supabase's free tier, which has no
 * automated backups and no point-in-time recovery. Until today there was
 * literally no way back from a bad migration, a mistaken DELETE, or a bug that
 * wrote over a customer's ledger. For a product that holds other companies'
 * financial records that is the single largest unmanaged risk in the system.
 *
 * WHAT THIS IS NOT: this is not a substitute for Supabase Pro's daily backups
 * and PITR. It is a logical row export. It does not capture schema, functions,
 * RLS policies, triggers, auth.users, or storage objects — the SQL migrations
 * in supabase/migrations cover the schema, and auth users are the gap you would
 * feel most in a true disaster. It also cannot give you "the state at 14:32";
 * you get the state at the time of the snapshot. Treat it as the thing that
 * saves you from your own mistakes, not from losing the project.
 *
 * TRUNCATION IS REPORTED, NOT HIDDEN. A backup that silently drops rows is
 * worse than no backup, because you will trust it. Every table records whether
 * it was capped, and `complete` is false if anything was capped or errored.
 */

/**
 * Explicit list rather than introspection. A table added later will be missing
 * from the backup until someone adds it here — which is a visible omission in a
 * code review, whereas a clever auto-discovery query that quietly stops
 * matching is not.
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

/** Rows fetched per request. PostgREST defaults to 1000; asking for more per
 *  round-trip is the difference between a backup that finishes and one that
 *  hits the function timeout. */
const PAGE = 1000;

/** Per-table ceiling. Chosen so the whole export stays well inside a serverless
 *  function's memory; a table that exceeds it is flagged, never silently cut. */
const MAX_ROWS_PER_TABLE = 50_000;

export type TableResult = {
  table: string;
  rows: number;
  truncated: boolean;
  error?: string;
};

export type BackupManifest = {
  takenAt: string;
  project: string;
  tables: TableResult[];
  totalRows: number;
  complete: boolean;
  notes: string[];
};

export type BackupResult =
  | { ok: true; manifest: BackupManifest; gz: Buffer; filename: string }
  | { ok: false; error: string };

async function dumpTable(sb: any, table: string): Promise<{ rows: any[]; result: TableResult }> {
  const rows: any[] = [];
  let from = 0;
  try {
    for (;;) {
      const to = from + PAGE - 1;
      const { data, error } = await sb.from(table).select("*").range(from, to);
      // A table that does not exist is a fact worth recording, not a crash:
      // one renamed table should not cost you the other forty-five.
      if (error) return { rows, result: { table, rows: rows.length, truncated: false, error: error.message } };
      const batch = (data as any[]) || [];
      rows.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
      if (rows.length >= MAX_ROWS_PER_TABLE) {
        return { rows, result: { table, rows: rows.length, truncated: true } };
      }
    }
    return { rows, result: { table, rows: rows.length, truncated: false } };
  } catch (e: any) {
    return { rows, result: { table, rows: rows.length, truncated: false, error: e?.message || "unknown error" } };
  }
}

/**
 * Produce a gzipped JSON snapshot of every table.
 *
 * Sequential on purpose. Firing 46 concurrent range queries at the free tier's
 * connection pool is how you turn a backup into an outage for the customers
 * using the app at the time.
 */
export async function createBackup(): Promise<BackupResult> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured, so a backup cannot be taken." };

  const takenAt = new Date().toISOString();
  const data: Record<string, any[]> = {};
  const results: TableResult[] = [];

  for (const table of BACKUP_TABLES) {
    const { rows, result } = await dumpTable(sb, table);
    data[table] = rows;
    results.push(result);
  }

  const totalRows = results.reduce((n, r) => n + r.rows, 0);
  const failed = results.filter((r) => r.error);
  const capped = results.filter((r) => r.truncated);

  const notes: string[] = [
    "Row data only. Schema lives in supabase/migrations; auth.users and storage objects are NOT included.",
  ];
  if (failed.length) notes.push(`${failed.length} table(s) could not be read: ${failed.map((f) => f.table).join(", ")}.`);
  if (capped.length) notes.push(`${capped.length} table(s) hit the ${MAX_ROWS_PER_TABLE.toLocaleString()}-row cap and are INCOMPLETE: ${capped.map((c) => c.table).join(", ")}.`);

  const manifest: BackupManifest = {
    takenAt,
    project: process.env.NEXT_PUBLIC_SUPABASE_URL || "unknown",
    tables: results,
    totalRows,
    complete: failed.length === 0 && capped.length === 0,
    notes,
  };

  const gz = gzipSync(Buffer.from(JSON.stringify({ manifest, data }), "utf8"));
  const stamp = takenAt.slice(0, 19).replace(/[:T]/g, "-");
  return { ok: true, manifest, gz, filename: `cortex-backup-${stamp}.json.gz` };
}
