/**
 * Every `onConflict` must name columns that a TOTAL unique index covers.
 *
 * ============================================================================
 * THE BUG THIS EXISTS FOR, FOUND BY PRESSING THE BUTTON
 * ============================================================================
 *
 * "Save to workspace" on /quote failed for every customer, in production,
 * since the feature shipped — showing them a raw Postgres string:
 *
 *     there is no unique or exclusion constraint matching the ON CONFLICT
 *     specification
 *
 * lib/actions.ts upserted with `onConflict: "org_id,quote_no"`.
 * 2026_invoice_documents.sql created that index as PARTIAL:
 *
 *     create unique index quotes_org_quoteno_key
 *       on quotes (org_id, quote_no) where quote_no is not null;
 *
 * Postgres only uses a partial index as an ON CONFLICT arbiter when the
 * statement carries a predicate implying the index's own. PostgREST emits
 * none, so there is no usable arbiter and the insert raises. The migration
 * and the query were written against different assumptions, and nothing in
 * 84 test suites compared them — because every one of those suites reads
 * source, and this defect lives in the gap BETWEEN two sources.
 *
 * The quotes table had therefore always been empty, which is why the saved
 * list, the Won/Lost controls and convert-to-invoice were never reachable.
 *
 * ============================================================================
 * WHY THIS CHECK, RATHER THAN A TEST FOR QUOTES
 * ============================================================================
 *
 * There are eighteen distinct `onConflict` targets in this codebase. Fixing
 * the one that was caught by hand leaves seventeen unexamined, and the next
 * partial index somebody adds re-creates the defect somewhere else. So this
 * pairs EVERY upsert with the indexes that could arbitrate it.
 *
 * NULL SEMANTICS, since that is what the predicate looked like it was for:
 * in a standard Postgres unique index NULLs are distinct from each other, so
 * a total index already permits many rows with a NULL in the column. The
 * `where ... is not null` bought nothing and cost the feature.
 */

import { readFileSync, readdirSync } from "node:fs";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

/* ---- Collect every unique index declared anywhere in the SQL ------------ */

function sqlFiles() {
  const out = [];
  for (const d of ["supabase", "supabase/migrations"]) {
    for (const f of readdirSync(new URL(d + "/", root), { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith(".sql")) out.push(`${d}/${f.name}`);
    }
  }
  return out;
}

const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
const cols = (s) => s.split(",").map((c) => c.trim().replace(/\s+(asc|desc)$/, "")).filter(Boolean);

/**
 * { table, cols:[...], partial:boolean, file } for everything Postgres would
 * accept as an ON CONFLICT arbiter.
 *
 * FOUR DECLARATION FORMS, and missing any of them makes this test cry wolf.
 * My first version collapsed whitespace before scanning, which destroyed line
 * boundaries and so matched almost no column-level constraints — it reported
 * nineteen healthy tables as broken. A check that cannot be trusted on a
 * green run is worse than no check, because the next real failure gets waved
 * through with the rest of the noise.
 */
const indexes = [];
for (const f of sqlFiles()) {
  const sql = read(f);

  /* 1. CREATE UNIQUE INDEX — the only form that can be PARTIAL. Scanned
        statement-at-a-time so a WHERE belonging to the next statement cannot
        be mistaken for this index's predicate. */
  for (const stmt of sql.split(";")) {
    const m = norm(stmt).match(/create unique index(?: concurrently)?(?: if not exists)? [a-z0-9_]+\s+on\s+(?:public\.)?([a-z0-9_]+)\s*\(([^)]*)\)(.*)$/);
    if (m) indexes.push({ table: m[1], cols: cols(m[2]), partial: /\bwhere\b/.test(m[3]), file: f });
  }

  /* 2-4. Constraints declared inside CREATE TABLE. Each table body is taken
          whole, so a constraint is always attributed to the right table. */
  for (const t of sql.matchAll(/create table(?:\s+if not exists)?\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
    const table = t[1].toLowerCase();
    const body = t[2];

    /* 2. Table-level: primary key (a, b) / unique (a, b) */
    for (const m of body.matchAll(/^\s*(?:constraint\s+[a-z0-9_]+\s+)?(primary key|unique)\s*\(([^)]*)\)/gim)) {
      indexes.push({ table, cols: cols(m[2].toLowerCase()), partial: false, file: f });
    }

    /* 3-4. Column-level: `col type primary key` / `col type ... unique`.
            Line-by-line, because a column definition is a line. */
    for (const line of body.split("\n")) {
      const m = line.match(/^\s*([a-z0-9_]+)\s+[a-z0-9_ ()\[\]']+?\b(primary key|unique)\b/i);
      if (m && !/^\s*(primary|unique|constraint|foreign|check)\b/i.test(line)) {
        indexes.push({ table, cols: [m[1].toLowerCase()], partial: false, file: f });
      }
    }
  }
}

check(indexes.length > 15, "found the unique indexes in the SQL", `saw ${indexes.length}`);

/* ---- Collect every upsert and the table it targets ---------------------- */

function tsFiles(dir = "src") {
  const out = [];
  for (const e of readdirSync(new URL(dir + "/", root), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...tsFiles(`${dir}/${e.name}`));
    else if (/\.tsx?$/.test(e.name)) out.push(`${dir}/${e.name}`);
  }
  return out;
}

/**
 * Table names held in a constant, e.g. `.from(PAYMENTS_TABLE)`.
 *
 * Resolved rather than skipped, and this mattered: the payment upserts all go
 * through `PAYMENTS_TABLE`, so a back-walk looking only for `.from("literal")`
 * sailed past them and attached them to whatever unrelated literal `.from()`
 * happened to appear earlier in the file — reporting `organizations` and
 * `credit_ledger` as broken when the real target, cortex_payments, has
 * order_id as its primary key.
 *
 * A wrong attribution is worse than no attribution: it is a failure that
 * points at innocent code.
 */
const CONSTANTS = new Map();
for (const f of tsFiles()) {
  for (const m of read(f).matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*["']([a-z0-9_]+)["']/g)) {
    CONSTANTS.set(m[1], m[2]);
  }
}

const upserts = [];
for (const f of tsFiles()) {
  const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const m of src.matchAll(/onConflict:\s*"([^"]+)"/g)) {
    /* The nearest preceding .from(…) is this upsert's target — whether it
       names the table as a literal or through a constant. Both forms are
       matched in ONE pass so the closer of the two always wins; matching
       literals first and identifiers second is what produced the wrong
       attributions above. */
    const before = src.slice(0, m.index);
    const t = [...before.matchAll(/\.from\(\s*(?:["']([a-z0-9_]+)["']|([A-Za-z_$][\w$]*))\s*\)/g)].pop();
    const table = t ? (t[1] ?? CONSTANTS.get(t[2]) ?? null) : null;
    upserts.push({
      cols: m[1].split(",").map((c) => c.trim()),
      table,
      unresolvedIdent: t && !t[1] && !CONSTANTS.has(t[2]) ? t[2] : null,
      file: f,
      raw: m[1],
    });
  }
}

check(upserts.length >= 15, "found the upserts in the app", `saw ${upserts.length}`);

/*
  Targets whose table cannot be read from a literal .from("…") — a dynamic
  table name, for instance the bulk importer. Listed rather than silently
  skipped, so a new dynamic upsert has to be considered rather than ignored.
*/
const DYNAMIC_OK = new Set(["key"]);

const unresolved = upserts.filter((u) => !u.table && !DYNAMIC_OK.has(u.raw));
check(unresolved.length === 0,
  "every upsert's target table is identifiable",
  unresolved.map((u) => `${u.file}: onConflict "${u.raw}"` +
    (u.unresolvedIdent ? ` — .from(${u.unresolvedIdent}) did not resolve to a literal` : "")).join("\n      "));

/* ---- The rule ----------------------------------------------------------- */

const broken = [];
for (const u of upserts) {
  if (!u.table) continue;
  const forTable = indexes.filter((i) => i.table === u.table);
  const sameCols = forTable.filter((i) =>
    i.cols.length === u.cols.length && i.cols.every((c, n) => c === u.cols[n]));
  const total = sameCols.filter((i) => !i.partial);

  if (sameCols.length === 0) {
    broken.push(`${u.table}: onConflict "${u.raw}" has NO unique index at all  (${u.file})`);
  } else if (total.length === 0) {
    broken.push(
      `${u.table}: onConflict "${u.raw}" matches only a PARTIAL index  ` +
      `(${sameCols[0].file})\n        Postgres cannot use a partial index as an ON CONFLICT ` +
      `arbiter here, so every upsert on this table fails at runtime.`);
  }
}

check(broken.length === 0,
  "every upsert has a TOTAL unique index to arbitrate on",
  broken.length ? broken.join("\n      ") : "");

/* ---- The specific regression, named ------------------------------------- */

const quoteIdx = indexes.filter((i) => i.table === "quotes" && i.cols.join(",") === "org_id,quote_no");
check(quoteIdx.length > 0, "quotes has a (org_id, quote_no) unique index");
check(quoteIdx.some((i) => !i.partial),
  "…and at least one of them is NOT partial",
  "This is the exact defect: `where quote_no is not null` made Save fail for " +
  "every customer since the feature shipped. NULLs are distinct in a standard " +
  "unique index anyway, so the predicate bought nothing.");

/* ---- And the customer never sees a Postgres string ---------------------- */

const actions = read("src/lib/actions.ts");
const saveQuote = actions.slice(actions.indexOf("export async function saveQuote"), actions.indexOf("export async function listQuotes"));
check(saveQuote.length > 200, "found saveQuote");
check(!/return \{ ok: false, error: error\.message \}/.test(saveQuote),
  "saveQuote does not hand the raw Postgres message to the customer",
  "\"there is no unique or exclusion constraint matching the ON CONFLICT " +
  "specification\" is for whoever wrote the migration, not for someone " +
  "trying to save a quotation.");
check(/duplicate key\|unique constraint|duplicate key/.test(saveQuote),
  "…but a duplicate quote number is still named plainly",
  "That one the owner can actually act on.");

/* ------------------------------------------------------------------------ */

console.log(`\nupsert arbiters: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  ${upserts.length} upserts checked against ${indexes.length} unique indexes.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
