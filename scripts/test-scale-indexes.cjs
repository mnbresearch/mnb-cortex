#!/usr/bin/env node
/**
 * Prove the scale indexes actually change the plan. Real Postgres (PGlite).
 *
 * WHY MEASURE INSTEAD OF ASSERT.
 *
 * "Added an index" is not a result. Postgres will happily ignore an index that
 * does not match the query's shape — wrong column order, wrong sort direction,
 * a predicate the partial index does not cover — and the migration still looks
 * like it worked. The only honest check is to run EXPLAIN on the query the
 * application actually sends and see the plan change from a sequential scan to
 * an index scan.
 *
 * So this seeds enough rows that Postgres would not prefer a seq scan anyway
 * (on a 10-row table it always will, and the test would prove nothing), then
 * compares the plan before and after.
 */

const { PGlite } = require("@electric-sql/pglite");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
let pass = 0, fail = 0;
const check = (label, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok    ${label}${detail ? `  ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  ${detail}` : ""}`); }
};

const SCHEMA = `
create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, user_id uuid not null, role text,
  created_at timestamptz default now(),
  unique (org_id, user_id)
);
create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, status text, created_at timestamptz default now()
);
create table alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, is_read boolean default false,
  created_at timestamptz default now()
);
create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, status text, created_at timestamptz default now()
);
create table integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, provider text
);
`;

/** Seed enough that a seq scan is genuinely the worse plan. */
const SEED = `
insert into memberships (org_id, user_id, role)
select gen_random_uuid(), gen_random_uuid(), 'analyst' from generate_series(1, 20000);
insert into invoices (org_id, status, created_at)
select gen_random_uuid(), 'open', now() - (g || ' minutes')::interval from generate_series(1, 20000) g;
insert into alerts (org_id, is_read, created_at)
select gen_random_uuid(), g % 50 <> 0, now() - (g || ' minutes')::interval from generate_series(1, 20000) g;
insert into sales_orders (org_id, status, created_at)
select gen_random_uuid(), case when g % 3 = 0 then 'won' else 'open' end,
       now() - (g || ' minutes')::interval from generate_series(1, 20000) g;
insert into integrations (org_id, provider)
select gen_random_uuid(), 'ai' from generate_series(1, 5000);
analyze;
`;

/* The queries the app actually sends, one per index being added. */
const QUERIES = [
  {
    name: "user_org_ids() — the RLS hot path, on every table, every query",
    sql: `select org_id from memberships where user_id = $1`,
    param: () => "00000000-0000-0000-0000-000000000001",
  },
  {
    name: "invoices — .eq(org_id).order(created_at desc)",
    sql: `select id from invoices where org_id = $1 order by created_at desc limit 50`,
    param: () => "00000000-0000-0000-0000-000000000001",
  },
  {
    name: "alerts — unread only",
    sql: `select id from alerts where org_id = $1 and is_read = false order by created_at desc limit 50`,
    param: () => "00000000-0000-0000-0000-000000000001",
  },
  {
    name: "sales_orders — status + created_at (the AI revenue tool)",
    sql: `select id from sales_orders where org_id = $1 and status = 'won' and created_at >= now() - interval '90 days'`,
    param: () => "00000000-0000-0000-0000-000000000001",
  },
  {
    name: "integrations — read on every dashboard render",
    sql: `select id from integrations where org_id = $1`,
    param: () => "00000000-0000-0000-0000-000000000001",
  },
];

const planOf = async (db, sql, param) => {
  const r = await db.query(`explain (format json) ${sql}`, [param]);
  return JSON.stringify(r.rows[0]["QUERY PLAN"] ?? r.rows[0]);
};

(async () => {
  const migration = readFileSync(join(ROOT, "supabase/migrations/2026_scale_indexes.sql"), "utf8");

  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SEED);

  /* ================================================================= */
  console.log("\nBEFORE — every one of these must be a sequential scan");
  /* If a query is already indexed, adding an index proves nothing about it,
     so the "before" state has to be established rather than assumed. */
  const before = {};
  for (const q of QUERIES) {
    before[q.name] = await planOf(db, q.sql, q.param());
    check(`seq scan: ${q.name}`, /Seq Scan/.test(before[q.name]));
  }

  /* ================================================================= */
  console.log("\nApplying 2026_scale_indexes.sql");
  await db.exec(migration);
  await db.exec("analyze;");

  console.log("\nAFTER — the planner must actually pick the new index");
  for (const q of QUERIES) {
    const after = await planOf(db, q.sql, q.param());
    const usesIndex = /Index (Only )?Scan/.test(after);
    check(`index scan: ${q.name}`, usesIndex,
          usesIndex ? "" : `\n          plan still: ${after.slice(0, 160)}`);
  }

  /* ================================================================= */
  console.log("\nTHE RLS PATH SHOULD BE INDEX-ONLY");
  {
    /* (user_id, org_id) rather than (user_id) so user_org_ids() is answered
       from the index without touching the heap. Worth checking explicitly —
       it is the difference between one page read and two, multiplied by every
       RLS check in the system. */
    const p = await planOf(db, QUERIES[0].sql, QUERIES[0].param());
    check("user_org_ids() is answered index-only (no heap fetch)", /Index Only Scan/.test(p),
          /Index Only Scan/.test(p) ? "" : `\n          ${p.slice(0, 160)}`);
  }

  /* ================================================================= */
  console.log("\nIDEMPOTENCE");
  {
    let err = null;
    try { await db.exec(migration); } catch (e) { err = e; }
    check(`applies a second time${err ? ` (${err.message})` : ""}`, !err);
  }

  /* ================================================================= */
  console.log("\nNO BEHAVIOUR CHANGE — an index must not alter results");
  {
    /* Cheap, but the point is that this file is safe to run on production
       without reading every line of it: indexes are additive by definition and
       this demonstrates the queries still return the same rows. */
    const a = await db.query(`select count(*)::int n from memberships`);
    const b = await db.query(`select count(*)::int n from alerts where is_read = false`);
    check(`row counts unchanged (${a.rows[0].n} memberships, ${b.rows[0].n} unread)`,
          a.rows[0].n === 20000 && b.rows[0].n === 400);
  }

  await db.close();
  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
