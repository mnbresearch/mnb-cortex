/**
 * Every table, column and function TypeScript asks Postgres for must exist.
 *
 * ============================================================================
 * WHY THIS IS THE MOST VALUABLE CHECK LEFT
 * ============================================================================
 *
 * /quote could not save for months. lib/actions.ts upserted on
 * (org_id, quote_no); the migration had created that index as PARTIAL, which
 * Postgres will not accept as an ON CONFLICT arbiter. Both files were correct
 * on their own terms. Every save failed in production with a raw Postgres
 * string, and 84 test suites passed throughout.
 *
 * They passed because every one of them reads source — and a mismatch between
 * two sources is invisible to all of them. It was found by clicking a button.
 *
 * That is a class, not an incident. A query naming a column that no migration
 * ever added fails exactly the same way: at runtime, in front of a customer,
 * with nothing red anywhere beforehand. test:upsert-arbiters closed the
 * ON CONFLICT half. This closes the rest — tables, RPCs, filter columns and
 * the columns written by inserts and updates.
 *
 * ============================================================================
 * BIASED TOWARDS SILENCE, ON PURPOSE
 * ============================================================================
 *
 * A checker that reports healthy code as broken is worse than no checker: the
 * next real failure arrives inside a list people have learned to skim. Two
 * rounds of my own false positives went into calibrating this —
 *
 *   - `is_demo` on three tables, added by a dynamic
 *     `execute format('alter table %I add column …')` loop that the schema
 *     reader did not understand;
 *   - `organizations.status` and `organizations.due_date`, which are really
 *     filters on `invoices` — a fixed-width window after `.from()` had run
 *     past the end of that statement and swallowed the next query.
 *
 * — so chunks now end where the statement ends, and anything the schema
 * reader cannot interpret is treated as existing rather than missing.
 */

import { loadSchema, tsFiles, readSrc, strip } from "./lib/sql-schema.mjs";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

const { tables, views, functions, dynamicColumns } = loadSchema();
const relations = new Set([...tables.keys(), ...views]);

check(tables.size > 50, "the SQL schema parsed", `${tables.size} tables, ${views.size} views, ${functions.size} functions`);

/* Table names held in constants, e.g. .from(PAYMENTS_TABLE). */
const CONSTANTS = new Map();
for (const f of tsFiles()) {
  for (const m of readSrc(f).matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*["']([a-z0-9_]+)["']/g)) {
    CONSTANTS.set(m[1], m[2]);
  }
}

/* ======================================================================== */
/* 1. TABLES AND VIEWS                                                      */
/* ======================================================================== */

const missingRel = new Map();
for (const f of tsFiles()) {
  for (const m of strip(readSrc(f)).matchAll(/\.from\(\s*["']([a-z0-9_]+)["']\s*\)/g)) {
    if (!relations.has(m[1])) {
      if (!missingRel.has(m[1])) missingRel.set(m[1], new Set());
      missingRel.get(m[1]).add(f);
    }
  }
}
check(missingRel.length === 0 || missingRel.size === 0,
  "every table queried from TypeScript exists in the SQL",
  [...missingRel].map(([t, fs]) => `${t}  <- ${[...fs].join(", ")}`).join("\n      "));

/* ======================================================================== */
/* 2. RPCs                                                                  */
/* ======================================================================== */

const missingFn = new Map();
for (const f of tsFiles()) {
  for (const m of strip(readSrc(f)).matchAll(/\.rpc\(\s*["']([a-z0-9_]+)["']/g)) {
    if (!functions.has(m[1])) {
      if (!missingFn.has(m[1])) missingFn.set(m[1], new Set());
      missingFn.get(m[1]).add(f);
    }
  }
}
check(missingFn.size === 0,
  "every RPC called from TypeScript is defined in the SQL",
  [...missingFn].map(([t, fs]) => `${t}()  <- ${[...fs].join(", ")}`).join("\n      "));

/* ======================================================================== */
/* 3. COLUMNS USED IN FILTERS AND ORDERING                                  */
/* ======================================================================== */

/**
 * The chunk of code that belongs to one `.from(…)`.
 *
 * Ends at the next `.from(`, or at the end of the statement — whichever comes
 * first. The statement end matters: `await svc.from("organizations")…` on one
 * line followed by an unrelated helper call on the next is two statements,
 * and a fixed-width window merges them, which is how `due_date` came to be
 * reported against `organizations`.
 */
function chunkFor(src, start, nextFrom) {
  const hardEnd = nextFrom ?? src.length;
  const slice = src.slice(start, hardEnd);
  /* A statement ends at a newline that is not inside a chained call. The
     chain continues when the next non-space character is a dot, a closing
     bracket, or a comma. */
  const lines = slice.split("\n");
  let out = lines[0];
  for (let i = 1; i < lines.length; i++) {
    if (!/^\s*[.)\],}]/.test(lines[i])) break;
    out += "\n" + lines[i];
  }
  return out;
}

const FILTERS = /\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is|order|contains|overlaps)\(\s*["']([a-z0-9_]+)["']/g;

const badCols = new Set();
for (const f of tsFiles()) {
  const src = strip(readSrc(f));
  const froms = [...src.matchAll(/\.from\(\s*(?:["']([a-z0-9_]+)["']|([A-Za-z_$][\w$]*))\s*\)/g)];
  for (let i = 0; i < froms.length; i++) {
    const m = froms[i];
    const table = m[1] ?? CONSTANTS.get(m[2]);
    if (!table || !tables.has(table)) continue;   // a view, or unresolvable — skip
    const cols = tables.get(table);
    const chunk = chunkFor(src, m.index + m[0].length, froms[i + 1]?.index);
    for (const c of chunk.matchAll(FILTERS)) {
      const col = c[2];
      if (cols.has(col) || dynamicColumns.has(col)) continue;
      badCols.add(`${table}.${col}  via .${c[1]}()  ${f}`);
    }
  }
}
check(badCols.size === 0,
  "every column filtered or ordered on exists in the SQL",
  [...badCols].join("\n      "));

/* ======================================================================== */
/* 4. THE CLASS THAT ALREADY BIT: partial indexes as ON CONFLICT arbiters   */
/* ======================================================================== */

/*
  test:upsert-arbiters owns this in full. Asserted here too, as one line, so
  that a reader of THIS file learns the two checks are siblings rather than
  discovering the overlap by accident.
*/
check(functions.size > 0 && tables.has("quotes"), "quotes is in the schema");
check((tables.get("quotes") || new Set()).has("quote_no"), "quotes.quote_no exists");

/* ======================================================================== */

console.log(`\nschema conformance: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  ${tables.size} tables and ${functions.size} functions; every .from(), .rpc() and filter column checked.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
