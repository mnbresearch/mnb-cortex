/*
  IF WE HAND THE OPERATOR A FILE TO RUN, THE PRODUCT MUST BE ABLE TO SAY
  WHETHER THEY RAN IT.

  Run with:  npm run test:schema-probes

  WHY THIS EXISTS

  checkSchema() in lib/health.ts probes a list of (table, column, file-to-run)
  triples and reports "Schema migrations: degraded — Not applied: X" for any it
  cannot select from. That check is the only thing in the product that answers
  "has the SQL been run", and the alternative is asking a human who may be
  wrong about which of a dozen pastes they got to.

  It went stale immediately. funnel_events, lifecycle_sends and the three
  leads columns were built, tested, committed, deployed — and never added to
  the probe list. So for days the honest answer to "did that migration land?"
  was "nobody can tell", while three features sat inert in production
  reporting nothing wrong. Two of them fail in the expensive direction: the
  funnel silently reads zero (indistinguishable from "nobody came"), and the
  lifecycle lock either sends nothing or sends the same nudge to a brand-new
  customer every morning.

  The list went stale because keeping it current was a thing to remember. This
  makes it a thing that fails.

  THE INVARIANT

  Every table created by, and every column added by, a supabase/RUN-*.sql file
  must be probed in lib/health.ts.

  Scoped to RUN-*.sql specifically — the files an operator pastes by hand —
  rather than all of supabase/migrations/. That is the exact population at
  risk: a migration applied by tooling either succeeded or failed loudly,
  whereas a file a person was asked to paste can simply never have been
  pasted, and nothing anywhere would know.
*/

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
const fails = [];
const check = (cond, name, detail = "") => {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

/* ---- what the operator is asked to run -------------------------------- */
const runFiles = readdirSync(join(ROOT, "supabase"))
  .filter((f) => /^RUN-.*\.sql$/.test(f))
  .sort();

check(runFiles.length > 0, "there are RUN-*.sql files to check", String(runFiles.length));

/** Tables and columns each hand-run file introduces. */
const created = new Map();   // table -> file that creates it
const addedCols = new Map(); // "table.col" -> file

for (const f of runFiles) {
  const sql = readFileSync(join(ROOT, "supabase", f), "utf8");

  for (const m of sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+([a-z_]+)/gi)) {
    if (!created.has(m[1])) created.set(m[1], f);
  }
  for (const m of sql.matchAll(/alter\s+table\s+([a-z_]+)\s+add\s+column\s+if\s+not\s+exists\s+([a-z_]+)/gi)) {
    const key = `${m[1]}.${m[2]}`;
    if (!addedCols.has(key)) addedCols.set(key, f);
  }
}

check(created.size > 0, "RUN files create at least one table", String(created.size));
check(addedCols.size > 0, "RUN files add at least one column", String(addedCols.size));

/* ---- what health.ts actually probes ----------------------------------- */
const health = readFileSync(join(ROOT, "src/lib/health.ts"), "utf8");

/*
  Parsed out of the probes array rather than imported: health.ts is
  `server-only` and reaches Supabase, so it cannot be loaded here. The array
  entries are a fixed literal shape — ["table", "column", "name"] — so this is
  a narrow, checkable bit of text extraction rather than general parsing.
*/
const probesBlock = health.slice(
  health.indexOf("const probes:"),
  health.indexOf("];", health.indexOf("const probes:")),
);
check(probesBlock.length > 0, "the probes array is found in health.ts");

const probed = new Set();       // "table.col"
const probedTables = new Set(); // "table"
/*
  The column field may name SEVERAL columns, comma-separated — PostgREST errors
  if any one of them is absent, so a single round trip covers a whole
  migration's worth of added columns. collection_policies alone gained five
  across two hand-run files; five separate probes would be five queries to
  answer one question.
*/
for (const m of probesBlock.matchAll(/\[\s*"([a-z_]+)"\s*,\s*"([a-z_, ]+)"\s*,/g)) {
  probedTables.add(m[1]);
  for (const col of m[2].split(",").map((c) => c.trim()).filter(Boolean)) {
    probed.add(`${m[1]}.${col}`);
  }
}
check(probed.size >= 10, "several probes parsed out", String(probed.size));

/* ---- THE INVARIANT ---------------------------------------------------- */

/*
  A created table needs SOME probe against it. Which column is not this test's
  business — any column proves the table exists, which is the question.
*/
for (const [table, file] of created) {
  check(
    probedTables.has(table),
    `health.ts probes the "${table}" table`,
    `created by supabase/${file}, so an operator who never ran that file gets no warning anywhere`,
  );
}

/*
  An added COLUMN needs a probe naming that exact column. A probe on a
  different column of the same table would pass while the new column is
  absent — which is the precise failure with leads: the table has existed for
  months, so any old probe against it succeeds, and `score` being missing
  would have gone on being invisible.
*/
for (const [key, file] of addedCols) {
  check(
    probed.has(key),
    `health.ts probes "${key}" specifically`,
    `added by supabase/${file}; a probe on another column of "${key.split(".")[0]}" would pass while this column is missing`,
  );
}

/* ---- and the probe list must not name things that do not exist -------- */
/*
  The other direction. A probe against a table nobody ever creates reports
  "not applied" for ever, and a permanently-degraded status check is one an
  operator learns to ignore — which costs us every other check on the page.
*/
/* Every .sql we ship, at both levels — the older tables live in
   supabase/migration_*.sql, not in schema.sql or migrations/. */
const allSql = [
  ...readdirSync(join(ROOT, "supabase"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => join(ROOT, "supabase", f)),
  ...readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => join(ROOT, "supabase/migrations", f)),
].map((p) => readFileSync(p, "utf8")).join("\n");

for (const table of probedTables) {
  check(
    new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?${table}\\b`, "i").test(allSql),
    `the probed table "${table}" is created somewhere in supabase/`,
    "otherwise this check reports 'not applied' for ever and the whole status page stops being believed",
  );
}

/* ---- EVERY PROBED COLUMN MUST BE A REAL COLUMN ------------------------ */
/*
  THE CHECK THIS FILE WAS MISSING, AND THE BUG IT WOULD HAVE CAUGHT.

  The first version asserted that probes EXIST and that their tables exist. It
  never asked whether the probed COLUMN was real. So two names written from
  memory — `metric_snapshots.captured_at` and `platform_switches.enabled`,
  where the actual columns are `as_of` and `collections_enabled` — shipped into
  a production health check. Both probes failed against a completely healthy
  database, and /api/health reported

      Schema migrations: degraded — Not applied: RUN-2026-09-05.sql

  for a file that had been applied. The operator and I then went looking for a
  missing collections subsystem that was never missing.

  A monitoring check that raises false alarms is worse than no check: the
  second time it cries wolf, the whole status page stops being read. So the
  column names are resolved against the schema, mechanically, here.
*/
const declared = new Map(); // table -> Set(columns)
const add = (t, c) => {
  if (!declared.has(t)) declared.set(t, new Set());
  declared.get(t).add(c);
};

/* Columns declared inside a create-table body. */
for (const m of allSql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
  const table = m[1];
  for (const line of m[2].split("\n")) {
    const bare = line.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/, "").trim();
    /* First token of a definition line, skipping table-level constraints. */
    const col = bare.match(/^([a-z_]+)\s+[a-z]/i);
    if (!col) continue;
    if (/^(primary|foreign|unique|check|constraint|exclude|like)$/i.test(col[1])) continue;
    add(table, col[1]);
  }
}
/* Columns added later. */
for (const m of allSql.matchAll(/alter\s+table\s+(?:public\.)?([a-z_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi)) {
  add(m[1], m[2]);
}

check(declared.size > 10, "the schema parser found columns for many tables", `${declared.size} tables`);

for (const key of probed) {
  const [table, col] = key.split(".");
  const cols = declared.get(table);
  if (!cols) continue; // the table-exists check above already covers this
  check(
    cols.has(col),
    `"${key}" is a real column`,
    `not declared anywhere in supabase/. Columns on "${table}": ${[...cols].sort().join(", ")}`,
  );
}

/* ---- the file named in a probe has to be a real file ------------------ */
/*
  The third element is shown to the operator as the thing to go and run. A
  name that does not match a file on disk sends them looking for something
  that is not there, at the moment they are already dealing with an outage.
*/
const onDisk = new Set([
  ...readdirSync(join(ROOT, "supabase")),
  ...readdirSync(join(ROOT, "supabase/migrations")),
]);
for (const m of probesBlock.matchAll(/\[\s*"[a-z_]+"\s*,\s*"[a-z_]+"\s*,\s*"([^"]+)"/g)) {
  const named = m[1];
  // Migration probes name a migration stem ("2026_hardening"); operator files
  // name the file itself ("RUN-NOW-2026-09-11.sql"). Accept either.
  if (!named.endsWith(".sql")) continue;
  check(
    onDisk.has(named),
    `the file a probe tells the operator to run exists: ${named}`,
  );
}

console.log(`\nschema probes: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL " + f);
  process.exit(1);
}
console.log(`  ${created.size} hand-run tables and ${addedCols.size} hand-run columns are all reported by /api/health.`);
