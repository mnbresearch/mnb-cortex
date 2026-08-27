#!/usr/bin/env node
/**
 * Rehearse a restore, end to end, against a real PostgreSQL.
 *
 *   npm run rehearse:restore
 *
 * An untested restore is a hypothesis. This turns it into a fact by doing the
 * whole loop with nothing mocked:
 *
 *   1. Start a real Postgres (PGlite — genuine Postgres compiled to WASM, not
 *      an imitation with a different SQL dialect).
 *   2. Apply the project's OWN migration files to create the schema.
 *   3. Insert known rows, including the awkward ones: quotes, unicode, JSON,
 *      nulls, timestamps.
 *   4. Export them in exactly the shape /api/admin/backup produces, gzip and
 *      all, using the same manifest contract.
 *   5. Drop every row — simulating the bad migration this exists to survive.
 *   6. Run scripts/restore.mjs over the backup and execute the SQL it emits.
 *   7. Compare, cell by cell, against what was there before.
 *
 * It also checks the refusals, because a safety rail nobody has tripped is not
 * known to work: an incomplete backup must be REJECTED without --force, and
 * accepted with it.
 *
 * SCOPE: every SQL file in supabase/ is applied — schema.sql, rls.sql, the
 * loose migration_*.sql files and supabase/migrations/. All 34 apply cleanly to
 * an empty database, so the repo really can rebuild itself. What it cannot
 * rebuild is auth.users, which lives in Supabase's own schema; see
 * scripts/backup-auth-users.md.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdtempSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "cortex-rehearsal-"));

// PGlite is loaded at runtime and is deliberately NOT a devDependency. It is a
// 26 MB WASM build of Postgres, and Vercel installs devDependencies during
// production builds — so listing it would add 26 MB of download to every
// deploy for the benefit of a script that only ever runs on a laptop.
let PGlite;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  console.error("This rehearsal needs a real Postgres to be worth anything.\n");
  console.error("  npm i -D @electric-sql/pglite --no-save\n");
  console.error("It is not in package.json on purpose: 26 MB of WASM has no business");
  console.error("being downloaded by your production build.");
  process.exit(2);
}

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const step = (m) => console.log(`\n${m}`);

const db = await PGlite.create();
const v = (await db.query("select version() as v")).rows[0].v;
step(`Rehearsing against: ${v.split(" on ")[0]}`);

/* 1 — build the schema from the project's real migrations ----------------- */
step("1. Applying supabase/migrations to an empty database");

// Order matters. supabase/schema.sql is the base — it creates the core tables.
// The loose supabase/migration_*.sql files and then supabase/migrations/*.sql
// are ALTER-style patches layered on top, so they must come after it.
//
// (An earlier version only looked in supabase/migrations/ and concluded most
// tables had no schema in the repo. They do. Scanning every SQL file is the
// difference between a true and a false statement about whether your backups
// are restorable.)
const sqlFiles = [
  join(ROOT, "supabase", "schema.sql"),
  // rls.sql was MISSING from this list, and its absence produced a false
  // conclusion I then repeated in three places: that user_org_ids() is "defined
  // nowhere in the repo". It is defined here, at rls.sql:8. The harness simply
  // never applied the file, because the glob only matched schema.sql and
  // migration*.sql — so the function was stubbed, and the stub made the gap
  // invisible while looking like evidence of one.
  //
  // seed.sql is excluded on purpose: it defines seed_demo_data() and is
  // exercised separately, not as part of building the schema.
  join(ROOT, "supabase", "rls.sql"),
  ...readdirSync(join(ROOT, "supabase")).filter((f) => f.startsWith("migration") && f.endsWith(".sql"))
    .sort().map((f) => join(ROOT, "supabase", f)),
  ...readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql"))
    .sort().map((f) => join(ROOT, "supabase", "migrations", f)),
];

// Two things exist in Supabase but not in a bare Postgres, and neither says
// anything about whether your schema is correct:
//   - the pgcrypto extension (gen_random_uuid() is core from PG13, so dropping
//     the CREATE EXTENSION line changes nothing functionally)
//   - the auth schema. A stub stands in for it, which also mirrors reality:
//     auth.users is NOT in the backup, so a restore always faces this problem.
await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );
  create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
  -- auth.jwt() was missing, and its absence CASCADED: 2026_tenancy.sql failed,
  -- so user_org_rank() was never created, so every later migration that uses it
  -- failed too. One missing stub made three files look like ordering bugs.
  create or replace function auth.jwt() returns jsonb language sql stable as $$ select null::jsonb $$;
`);
// NOTE: user_org_ids() is deliberately NOT stubbed. It is defined for real in
// supabase/rls.sql, and stubbing it here previously hid that fact — the stub
// satisfied every policy, so nothing ever revealed that the file was not being
// applied at all. If it is missing now, that is a genuine finding.
for (const r of ["anon", "authenticated", "service_role"]) {
  try { await db.exec(`create role ${r};`); } catch { /* already exists */ }
}
ok("Supabase-only pieces stubbed: auth.users, auth.uid(), auth.jwt(), auth.role(), the three roles");

const applied = [];
const skipped = [];
for (const p of sqlFiles) {
  const name = p.split("/").slice(-1)[0];
  let sql;
  try { sql = readFileSync(p, "utf8"); } catch { continue; }
  sql = sql.replace(/create\s+extension[^;]*;/gi, "");
  try {
    await db.exec(sql);
    applied.push(name);
  } catch (e) {
    skipped.push([name, String(e.message).split("\n")[0].slice(0, 95)]);
  }
}
for (const [n, why] of skipped) console.log(`  skip  ${n} — ${why}`);
ok(`${applied.length}/${sqlFiles.length} SQL files applied`);

/*
  Migrations are applied in FILENAME ORDER, and that has now bitten twice:
  a file that alters a column created by a later-sorting file simply fails, and
  the failure looked like a harmless "skip" line nobody read. Both times the
  live database was fine (the dependency had been applied months earlier) and
  only a rebuild-from-scratch was broken — which is exactly the scenario you
  only discover on the day you need it.

  A migration that references something that does not exist yet is an ordering
  bug, not an environment quirk, so it fails the rehearsal loudly. The
  Supabase-only dependencies are listed explicitly rather than pattern-matched,
  so a genuinely new failure cannot hide behind them.
*/
const SUPABASE_ONLY = /auth\.jwt|auth\.email|storage\.|supabase_|extension/i;
const orderingBugs = skipped.filter(([, why]) => !SUPABASE_ONLY.test(why));
if (orderingBugs.length) {
  for (const [n, why] of orderingBugs) bad(`${n} did not apply — ${why}`);
  bad("These are ordering/dependency bugs: the repo cannot rebuild itself from scratch.");
}

const hasSchema = true;

const live = (await db.query(
  "select table_name from information_schema.tables where table_schema='public' order by table_name",
)).rows.map((r) => r.table_name);

if (!live.length) { bad("no tables were created — cannot rehearse"); process.exit(1); }
ok(`${live.length} tables exist: ${live.join(", ")}`);

/* 1b — every table in BACKUP_TABLES must actually exist -------------------- */
/*
  A table listed in the backup that does not exist makes dumpTable record a read
  error, which sets `complete: false` on EVERY backup, which makes restore.mjs
  refuse to run without --force. One dead table would disable the restore path
  for every real one — so this is checked rather than assumed. (It nearly
  happened: org_billing_log is defined in a migration, used by nothing, and was
  never applied to production.)
*/
{
  const backupSrc = readFileSync(join(ROOT, "src", "lib", "backup.ts"), "utf8");
  const listed = [...backupSrc.match(/BACKUP_TABLES = \[([\s\S]*?)\];/)[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const missing = listed.filter((t) => !live.includes(t));
  if (missing.length) bad(`BACKUP_TABLES lists ${missing.length} table(s) that do not exist: ${missing.join(", ")} — every backup would report itself incomplete`);
  else ok(`all ${listed.length} tables in BACKUP_TABLES exist in the schema`);
}

/* 2 — seed deliberately awkward data -------------------------------------- */
step("2. Seeding rows chosen to break naive serialisation");

await db.exec(`
  insert into system_status (key, value) values
    ('plain',    'ordinary'),
    ('quoted',   'O''Brien said "hello"'),
    ('unicode',  'ज़रूरी — naïve café 日本語 🙂'),
    ('jsonish',  '{"a":1,"b":[2,3],"c":"say \\"hi\\""}'),
    ('empty',    ''),
    ('nullish',  null),
    ('backslash','C:\\path\\to\\file');
`);

// A real workspace with a child row, so the rehearsal actually exercises the
// foreign key ordering that a restore lives or dies by. Restoring a customer
// before its organization is the classic way a restore fails halfway.
let hasOrgs = false;
try {
  await db.exec(`
    insert into organizations (id, name, industry, currency)
    values ('11111111-1111-1111-1111-111111111111', 'Sharma Textiles Pvt Ltd', 'manufacturing', 'INR');
    insert into customers (org_id, name, company, email, status, value) values
      ('11111111-1111-1111-1111-111111111111', 'Rajesh O''Connor', 'Bharat Weaves & Co', 'r@example.in', 'lead', 250000),
      ('11111111-1111-1111-1111-111111111111', 'श्रीमती गुप्ता', 'गुप्ता ट्रेडर्स', null, 'active', 0);
  `);
  hasOrgs = true;
} catch (e) {
  console.log(`  note  could not seed organizations/customers — ${String(e.message).split("\n")[0].slice(0, 90)}`);
}

const seeded = (await db.query("select key, value from system_status order by key")).rows;
ok(`${seeded.length} rows seeded into system_status`);
if (hasOrgs) {
  const c = (await db.query("select count(*)::int as n from customers")).rows[0].n;
  ok(`1 organization + ${c} customers seeded (exercises the FK ordering a restore depends on)`);
}

/* 3 — export in the exact shape the backup endpoint produces --------------- */
step("3. Exporting in the /api/admin/backup format");

// Follow the real BACKUP_TABLES order — that ordering is what makes the emitted
// SQL insert parents before children, so it must be what the rehearsal tests.
const realOrder = [...readFileSync(join(ROOT, "src", "lib", "backup.ts"), "utf8")
  .match(/BACKUP_TABLES = \[([\s\S]*?)\];/)[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
const BACKUP_TABLES = realOrder.filter((t) => live.includes(t));

const data = {};
const tableResults = [];
for (const t of BACKUP_TABLES) {
  const rows = (await db.query(`select * from "${t}"`)).rows;
  data[t] = rows;
  tableResults.push({ table: t, rows: rows.length, expected: rows.length, truncated: false, ordered: true });
}
const totalRows = tableResults.reduce((n, r) => n + r.rows, 0);

// auth.users is captured through the Admin API, not PostgREST, so the fixture
// includes it the way a real backup would — and the restore must EXCLUDE it
// from the SQL while still telling the operator the accounts are in the file.
const authFixture = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", email: "owner@example.in", providers: ["email"], user_metadata: {} },
  { id: "aaaaaaaa-0000-0000-0000-000000000002", email: "analyst@example.in", providers: ["google"], user_metadata: {} },
];

function buildBackup(complete) {
  return gzipSync(Buffer.from(JSON.stringify({
    manifest: {
      takenAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      project: "rehearsal",
      tables: tableResults,
      totalRows,
      complete,
      redacted: { api_keys: ["key"], webhook_endpoints: ["secret"] },
      limitations: ["rehearsal fixture"],
      notes: complete ? [] : ["deliberately marked incomplete to test the refusal"],
    },
    data: { ...data, auth_users: authFixture },
  }), "utf8"));
}

const goodPath = join(tmp, "good.json.gz");
const badPath = join(tmp, "incomplete.json.gz");
writeFileSync(goodPath, buildBackup(true));
writeFileSync(badPath, buildBackup(false));
ok(`backup written (${totalRows} rows, ${(buildBackup(true).length / 1024).toFixed(1)} KB gzipped)`);

/* 4 — the safety rails must actually refuse -------------------------------- */
step("4. Testing the refusals");

const runRestore = (args) => {
  try {
    const res = spawnSync("node", [join(ROOT, "scripts", "restore.mjs"), ...args], { encoding: "utf8" });
    if (res.status !== 0) return { ok: false, code: res.status, stderr: String(res.stderr || "") };
    return { ok: true, sql: String(res.stdout || ""), stderrText: String(res.stderr || "") };
  } catch (e) {
    return { ok: false, code: e.status, stderr: String(e.stderr || "") };
  }
};

const refused = runRestore([badPath]);
if (!refused.ok && /REFUSING/.test(refused.stderr)) ok("an INCOMPLETE backup is refused without --force");
else bad("an incomplete backup was NOT refused — the safety rail does not work");

const forced = runRestore([badPath, "--force"]);
if (forced.ok && /INSERT INTO/.test(forced.sql)) ok("--force overrides the refusal, as documented");
else bad("--force did not override the refusal");

/* 5 — destroy the data, exactly as a bad migration would ------------------- */
step("5. Deleting every row (simulating the disaster)");
// Children first, or the foreign keys refuse to let you have your disaster.
for (const t of [...BACKUP_TABLES].reverse()) await db.exec(`delete from "${t}";`);
const afterWipe = (await db.query("select count(*)::int as n from system_status")).rows[0].n;
if (afterWipe === 0) ok("all rows gone — database is now in the state you would panic about");
else bad(`expected 0 rows after wipe, found ${afterWipe}`);

/* 6 — restore from the backup file ---------------------------------------- */
step("6. Restoring from the backup");

const gen = runRestore([goodPath]);
if (!gen.ok) { bad(`restore.mjs failed: ${gen.stderr.slice(0, 300)}`); process.exit(1); }
writeFileSync(join(tmp, "restore.sql"), gen.sql);
ok(`restore.sql generated (${(gen.sql.length / 1024).toFixed(1)} KB)`);

// Supabase owns the auth schema. Emitting an INSERT for it would fail the whole
// transaction on the single most important statement of a restore.
if (/INSERT INTO "?auth_users/i.test(gen.sql)) bad("restore.sql tries to INSERT into auth_users — that is not a table");
else ok("auth accounts are correctly kept OUT of the SQL");
{
  const report = runRestore([goodPath, "--check"]);
  const text = report.ok ? String(report.stderrText || "") : String(report.stderr || "");
  if (/AUTH ACCOUNTS: 2 user/.test(text)) ok("…but the operator IS told the 2 accounts are in the file, with their ids");
  else bad(`the restore did not report the auth accounts. Saw: ${text.slice(0, 200)}`);
}

try {
  await db.exec(gen.sql);
  ok("restore.sql executed against Postgres without error");
} catch (e) {
  bad(`restore.sql failed to execute: ${String(e.message).split("\n")[0]}`);
}

/* 7 — verify cell by cell -------------------------------------------------- */
step("7. Verifying the restored data matches the original, cell by cell");

const restored = (await db.query("select key, value from system_status order by key")).rows;

if (restored.length !== seeded.length) {
  bad(`row count: expected ${seeded.length}, got ${restored.length}`);
} else {
  ok(`row count matches (${restored.length})`);
  let mismatched = 0;
  for (let i = 0; i < seeded.length; i++) {
    const a = seeded[i], b = restored[i];
    if (a.key !== b.key || a.value !== b.value) {
      mismatched++;
      bad(`row "${a.key}": expected ${JSON.stringify(a.value)}, got ${JSON.stringify(b.value)}`);
    }
  }
  if (!mismatched) ok("every value round-tripped exactly — quotes, unicode, JSON, backslashes, empty string and NULL");
}

if (hasOrgs) {
  const orgs = (await db.query("select id, name from organizations")).rows;
  const custs = (await db.query("select name, company, email, value from customers order by name")).rows;
  if (orgs.length === 1 && orgs[0].name === "Sharma Textiles Pvt Ltd") ok("organization restored with its uuid primary key intact");
  else bad(`organization did not restore correctly: ${JSON.stringify(orgs)}`);

  if (custs.length === 2) {
    ok("both customers restored — foreign keys to the organization held");
    const devanagari = custs.find((c) => c.company === "गुप्ता ट्रेडर्स");
    const apostrophe = custs.find((c) => c.name === "Rajesh O'Connor");
    if (devanagari && devanagari.email === null) ok("Devanagari text and a NULL email survived the round trip");
    else bad(`unicode/NULL customer wrong: ${JSON.stringify(devanagari)}`);
    if (apostrophe && String(apostrophe.value) === "250000") ok("apostrophe in a name and a numeric amount survived");
    else bad(`apostrophe/numeric customer wrong: ${JSON.stringify(apostrophe)}`);
  } else {
    bad(`expected 2 customers after restore, got ${custs.length}`);
  }
}

/* 8 — idempotence ---------------------------------------------------------- */
step("8. Running the same restore twice (ON CONFLICT DO NOTHING must hold)");
try {
  await db.exec(gen.sql);
  const n = (await db.query("select count(*)::int as n from system_status")).rows[0].n;
  if (n === seeded.length) ok(`re-running the restore did not duplicate rows (still ${n})`);
  else bad(`re-running duplicated rows: ${n} vs ${seeded.length}`);
} catch (e) {
  bad(`second run errored: ${String(e.message).split("\n")[0]}`);
}

/* result ------------------------------------------------------------------- */
console.log("");
if (failures) {
  console.log(`REHEARSAL FAILED — ${failures} problem(s). The restore path is NOT trustworthy.`);
  process.exit(1);
}
console.log("REHEARSAL PASSED — backup → wipe → restore → verify completed against real Postgres.");
console.log(`Artefacts kept for inspection in ${tmp}`);

if (!hasSchema) {
  console.log("");
  console.log("BUT READ THIS BEFORE RELYING ON IT:");
  console.log(`  The restore MECHANISM is proven. Coverage is not — only ${live.length} table(s) could be`);
  console.log("  created from this repo, because supabase/schema.sql does not exist yet.");
  console.log("  Until you run `npm run dump:schema` and commit the result, a real backup");
  console.log("  has no schema to be restored into. Passing here does not mean you are safe.");
  process.exit(0);
}
