#!/usr/bin/env node
/**
 * Turn a Cortex backup (.json.gz from /api/admin/backup) into reviewable SQL.
 *
 *   node scripts/restore.mjs cortex-backup-2026-08-26-05-12-33.json.gz > restore.sql
 *   node scripts/restore.mjs backup.json.gz --only=customers,invoices > partial.sql
 *   node scripts/restore.mjs backup.json.gz --check          # inspect, emit nothing
 *
 * WHY IT PRINTS SQL INSTEAD OF WRITING TO THE DATABASE
 *
 * A restore happens on the worst day of the quarter, usually at speed, usually
 * by someone frightened. A tool that connects to a live database and starts
 * writing is the wrong shape for that moment: there is no pause to read, no
 * diff, and a mistyped target destroys the one copy you had left. Emitting a
 * file means you can read it, grep it, restore one table, and hand it to
 * someone else to check before anything is written.
 *
 * It also means this script has no database driver and no credentials — it
 * cannot destroy anything by itself.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 *
 *  - It will not emit anything for a backup whose manifest says complete:false,
 *    unless you pass --force. Restoring a knowingly-partial backup over live
 *    data is how you turn one bad day into an unrecoverable one.
 *  - It does not DROP or TRUNCATE. Ever. Restoring INTO a populated table is a
 *    decision, so the emitted SQL uses ON CONFLICT DO NOTHING and tells you
 *    what to do if you actually want a replacement.
 *  - It does not restore api_keys.key or webhook_endpoints.secret, which are
 *    redacted in the backup by design. Those must be reissued.
 */

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const force = args.includes("--force");
const checkOnly = args.includes("--check");
const only = (args.find((a) => a.startsWith("--only=")) || "").replace("--only=", "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Everything human-facing goes to stderr so `> restore.sql` stays pure SQL.
const say = (...m) => console.error(...m);

if (!file) {
  say("usage: node scripts/restore.mjs <backup.json.gz> [--only=t1,t2] [--check] [--force]");
  process.exit(2);
}

let payload;
try {
  payload = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
} catch (e) {
  say(`Could not read ${file}: ${e.message}`);
  process.exit(1);
}

const { manifest, data } = payload;
if (!manifest || !data) {
  say("That file does not look like a Cortex backup (no manifest/data).");
  process.exit(1);
}

say(`Backup taken:  ${manifest.takenAt}`);
say(`Project:       ${manifest.project}`);
say(`Rows:          ${Number(manifest.totalRows || 0).toLocaleString()}`);
say(`Complete:      ${manifest.complete}`);
for (const n of manifest.notes || []) say(`  ! ${n}`);
say("");

if (!manifest.complete && !force) {
  say("REFUSING: this backup reports itself INCOMPLETE.");
  say("Restoring a partial backup over live data can destroy rows the backup was missing.");
  say("Read the notes above. If you have decided it is safe, re-run with --force.");
  process.exit(1);
}
if (!manifest.complete && force) {
  say("PROCEEDING ON AN INCOMPLETE BACKUP because --force was given. Rows may be missing.");
  say("");
}

/** Postgres literal. Everything becomes text/JSON and is cast by the column type. */
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

// Restore order matters: a child row whose parent does not exist yet fails on
// the foreign key. BACKUP_TABLES is already ordered parents-first, and the
// backup preserves that ordering, so we simply follow it.
/*
  auth_users is NOT a table. It is the Supabase auth schema, captured through the
  Admin API, and it cannot be restored with an INSERT — Supabase owns that schema
  and the export deliberately carries no passwords. Emitting SQL for it would
  produce a file that fails halfway through, on the most important statement in
  the restore.

  It is reported here instead, so whoever is running the restore knows the
  accounts exist in the file and how to bring them back.
*/
/*
  THE SIX TABLES THAT CANNOT LAND UNTIL THE AUTH ACCOUNTS EXIST.

  Each has a foreign key to auth.users, and auth.users is precisely what this
  file cannot recreate. Until now every table went into ONE transaction, so the
  first `profiles` row referencing a deleted account raised

      insert or update on table "profiles" violates foreign key constraint
      "profiles_id_fkey"

  and the COMMIT never came — rolling back the customers, the invoices, the
  ledger, the entire restore, over a login. The rehearsal did not catch it
  because it only ever seeded tables with no auth dependency.

  So they are emitted LAST, each in a transaction of its own. If the accounts
  are not back yet, you lose exactly these six and keep everything else; if
  profiles fails, memberships still gets its chance. Re-running the file after
  recreating the accounts fills them in, because every insert is ON CONFLICT
  DO NOTHING.

  The list is not maintained by hand alone: scripts/rehearse-restore.mjs derives
  the same set from pg_constraint against a real build of the schema and fails
  if the two disagree, so a seventh such table cannot appear unnoticed.
*/
/* Six tables reference auth.users directly:

     profiles          id IS the auth user id — no account, no row
     memberships       user_id NOT NULL
     chat_threads      user_id, nullable, but a present value is still checked
     integrations      created_by
     email_campaigns   created_by
     email_templates   created_by

   and three more are children of those, so deferring only the six would have
   made things WORSE — chat_messages would have been inserted in the main
   transaction while chat_threads was still to come, and the foreign key that
   used to fail at the end would now fail in the middle, taking everything:

     chat_messages         → chat_threads
     campaign_recipients   → email_campaigns
     email_replies         → email_campaigns

   The whole dependency closure moves together. Order within it is parents
   first, inherited from BACKUP_TABLES, which the backup file preserves. */
const AUTH_DEPENDENT = [
  "profiles", "memberships",
  "chat_threads", "chat_messages",
  "integrations",
  "email_campaigns", "campaign_recipients", "email_templates", "email_replies",
];

const authUsers = Array.isArray(data.auth_users) ? data.auth_users : null;
const allTables = Object.keys(data)
  .filter((t) => t !== "auth_users")
  .filter((t) => !only.length || only.includes(t));
const tables = allTables.filter((t) => !AUTH_DEPENDENT.includes(t));
const authTables = allTables.filter((t) => AUTH_DEPENDENT.includes(t));

let statements = 0;
let rowsOut = 0;
const out = [];

out.push("-- Generated by scripts/restore.mjs — REVIEW BEFORE RUNNING.");
out.push(`-- Source backup: ${file}`);
out.push(`-- Taken at:      ${manifest.takenAt}`);
out.push(`-- Complete:      ${manifest.complete}`);
out.push("--");
out.push("-- The bulk of the data is in ONE transaction: it all lands or none of it does.");
out.push("-- The tables that reference Supabase auth accounts follow at the end, each in");
out.push("-- its own transaction, so a missing login cannot roll back your ledger.");
out.push("-- Inserts use ON CONFLICT DO NOTHING, so existing rows are left alone. If you");
out.push("-- intend to REPLACE a table, delete from it explicitly first, in your own");
out.push("-- statement, having thought about it.");
out.push("--");
out.push("-- NOT restored by this file: the database schema, Supabase auth accounts,");
out.push("-- storage objects, and the redacted columns below. Create the schema first");
out.push("-- (supabase/schema.sql, rls.sql, then the migrations) or every statement here");
out.push("-- will fail.");
for (const [t, cols] of Object.entries(manifest.redacted || {})) {
  out.push(`--   redacted: ${t}.${cols.join(", ")}  (reissue these after restoring)`);
}
out.push("");
out.push("BEGIN;");
out.push("");

/** Emit the INSERTs for one table. Batched so a single statement never becomes
 *  unreadably large — and so a failure tells you roughly where it happened. */
function emitTable(table) {
  const rows = data[table] || [];
  if (!rows.length) { out.push(`-- ${table}: 0 rows`); return; }

  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  out.push(`-- ${table}: ${rows.length} rows`);

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const values = slice
      .map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`)
      .join(",\n");
    out.push(
      `INSERT INTO ${JSON.stringify(table).replace(/"/g, '"')} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES\n${values}\nON CONFLICT DO NOTHING;`,
    );
    statements++;
  }
  rowsOut += rows.length;
  out.push("");
}

for (const table of tables) emitTable(table);

out.push("COMMIT;");
out.push("");

if (authTables.length) {
  out.push("-- ===========================================================================");
  out.push("-- TABLES THAT NEED THE AUTH ACCOUNTS BACK FIRST");
  out.push("--");
  out.push("-- Everything above is committed by this point and is not at risk from what");
  out.push("-- follows. These tables have foreign keys into auth.users, which this file");
  out.push("-- cannot recreate — Supabase owns that schema and the backup holds no");
  out.push("-- passwords by design.");
  out.push("--");
  out.push("-- If the accounts are not back yet, expect these to fail with");
  out.push("--   violates foreign key constraint \"…_fkey\"");
  out.push("-- and that is the intended outcome: you lose these tables, not the restore.");
  out.push("-- Recreate the users with the Admin API REUSING THE IDS printed by this");
  out.push("-- script, then run this same file again — every insert is ON CONFLICT DO");
  out.push("-- NOTHING, so the rows above are untouched and these fill in.");
  out.push("--");
  out.push("-- One transaction each, deliberately: profiles failing must not take");
  out.push("-- memberships, and neither must take the other four.");
  out.push("-- ===========================================================================");
  out.push("");
  for (const table of authTables) {
    out.push("BEGIN;");
    emitTable(table);
    out.push("COMMIT;");
    out.push("");
  }
}

if (authUsers) {
  say("");
  say(`AUTH ACCOUNTS: ${authUsers.length} user(s) are in this backup but are NOT in the SQL.`);
  say("  Supabase owns the auth schema, and the export carries no passwords by design.");
  say("  To bring people back, recreate them with the Admin API and let them sign in");
  say("  again by magic link or Google. Their ids are preserved in the file, so every");
  say("  membership, profile and activity row will re-link correctly if you reuse them:");
  for (const u of authUsers.slice(0, 5)) say(`    ${u.id}  ${u.email || "(no email)"}`);
  if (authUsers.length > 5) say(`    …and ${authUsers.length - 5} more (see auth_users in the JSON).`);
  say("");
}

say(`Tables:     ${tables.length + authTables.length}`);
if (authTables.length) {
  say(`  of which ${authTables.length} are deferred to their own transactions at the end of the`);
  say(`  file because they depend on auth accounts: ${authTables.join(", ")}`);
}
say(`Rows:       ${rowsOut.toLocaleString()}`);
say(`Statements: ${statements}`);

if (checkOnly) {
  say("\n--check given: no SQL written.");
  process.exit(0);
}

process.stdout.write(out.join("\n"));
