#!/usr/bin/env node
/**
 * Prove the in-database aggregate agrees with the TypeScript it replaces.
 *
 *   npm run test:aggregate
 *
 * WHY THIS MATTERS MORE THAN A NORMAL TEST. cortex_aggregate() now feeds every
 * KPI on the dashboard. If it disagrees with the old row-by-row maths by even a
 * rupee, every customer's numbers change silently on the day the migration is
 * applied — and nobody would know which version was right. Worse, the fallback
 * means some workspaces could be computing one way and some the other.
 *
 * So this seeds a deliberately awkward dataset into a real PostgreSQL, runs the
 * SQL, and compares it field by field against the same arithmetic done in JS.
 * The awkward cases are the point: lost orders, blank statuses, paid invoices,
 * draft purchase orders, rows outside the twelve-month window, and nulls.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); }
catch { console.error("Needs a real Postgres:\n  npm i -D @electric-sql/pglite --no-save"); process.exit(2); }

let pass = 0, fail = 0;
const check = (label, got, want) => {
  const same = Math.abs(Number(got) - Number(want)) < 0.01;
  if (same) { pass++; console.log(`  ok    ${label} = ${want}`); }
  else { fail++; console.log(`  FAIL  ${label}: SQL says ${got}, JS says ${want}`); }
};

const db = await PGlite.create();
await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid language sql stable as $fn$ select null::uuid $fn$;
  create or replace function auth.jwt() returns jsonb language sql stable as $fn$ select null::jsonb $fn$;
`);
for (const r of ["anon", "authenticated", "service_role"]) { try { await db.exec(`create role ${r};`); } catch {} }

const files = [
  join(ROOT, "supabase", "schema.sql"),
  join(ROOT, "supabase", "rls.sql"),
  ...readdirSync(join(ROOT, "supabase")).filter((f) => f.startsWith("migration") && f.endsWith(".sql")).sort().map((f) => join(ROOT, "supabase", f)),
  ...readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => join(ROOT, "supabase", "migrations", f)),
];
for (const f of files) {
  try { await db.exec(readFileSync(f, "utf8").replace(/create\s+extension[^;]*;/gi, "")); }
  catch (e) { console.log(`  skip ${f.split("/").pop()} — ${String(e.message).split("\n")[0].slice(0, 70)}`); }
}

const org = "11111111-1111-1111-1111-111111111111";
await db.query("insert into organizations (id,name) values ($1,$2)", [org, "Aggregate Co"]);

const thisMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
const d = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

/*
  Dates ANCHORED TO THE CURRENT MONTH, not "n days ago".

  This suite used to date its orders d(1)..d(5) and compare the resulting
  twelve-month total against the CURRENT MONTH's bucket. Those are different
  quantities, and the comparison passed only because on most days of the month
  "five days ago" happens to still be this month. Run it on the 1st — as
  happened on 1 September — and the fixtures land in the previous month, the
  current bucket is correctly 0, and the suite reports that "the database and
  the app DISAGREE" when in fact the database was right and the test was
  comparing the wrong two numbers.

  A test that passes on 27 days out of 30 for a reason unrelated to what it
  claims to check is worse than no test. Anchoring to day 1 of the current month
  is valid on every calendar date, so the assertion means the same thing every
  day of the year.
*/
const inThisMonth = (dayOffset = 0) =>
  new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1 + dayOffset)).toISOString().slice(0, 10);

/* --- sales orders, including every awkward case ------------------------- */
const orders = [
  { amount: 100000, status: "won",  order_date: inThisMonth(0) },  // counts
  { amount: 250000, status: "won",  order_date: inThisMonth(0) },  // counts
  { amount: 999999, status: "lost", order_date: inThisMonth(0) },  // excluded entirely
  { amount: 500000, status: "",     order_date: inThisMonth(0) },  // an order, NOT revenue
  { amount: 400000, status: "open", order_date: inThisMonth(0) },  // an order, NOT revenue
  { amount: 777777, status: "won",  order_date: d(500) },          // outside the 12-month window
];
for (const o of orders) {
  await db.query("insert into sales_orders (org_id, amount, status, order_date) values ($1,$2,$3,$4)",
    [org, o.amount, o.status || null, o.order_date]);
}

/* --- invoices ------------------------------------------------------------ */
const invoices = [
  { amount: 300000, status: "pending", type: "receivable", due_date: d(-30) }, // open, not overdue
  { amount: 120000, status: "pending", type: "receivable", due_date: d(10) },  // open AND overdue
  { amount: 80000,  status: "overdue", type: "receivable", due_date: d(-5) },  // overdue by status
  { amount: 999999, status: "paid",    type: "receivable", due_date: d(60) },  // excluded
  { amount: 220000, status: "pending", type: "payable",    due_date: d(-10) }, // payable
  { amount: 999999, status: "paid",    type: "payable",    due_date: d(-10) }, // excluded
];
for (const i of invoices) {
  await db.query("insert into invoices (org_id, amount, status, type, due_date) values ($1,$2,$3,$4,$5)",
    [org, i.amount, i.status, i.type, i.due_date]);
}

/* --- purchase orders ----------------------------------------------------- */
const pos = [
  { amount: 150000, status: "sent" },      // counts toward payables
  { amount: 90000,  status: "received" },  // counts
  { amount: 999999, status: "draft" },     // a suggestion, not a commitment
];
for (const p of pos) await db.query("insert into purchase_orders (org_id, amount, status) values ($1,$2,$3)", [org, p.amount, p.status]);

/* --- inventory ----------------------------------------------------------- */
const items = [
  { on_hand: 100, unit_cost: 50,  daily_consumption: 10, reorder_level: 200 }, // below
  { on_hand: 500, unit_cost: 20,  daily_consumption: 25, reorder_level: 100 }, // fine
  { on_hand: 10,  unit_cost: 300, daily_consumption: 0,  reorder_level: 0 },   // no reorder level set
];
for (const i of items) {
  await db.query("insert into inventory_items (org_id, on_hand, unit_cost, daily_consumption, reorder_level) values ($1,$2,$3,$4,$5)",
    [org, i.on_hand, i.unit_cost, i.daily_consumption, i.reorder_level]);
}

/* --- employees ----------------------------------------------------------- */
const staff = [
  { performance: 4.5, attendance_pct: 95, attrition_risk: 0.1, monthly_ctc: 90000 },
  { performance: 3.0, attendance_pct: 80, attrition_risk: 0.6, monthly_ctc: 45000 },
  { performance: 4.0, attendance_pct: 91, attrition_risk: 0.2, monthly_ctc: 60000 },
];
for (const e of staff) {
  await db.query("insert into employees (org_id, performance, attendance_pct, attrition_risk, monthly_ctc) values ($1,$2,$3,$4,$5)",
    [org, e.performance, e.attendance_pct, e.attrition_risk, e.monthly_ctc]);
}

/* --- run the SQL --------------------------------------------------------- */
const res = await db.query("select cortex_aggregate($1) as a", [org]);
const a = res.rows[0].a;
if (!a) { console.log("\ncortex_aggregate returned nothing — migration missing?"); process.exit(1); }

/* --- the same arithmetic, in JS ------------------------------------------ */
const inWindow = (iso) => {
  const t = new Date(iso).getTime();
  return t >= new Date(new Date().setUTCMonth(new Date().getUTCMonth() - 11, 1)).setUTCHours(0, 0, 0, 0);
};
const windowed = orders.filter((o) => o.status !== "lost" && inWindow(o.order_date));

/*
  Compared against the CURRENT MONTH bucket below, so it must be computed for
  the current month too. Summing the whole twelve-month window here and calling
  it "this month" is the bug this suite shipped with.
*/
const thisMonthOrders = windowed.filter((o) => o.order_date >= thisMonth);
const jsRevenue = thisMonthOrders.filter((o) => o.status === "won").reduce((s, o) => s + o.amount, 0);
const jsOrders = thisMonthOrders.length;
const jsUnset = windowed.filter((o) => !o.status).length;

const open = invoices.filter((i) => i.status !== "paid");
const jsOpenRecv = open.filter((i) => i.type !== "payable").reduce((s, i) => s + i.amount, 0);
const todayISO = new Date().toISOString().slice(0, 10);
const jsOverdue = open.filter((i) => i.type !== "payable" && (i.status === "overdue" || i.due_date < todayISO)).reduce((s, i) => s + i.amount, 0);
const jsOpenPay = open.filter((i) => i.type === "payable").reduce((s, i) => s + i.amount, 0)
  + pos.filter((p) => ["sent", "received", "approved"].includes(p.status)).reduce((s, p) => s + p.amount, 0);

const jsStockValue = items.reduce((s, i) => s + i.on_hand * i.unit_cost, 0);
const jsTotalDaily = items.reduce((s, i) => s + i.daily_consumption, 0);
const jsTotalOnHand = items.reduce((s, i) => s + i.on_hand, 0);
const jsBelow = items.filter((i) => i.reorder_level > 0 && i.on_hand < i.reorder_level).length;

const jsAvgPerf = staff.reduce((s, e) => s + e.performance, 0) / staff.length;
const jsAvgAttend = staff.reduce((s, e) => s + e.attendance_pct, 0) / staff.length;
const jsAvgAttr = staff.reduce((s, e) => s + e.attrition_risk, 0) / staff.length;
const jsPayroll = staff.reduce((s, e) => s + e.monthly_ctc, 0);

/* --- compare ------------------------------------------------------------- */
const series = a.series || [];
const cur = series.find((r) => r.period === thisMonth) || { revenue: 0, orders: 0 };

console.log("\nRevenue and orders (the awkward statuses)");
check("revenue this month (won only, lost excluded)", cur.revenue, jsRevenue);
check("orders this month (won + open + blank, not lost)", cur.orders, jsOrders);
check("orders with no status", a.ordersUnset, jsUnset);
check("twelve buckets returned", series.length, 12);
check("the 500-day-old order is outside the window",
  series.reduce((s, r) => s + Number(r.revenue), 0), jsRevenue);

console.log("\nReceivables and payables");
check("open receivables (paid excluded)", a.openRecv, jsOpenRecv);
check("overdue receivables (by date OR status)", a.overdueRecv, jsOverdue);
check("payables incl. sent/received POs, excl. drafts", a.openPay, jsOpenPay);

console.log("\nInventory");
check("stock value", a.stockValue, jsStockValue);
check("daily consumption", a.totalDaily, jsTotalDaily);
check("units on hand", a.totalOnHand, jsTotalOnHand);
check("items below reorder (level 0 ignored)", a.belowReorder, jsBelow);
check("item count", a.itemCount, items.length);

console.log("\nPeople");
check("average performance", a.avgPerf, jsAvgPerf);
check("average attendance", a.avgAttend, jsAvgAttend);
check("average attrition risk", a.avgAttrition, jsAvgAttr);
check("payroll", a.payroll, jsPayroll);
check("headcount", a.staffCount, staff.length);

console.log("\nEmpty workspace must not error");
const empty = "22222222-2222-2222-2222-222222222222";
await db.query("insert into organizations (id,name) values ($1,$2)", [empty, "Empty Co"]);
const e2 = (await db.query("select cortex_aggregate($1) as a", [empty])).rows[0].a;
check("revenue is 0, not null", e2.series.reduce((s, r) => s + Number(r.revenue), 0), 0);
check("receivables is 0, not null", e2.openRecv, 0);
check("averages are 0, not null", e2.avgPerf, 0);
check("still returns twelve buckets", e2.series.length, 12);

/* --- the alert-insert regression ---------------------------------------- */
/*
  This shipped broken and survived a full review: metrics.ts used
  `upsert(..., { onConflict: "org_id,rule_id" })`, but the only matching index
  is PARTIAL. Postgres cannot infer a partial index as an ON CONFLICT arbiter,
  supabase-js returns that as { error } rather than throwing, and the result was
  discarded — so no alert was ever raised, silently, by the very feature written
  to make alerts fire.

  Asserted directly against Postgres so it cannot come back.
*/
console.log("\nAlert raising (the bug that shipped silently)");
{
  const rule = "33333333-3333-3333-3333-333333333333";
  /*
    UPSERT, not INSERT. 2026_default_alert_rules.sql now seeds three rules on
    every organizations insert — including `cash < 30` — so a raw insert here
    collides on uniq_alert_rule (org_id, metric_key, op).

    Upserting is also what the app does: saveAlertRule() has always used
    `on conflict do update`, precisely so that a customer setting their own
    threshold REPLACES the default rather than failing. Matching that here keeps
    the test exercising the real write path instead of one nothing uses.
  */
  await db.query(
    `insert into alert_rules (id, org_id, metric_key, op, threshold) values ($1,$2,'cash','<',6)
     on conflict (org_id, metric_key, op) do update set id = excluded.id, threshold = excluded.threshold`,
    [rule, org]);

  let upsertFailed = false;
  try {
    await db.query(`insert into alerts (org_id, rule_id, title) values ($1,$2,'x')
                    on conflict (org_id, rule_id) do nothing`, [org, rule]);
  } catch { upsertFailed = true; }
  check("ON CONFLICT against the partial index is still rejected by Postgres", upsertFailed ? 1 : 0, 1);

  await db.query("insert into alerts (org_id, rule_id, title, is_read) values ($1,$2,'first',false)", [org, rule]);
  let dupRejected = false;
  try { await db.query("insert into alerts (org_id, rule_id, title, is_read) values ($1,$2,'dup',false)", [org, rule]); }
  catch { dupRejected = true; }
  check("a plain INSERT raises the alert, and a duplicate open one is rejected", dupRejected ? 1 : 0, 1);

  await db.query("update alerts set is_read = true where org_id = $1", [org]);
  await db.query("insert into alerts (org_id, rule_id, title, is_read) values ($1,$2,'again',false)", [org, rule]);
  const n2 = (await db.query("select count(*)::int n from alerts where org_id = $1", [org])).rows[0].n;
  check("once resolved, the same rule can raise again", n2, 2);
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed — the database and the app DISAGREE.`); process.exit(1); }
console.log(`all ${pass} passed — the in-database aggregate matches the TypeScript exactly.`);
