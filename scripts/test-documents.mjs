/**
 * The invoice/quote/alert-delivery schema, on a real Postgres.
 *
 * Three properties are worth executing rather than reading:
 *
 *   1. Saving the same invoice twice UPDATES rather than duplicating. The
 *      upsert relies on a unique index created in a different migration
 *      (2026_sync_layer), so "it will upsert" is an assumption about another
 *      file. If that index is not there, every re-save silently doubles the
 *      customer's receivables — money owed, overstated, with no error.
 *
 *   2. A quote is NOT a receivable. Quotes live in their own table precisely so
 *      a pipeline number can never reach a cash forecast, and that separation is
 *      only real if the receivables query cannot see them.
 *
 *   3. `alerts.notified_at` exists and starts NULL for every existing row, which
 *      is what stops switching delivery on from emailing every workspace its
 *      entire history.
 */

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

let pass = 0;
const failures = [];
const ok = () => pass++;
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok() : bad(n, d));

const db = new PGlite();

async function main() {
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create table organizations (id uuid primary key default gen_random_uuid(), name text);
    create type health_status as enum ('green','yellow','red');
    create table invoices (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null references organizations(id) on delete cascade,
      invoice_no text, party text, amount numeric, due_date date,
      status text default 'pending', type text default 'receivable',
      created_at timestamptz default now()
    );
    create table alerts (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null references organizations(id) on delete cascade,
      severity health_status default 'yellow', title text not null, body text,
      module text, is_read boolean default false, created_at timestamptz default now()
    );
    create or replace function user_org_ids() returns setof uuid
      language sql stable as $$ select null::uuid where false $$;
    grant select, insert, update, delete on organizations, invoices, alerts to authenticated, service_role;
  `);

  /*
    The unique index the upsert depends on lives in ANOTHER migration. Applied
    here so this test reflects a real database rather than a convenient one — if
    the real index were ever dropped, this test would keep passing and lie. So
    assert it exists in the file too, below.
  */
  /*
    Start from the BROKEN state the production database is actually in: the
    PARTIAL unique index from 2026_sync_layer.sql. Starting from a clean
    non-partial index would make this test pass while production kept failing.
  */
  await db.exec(`create table sales_orders (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null references organizations(id) on delete cascade,
      order_no text, customer_name text, amount numeric,
      created_at timestamptz default now());
    create table customers (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null references organizations(id) on delete cascade,
      name text, created_at timestamptz default now());`);
  await db.exec(`create unique index invoices_org_invoiceno_key on invoices (org_id, invoice_no) where invoice_no is not null;`);
  await db.exec(`create unique index sales_orders_org_orderno_key on sales_orders (org_id, order_no) where order_no is not null;`);
  await db.exec(`create unique index customers_org_name_key on customers (org_id, name) where name is not null;`);

  await db.exec(readFileSync("supabase/migrations/2026_invoice_documents.sql", "utf8"));
  ok(); // documents migration applied

  /* The partial index must genuinely break the upsert, or the fix below proves
     nothing. This is the bug, reproduced. */
  const orgProbe = (await db.query(`insert into organizations (name) values ('Probe') returning id`)).rows[0].id;
  let brokenErr = null;
  try {
    await db.query(`insert into invoices (org_id, invoice_no, party, amount) values ($1,'X',$2,1)
                    on conflict (org_id, invoice_no) do update set amount = 2`, [orgProbe, "p"]);
  } catch (e) { brokenErr = String(e.message || e); }
  check(brokenErr !== null && /ON CONFLICT/i.test(brokenErr),
    "reproduced: a PARTIAL unique index breaks the upsert PostgREST emits",
    `expected an ON CONFLICT error, got: ${brokenErr}`);

  await db.exec(readFileSync("supabase/migrations/2026_upsert_arbiter_fix.sql", "utf8"));
  ok(); // arbiter fix applied

  let fixedErr = null;
  try {
    await db.query(`insert into invoices (org_id, invoice_no, party, amount) values ($1,'X',$2,1)
                    on conflict (org_id, invoice_no) do update set amount = 2`, [orgProbe, "p"]);
  } catch (e) { fixedErr = String(e.message || e); }
  check(fixedErr === null, "after the fix, the same upsert works", String(fixedErr));

  /* And NULL-numbered rows must still be allowed to coexist. */
  await db.query(`insert into invoices (org_id, invoice_no, amount) values ($1,null,1)`, [orgProbe]);
  await db.query(`insert into invoices (org_id, invoice_no, amount) values ($1,null,2)`, [orgProbe]);
  const nulls = Number((await db.query(
    `select count(*)::int n from invoices where org_id=$1 and invoice_no is null`, [orgProbe])).rows[0].n);
  check(nulls === 2, "dropping the predicate did not forbid NULL invoice numbers", `${nulls} rows`);

  /*
    The health check now reports "upserts broken" on the strength of
    cortex_upsert_arbiters_ok(). A helper that always returns true would tell
    the operator invoice saving works while customers see save failures — the
    same trap the billing-guard probe fell into. So: assert it reports true
    now, then restore ONE partial index and assert it flips to false.
  */
  const arbitersOk = async () =>
    (await db.query(`select cortex_upsert_arbiters_ok() as v`)).rows[0].v;

  check(await arbitersOk() === true,
    "health: cortex_upsert_arbiters_ok() is true once the indexes are non-partial",
    `got ${await arbitersOk()}`);

  await db.exec(`drop index invoices_org_invoiceno_key;
                 create unique index invoices_org_invoiceno_key
                   on invoices (org_id, invoice_no) where invoice_no is not null;`);
  check(await arbitersOk() === false,
    "health: and FALSE again the moment one index goes back to partial",
    "the operator would be told upserts work while every invoice save fails");

  await db.exec(`drop index invoices_org_invoiceno_key;
                 create unique index invoices_org_invoiceno_key on invoices (org_id, invoice_no);`);
  check(await arbitersOk() === true, "health: true again after restoring it");

  const syncSql = readFileSync("supabase/migrations/2026_sync_layer.sql", "utf8");
  check(/create unique index if not exists invoices_org_invoiceno_key/.test(syncSql),
    "the unique index the upsert relies on is really declared in the repo",
    "2026_sync_layer.sql no longer creates invoices_org_invoiceno_key — the upsert would duplicate");

  const { rows: [org] } = await db.query(`insert into organizations (name) values ('Acme') returning id`);
  const ORG = org.id;

  /* ---------------------------------------------- 1. saving twice is safe */

  const save = (no, party, amount) => db.query(
    `insert into invoices (org_id, invoice_no, party, amount, type, status)
     values ($1,$2,$3,$4,'receivable','pending')
     on conflict (org_id, invoice_no) do update
       set party = excluded.party, amount = excluded.amount`,
    [ORG, no, party, amount]);

  await save("INV-0001", "Sharma Traders", 12500);
  await save("INV-0001", "Sharma Traders", 12500);   // the double-click
  const count1 = Number((await db.query(
    `select count(*)::int n from invoices where org_id=$1 and invoice_no='INV-0001'`, [ORG])).rows[0].n);
  check(count1 === 1, "saving the same invoice twice does not bill twice", `${count1} rows exist`);

  const total1 = Number((await db.query(
    `select coalesce(sum(amount),0) t from invoices where org_id=$1 and status='pending'`, [ORG])).rows[0].t);
  check(total1 === 12500, "receivables total is not doubled", `total is ${total1}`);

  // A correction must UPDATE the existing invoice, not add a second one.
  await save("INV-0001", "Sharma Traders", 15000);
  const total2 = Number((await db.query(
    `select coalesce(sum(amount),0) t from invoices where org_id=$1 and status='pending'`, [ORG])).rows[0].t);
  check(total2 === 15000, "correcting an invoice replaces the amount", `total is ${total2}`);

  /* A DIFFERENT number is a different invoice. */
  await save("INV-0002", "Patel & Co", 5000);
  const total3 = Number((await db.query(
    `select coalesce(sum(amount),0) t from invoices where org_id=$1 and status='pending'`, [ORG])).rows[0].t);
  check(total3 === 20000, "a genuinely new invoice does add to receivables", `total is ${total3}`);

  /* ------------------------------------- 2. quotes are not receivables */

  await db.query(
    `insert into quotes (org_id, quote_no, party, amount) values ($1,'QT-0001','Big Prospect',900000)`, [ORG]);
  const afterQuote = Number((await db.query(
    `select coalesce(sum(amount),0) t from invoices where org_id=$1 and status='pending'`, [ORG])).rows[0].t);
  check(afterQuote === 20000,
    "a ₹9L quote does NOT appear in receivables",
    `receivables moved to ${afterQuote} — a pipeline number reached the cash position`);

  const qCount = Number((await db.query(`select count(*)::int n from quotes where org_id=$1`, [ORG])).rows[0].n);
  check(qCount === 1, "…but the quote is genuinely stored");

  let qDup = null;
  try {
    await db.query(`insert into quotes (org_id, quote_no, party, amount) values ($1,'QT-0001','Big Prospect',900000)`, [ORG]);
  } catch (e) { qDup = String(e.message || e); }
  check(qDup !== null, "a duplicate quote number is rejected");

  const badStatus = await db.query(
    `select count(*)::int n from information_schema.check_constraints
      where constraint_schema='public' and check_clause ilike '%accepted%'`);
  check(Number(badStatus.rows[0].n) > 0, "quote status is constrained to the known values");

  /* ------------------------------------------ 3. alerts.notified_at */

  await db.query(
    `insert into alerts (org_id, severity, title, is_read) values ($1,'red','Receivables past due',false)`, [ORG]);
  const pending = await db.query(
    `select notified_at from alerts where org_id=$1`, [ORG]);
  check(pending.rows[0].notified_at === null,
    "a newly raised alert starts un-notified",
    "an alert would be treated as already sent");

  const undelivered = Number((await db.query(
    `select count(*)::int n from alerts where org_id=$1 and is_read=false and notified_at is null`, [ORG])).rows[0].n);
  check(undelivered === 1, "the delivery query finds exactly the un-notified alert");

  // Claiming it must make it invisible to the next run — the anti-spam property.
  await db.query(`update alerts set notified_at = now() where org_id=$1 and notified_at is null`, [ORG]);
  const second = Number((await db.query(
    `select count(*)::int n from alerts where org_id=$1 and is_read=false and notified_at is null`, [ORG])).rows[0].n);
  check(second === 0, "once notified, an alert is never picked up again",
    "the same digest would be emailed every single day");

  /* ------------------------------- the scheduler's gap logic, in isolation */
  /*
    Mirrors lib/workflow-schedule.ts. 20 hours, not 24, so that a cron firing a
    few minutes early does not skip a day — while still making two runs in one
    calendar day impossible.
  */
  const MIN_GAP_MS = 20 * 60 * 60 * 1000;
  const due = (lastIso, nowMs) => !lastIso || nowMs - new Date(lastIso).getTime() >= MIN_GAP_MS;
  const t0 = Date.parse("2026-09-02T02:30:00Z");
  check(due(null, t0), "scheduler: a workflow that has never run is due");
  check(!due(new Date(t0 - 60_000).toISOString(), t0), "scheduler: not due again a minute later");
  check(!due(new Date(t0 - 19 * 3600_000).toISOString(), t0), "scheduler: not due after 19 hours");
  check(due(new Date(t0 - 21 * 3600_000).toISOString(), t0), "scheduler: due after 21 hours");
  check(due(new Date(t0 - 24 * 3600_000 + 5 * 60_000).toISOString(), t0),
    "scheduler: a cron firing 5 minutes early still runs (this is why 20h, not 24h)");

  console.log(`\ndocuments: ${pass} passed, ${failures.length} failed`);
  if (failures.length) { console.log("\nFAILURES:"); failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
  console.log(`  re-saving cannot double a receivable; a quote stays out of the cash position.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
