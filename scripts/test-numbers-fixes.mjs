/**
 * The numbers fixes: every figure a page states must be the customer's own,
 * computed over all of their rows — or say plainly that it is unknown.
 *
 * Each block guards one audit finding. Pure logic is EXECUTED (lib/money-rules,
 * the importer, the export flattener); SQL is executed in PGlite (real
 * Postgres, WASM); server components that need a Supabase client are guarded
 * by narrow source assertions with comments stripped first, so prose that
 * names the fix cannot satisfy a check after the code has been reverted.
 *
 * Every assertion here was mutation-checked: revert the line it protects and
 * this suite fails.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-numbers-fixes.mjs
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  projectRunway, isOpenReceivable, isPastDueReceivable, scheduleByDueDate, lastCompleteMonthRevenue,
} from "../src/lib/money-rules.ts";
import { flattenExport, voucherKind } from "../src/lib/accounting-export.ts";
import { resolveHeaders, applyMapping, mapImportedRow, IMPORT_COLS } from "../src/lib/import-map.ts";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const raw = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (p) => strip(raw(p));

/* ===================================================================== */
/* 3 (P0) — runway: out of cash only if the balance actually hits zero    */
/* ===================================================================== */
{
  // Burning now, but revenue grows past burn before cash runs out.
  const turns = projectRunway({ cash: 1_000_000, burn: 500_000, revenue: 400_000, growthPct: 10, horizon: 60 });
  check(!turns.hitZero && turns.monthsToZero === null,
    "runway: a business that turns cash-positive before running out never 'runs out'",
    JSON.stringify({ hitZero: turns.hitZero, months: turns.monthsToZero }));
  check(turns.netBurnNow === 100_000, "runway: net burn now is this month's burn − revenue");

  // Cash-positive today, never hits zero → not "60".
  const pos = projectRunway({ cash: 500_000, burn: 100_000, revenue: 200_000, growthPct: 0 });
  check(!pos.hitZero && pos.monthsToZero === null, "runway: cash-positive is 'never', not 60 months");

  // Slow burn that never reaches zero inside 60 months must not read as 60.
  const slow = projectRunway({ cash: 10_000_000, burn: 110_000, revenue: 100_000, growthPct: 0, horizon: 60 });
  check(!slow.hitZero && slow.monthsToZero === null,
    "runway: a balance still positive at month 60 is 'not within 5 years', never '60'",
    `got monthsToZero=${slow.monthsToZero}`);

  // Genuinely runs out.
  const out = projectRunway({ cash: 1_000_000, burn: 600_000, revenue: 350_000, growthPct: 0 });
  check(out.hitZero && out.monthsToZero === 4, "runway: ₹10L at ₹2.5L/mo net burn runs out in month 4", `got ${out.monthsToZero}`);

  // Cash-positive at month 0 but shrinking revenue → still runs out.
  const shrink = projectRunway({ cash: 300_000, burn: 200_000, revenue: 210_000, growthPct: -20, horizon: 60 });
  check(shrink.hitZero, "runway: positive today with falling revenue can still run out (month-0 judgement removed)");

  const ui = src("src/components/cash-runway.tsx");
  check(/projectRunway\(/.test(ui) && !/if \(net <= 0\) break/.test(ui),
    "/runway uses projectRunway, not the loop that broke on the first cash-positive month");
  check(/Never \(within 5 years\)/.test(ui), "/runway says 'Never (within 5 years)' when the balance never hits zero");
  /* 9 (P0) — real cash ÷ invented burn under "yours". */
  check(/stillExample=\{stillExample\}/.test(ui) && /monthlyCost == null \? "monthly burn"/.test(ui),
    "/runway names burn (and revenue/cash) as examples when they were not seeded");
}

/* ===================================================================== */
/* 13 (P1) — one definition of open / past-due receivable                 */
/* ===================================================================== */
{
  const T = "2026-10-14";
  check(isOpenReceivable({ status: null, type: null }), "rule: no type + no status is an open receivable (dashboard rule)");
  check(!isOpenReceivable({ status: "Paid", type: "receivable" }), "rule: 'Paid' (any case) is not open");
  check(!isOpenReceivable({ status: "pending", type: "payable" }), "rule: payables are not receivables");
  check(isPastDueReceivable({ status: "overdue", type: "receivable", due_date: null }, T),
    "rule: marked overdue with no due date IS past due (dashboard counts it)");
  check(isPastDueReceivable({ status: "pending", type: null, due_date: "2026-10-13" }, T), "rule: due yesterday is past due");
  check(!isPastDueReceivable({ status: "pending", type: "receivable", due_date: "2026-10-14" }, T), "rule: due today is not yet past due");
  const page = src("src/app/(app)/receivables/page.tsx");
  check(/isPastDueReceivable\(/.test(page) && /filter\(isOpenReceivable\)/.test(page),
    "/receivables uses the shared rule rather than type='receivable' + due-date only");
  check(!/\.eq\("type", "receivable"\)/.test(page), "/receivables no longer drops untyped invoices in SQL");
  /* 14 (P1) — a failed read is not "example invoices". */
  check(/\{error \? \(/.test(page) && /couldn&rsquo;t read your invoices/.test(page),
    "/receivables shows an error card when the read fails");
}

/* ===================================================================== */
/* 1, 2 (P0) — totals over EVERY row, tables truncated after              */
/* ===================================================================== */
{
  const pay = src("src/app/(app)/payables/page.tsx");
  check(/getTableStats\("invoices"/.test(pay) && /getTableStats\("purchase_orders"/.test(pay),
    "/payables reads every invoice and PO (paged), not the 200-row list reads");
  check(!/getInvoices\(\)/.test(pay), "/payables no longer uses getInvoices() (200-row cap)");
  const iTot = pay.indexOf("const totals"), iSlice = pay.indexOf(".slice(0, 60)");
  check(iTot !== -1 && iSlice !== -1 && iTot < iSlice && /totals=\{totals\}/.test(pay),
    "/payables computes totals over all bills BEFORE truncating the table, and passes them down");
  const dpo = src("src/components/payables-dpo.tsx");
  check(/totals\.total \+ \(visible - seedSum\)/.test(dpo), "payables-dpo shows the server total (adjusted by edits), not the visible-row sum");
  check(/Showing the largest/.test(dpo), "payables-dpo says 'showing N of M'");

  const rec = src("src/app/(app)/receivables/page.tsx");
  check(/async function wonLast90Days/.test(rec) && /pageAll<any>\(\(a, b\) => sb\.from\("sales_orders"\)/.test(rec),
    "/receivables DSO sums ALL won orders of the last 90 days (paged), not the latest 200");
  check(!/getSalesOrders\(\)/.test(rec), "/receivables no longer uses getSalesOrders() for DSO");

  const data = src("src/lib/data.ts");
  /* 21 (P1) — fetchRows reports its error and truncation, backward compatibly. */
  check(/error: error \? error\.message : null, truncated: rows\.length >= LIST_LIMIT/.test(data),
    "fetchRows returns the read error and a truncation flag");
  /* 22 (P0) — superadmin no longer reads every tenant's leads. */
  check(/\.or\(`org_id\.is\.null,org_id\.eq\.\$\{orgId\}`\)/.test(data),
    "getLeads (superadmin) is scoped to org_id null or the operator's own org");
  check(!/svc\.from\("leads"\)\.select\("\*"\)\.order\(/.test(data), "no unscoped service-role leads read remains");
}

/* ===================================================================== */
/* 4, 5, 20 (P0) — COGS / opex / EBITDA: unknown, never 0 or example      */
/* ===================================================================== */
{
  const seed = src("src/lib/workspace-seed.ts");
  check(/const cogsRows = revRows\.filter\(\(r\) => num\(r\.cogs\) !== null\)/.test(seed),
    "seed: COGS ignores rows whose cogs is 0/null (the column default nothing writes)");
  check(/rawCogs === null \|\| !cogsRows\.length \? null/.test(seed), "seed: COGS is null when no row recorded one");
  check(/const opex: number \| null = null;/.test(seed) && /const monthlyOpex: number \| null = null;/.test(seed),
    "seed: opex is not seeded (the ledger column is one month of payroll)");
  /* 6 — profit only once the ledger separates cash flow from profit. */
  check(/const profitRows = !ledgerSeparatesCashFlow \? \[\]/.test(seed), "seed: net profit is unknown until net_cash_flow exists");

  const pnl = src("src/components/pnl-builder.tsx");
  check(!/orDefault\(seed\?\.monthlyCogs, 2_932_500\)/.test(pnl), "/pnl no longer drops the example COGS under a real revenue");
  check(/cogsKnown \? seed!\.monthlyCogs! : seeded \? 0 : 2_932_500/.test(pnl) && /"not recorded"/.test(pnl),
    "/pnl leaves COGS blank and 'not recorded' when the workspace has none");

  const be = src("src/components/breakeven-mix.tsx");
  check(/Math\.round\(seed\.opex \/ 12\)/.test(be), "/breakeven divides annual opex by 12 for 'Fixed costs / month'");
  const val = src("src/components/valuation-calculator.tsx");
  check(/seed\?\.ebitdaAnnual == null \? "EBITDA" : ""/.test(val), "/valuation names EBITDA as an example when it is not on the ledger");

  /* 8 (P0) — partial seeds name what is still an example. */
  const ccc = src("src/components/ccc-cycle.tsx");
  check(/stillExample=\{stillExample\}/.test(ccc) && /seed\?\.cogs == null \? "annual COGS"/.test(ccc),
    "/ccc names the fields still on examples");
  check(/cogs > 0 \? \(inventory \/ cogs\) \* 365 : NaN/.test(ccc), "/ccc DIO is unknown (not 0) without COGS");
  const nw = src("src/components/networth-builder.tsx");
  check(/seed\?\.cash == null \? "cash & bank"/.test(nw) && /stillExample=\{\[/.test(nw),
    "/networth names every line still on examples");
}

/* ===================================================================== */
/* 6 (P0) — bank net flow is net CASH FLOW, never net profit              */
/* ===================================================================== */
{
  const pa = src("src/lib/persist-analysis.ts");
  check(/net_cash_flow: \+num\(m\.net\)\.toFixed\(2\)/.test(pa), "bank reader writes net_cash_flow");
  check(!/net_profit:/.test(pa), "bank reader never writes net_profit");
  const met = src("src/lib/metrics.ts");
  check(/map\(netCashFlowOf\)/.test(met) && !/map\(\(r\) => num\(r\.net_profit\)\)/.test(met),
    "runway KPI reads net_cash_flow, not net_profit");

  const db = new PGlite();
  await db.exec(`
    create table finance_ledger (id serial primary key, org_id uuid not null, period date not null,
      revenue numeric default 0, net_profit numeric, cash_balance numeric, unique (org_id, period));
    insert into finance_ledger (org_id, period, revenue, net_profit, cash_balance) values
      ('00000000-0000-0000-0000-000000000001', '2026-03-01', 0, 5000000, 9000000),  -- a loan drawdown month
      ('00000000-0000-0000-0000-000000000001', '2026-04-01', 100, -200000, 8800000),
      ('00000000-0000-0000-0000-000000000001', '2026-05-01', 100, null, null);
  `);
  const sql = raw("supabase/migrations/2026_zzzz_c_net_cash_flow.sql");
  await db.exec(sql);
  await db.exec(sql);   // idempotent: a second run must change nothing
  const rows = (await db.query("select period::text p, net_profit, net_cash_flow from finance_ledger order by period")).rows;
  check(rows[0].net_profit === null && Number(rows[0].net_cash_flow) === 5000000,
    "migration moves the bank flow out of net_profit into net_cash_flow", JSON.stringify(rows[0]));
  check(Number(rows[1].net_cash_flow) === -200000 && rows[2].net_cash_flow === null, "…for every row, and leaves unknowns unknown");
  const bk = (await db.query("select count(*)::int c, sum(net_profit)::numeric s from finance_ledger_net_profit_backup_c")).rows[0];
  check(bk.c === 2 && Number(bk.s) === 4800000, "…after backing up every original net_profit (nothing lost, re-run safe)", JSON.stringify(bk));
  await db.close();
}

/* ===================================================================== */
/* 7 (P0) — forecast baseline: last COMPLETE month; margin is an assumption */
/* ===================================================================== */
{
  const rows = [
    { period: "2026-10-01", revenue: 90_000 },     // month-to-date: must NOT be the baseline
    { period: "2026-09-01", revenue: 1_200_000 },
    { period: "2026-08-01", revenue: 1_100_000 },
  ];
  const full = lastCompleteMonthRevenue(rows, "2026-10");
  check(full && full.period === "2026-09" && full.revenue === 1_200_000, "baseline: last complete month, never MTD", JSON.stringify(full));
  check(lastCompleteMonthRevenue([{ period: "2026-10-01", revenue: 5 }], "2026-10") === null, "baseline: no complete month → unknown");
  const fc = src("src/app/(app)/forecast/page.tsx");
  check(!/pick\("gross_margin"\)/.test(fc) && /margin: null/.test(fc), "forecast no longer reads keys metrics.ts never emits");
  check(/lastCompleteMonthRevenue\(/.test(fc) && !/pick\("revenue"\)/.test(fc), "forecast baseline is the last complete month, not Revenue (MTD)");
  const sp = src("src/components/scenario-planner.tsx");
  check(!/% net,\s*from your own figures/.test(sp) && /assumption/.test(sp), "planner labels the margin as an assumption, not 'from your own figures'");
}

/* ===================================================================== */
/* 17 (P1) — 13-week cash scheduled by due date                           */
/* ===================================================================== */
{
  const T = "2026-10-14";
  const s = scheduleByDueDate([
    { amount: 100, due: "2026-10-20" },   // week 1 (6 days out)
    { amount: 200, due: "2026-12-30" },   // 77 days out → week 12 (index 11)
    { amount: 300, due: "2026-09-30" },   // 14 days overdue → week 1, flagged
    { amount: 400, due: "2026-03-01" },   // >90 days overdue → doubtful, excluded
    { amount: 500, due: null },           // undated
    { amount: 600, due: "2027-06-01" },   // beyond the window
  ], T, { doubtfulAfterDays: 90, undated: "exclude" });
  check(s.weeks[0] === 400 && s.weeks[11] === 200, "cash13: each amount lands in the week it falls due", JSON.stringify(s.weeks));
  check(s.excludedDoubtful === 400 && s.overdueInWeek1 === 300, "cash13: >90 days overdue is excluded as doubtful, the rest in week 1");
  check(s.undatedExcluded === 500 && s.beyondWindow === 600, "cash13: undated inflows and post-window amounts are counted, not spread");
  const page = src("src/app/(app)/cash13/page.tsx");
  check(/getTableStats\("purchase_orders"/.test(page) && /committedPOs/.test(page), "cash13 includes committed purchase orders in outflows");
  check(!/recv \/ 13/.test(page) && !/getInvoices\(\)/.test(page), "cash13 no longer spreads a 200-row book evenly over 13 weeks");
  const comp = src("src/components/cash13.tsx");
  check(/openingKnown && m\.firstNegative/.test(comp), "cash13 makes no 'goes negative' claim when the opening balance is unknown");
}

/* ===================================================================== */
/* 11, 27 (P0/P1) — importer: order dates and real-world "won" statuses   */
/* ===================================================================== */
{
  check(IMPORT_COLS.sales_orders.cols.includes("order_date"), "import: sales_orders imports order_date");
  const headers = ["Voucher No.", "Party Name", "Invoice Date", "Amount", "Status"];
  const m = resolveHeaders("sales_orders", headers);
  check(m.map.order_date === "Invoice Date", "import: 'Invoice Date' maps to order_date", JSON.stringify(m.map));
  const row = mapImportedRow("sales_orders", IMPORT_COLS.sales_orders, "org",
    applyMapping({ "Voucher No.": "S-1", "Party Name": "Patel", "Invoice Date": "01/04/2025", Amount: "1,000", Status: "Delivered" }, m));
  check(row.order_date === "2025-04-01", "import: 01/04/2025 is 1 April 2025 (day-first), not today", JSON.stringify(row));
  check(row.status === "won", "import: 'Delivered' counts as a won sale", `got ${row.status}`);
  for (const st of ["Paid", "COMPLETED", "closed", "Closed Won"]) {
    const r = mapImportedRow("sales_orders", IMPORT_COLS.sales_orders, "org", { status: st });
    check(r.status === "won", `import: '${st}' → won`, `got ${r.status}`);
  }
  check(mapImportedRow("sales_orders", IMPORT_COLS.sales_orders, "org", { status: "Closed Lost" }).status === "lost",
    "import: 'Closed Lost' is NOT a win");
  const bad = mapImportedRow("sales_orders", IMPORT_COLS.sales_orders, "org", { order_date: "not a date" });
  check(!("order_date" in bad), "import: an unreadable date is left out rather than written raw");
  check(mapImportedRow("invoices", IMPORT_COLS.invoices, "org", { type: "Purchase" }).type === "payable",
    "import: an invoice typed 'Purchase' is a payable, not a receivable");
}

/* ===================================================================== */
/* 12 (P0) — Tally Day Book routed by voucher type                        */
/* ===================================================================== */
{
  const DAYBOOK = [
    ["Sharma Steel Pvt Ltd"], ["Day Book"], ["1-Apr-2026 to 30-Apr-2026"], [],
    ["Date", "Particulars", "Voucher Type", "Voucher No.", "Debit", "Credit"],
    ["1-Apr-2026", "Patel Plastics", "Sales", "S-001", "1,20,000.00", ""],
    ["2-Apr-2026", "Raw Metals Co", "Purchase", "P-001", "", "80,000.00"],
    ["3-Apr-2026", "Mehta Industries", "Receipt", "R-010", "", "45,000.00"],
    ["4-Apr-2026", "Electricity Board", "Payment", "PY-3", "12,000.00", ""],
    ["5-Apr-2026", "Depreciation", "Journal", "J-1", "5,000.00", ""],
    ["6-Apr-2026", "Cash", "Contra", "C-1", "20,000.00", ""],
    ["Grand Total", "", "", "", "1,57,000.00", "1,25,000.00"],
  ];
  const r = flattenExport(DAYBOOK);
  const by = Object.fromEntries(r.rows.map((x) => [x["Particulars"], x["Type"]]));
  check(r.rows.length === 2, "daybook: only Sales and Purchase vouchers become invoices", JSON.stringify(r.rows.map((x) => x["Particulars"])));
  check(by["Patel Plastics"] === "receivable" && by["Raw Metals Co"] === "payable", "daybook: Sales → receivable, Purchase → payable", JSON.stringify(by));
  check(r.skippedVouchers && r.skippedVouchers.Receipt === 1 && r.skippedVouchers.Payment === 1
    && r.skippedVouchers.Journal === 1 && r.skippedVouchers.Contra === 1, "daybook: receipts/payments/journals/contra are counted, not imported", JSON.stringify(r.skippedVouchers));
  check(/left out 4 voucher/.test(r.note), "daybook: the import preview note says what was left out", r.note);
  const inv = resolveHeaders("invoices", Object.keys(r.rows[0]));
  const mapped = r.rows.map((x) => mapImportedRow("invoices", IMPORT_COLS.invoices, "org", applyMapping(x, inv)));
  check(mapped.find((x) => x.party === "Raw Metals Co")?.type === "payable", "daybook → importer: the purchase is stored as a payable", JSON.stringify(mapped));
  const so = flattenExport(DAYBOOK, { table: "sales_orders" });
  check(so.rows.length === 1 && so.rows[0]["Particulars"] === "Patel Plastics", "daybook → sales orders: a purchase is never revenue");
  check(voucherKind("Credit Note") === null && voucherKind("Sales") === "receivable", "voucherKind: notes are not new invoices");
}

/* ===================================================================== */
/* 16 (P0) — 43B(h): unrecorded agreement ages at 15 days                 */
/* ===================================================================== */
{
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table organizations (id uuid primary key default gen_random_uuid(), name text);
    create table invoices (id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id),
      party text, amount numeric, due_date date, issue_date date, status text default 'pending',
      type text default 'receivable', created_at timestamptz default now());
    create or replace function user_org_ids() returns setof uuid language sql stable as $$ select null::uuid where false $$;
  `);
  const norm = raw("supabase/migrations/2026_sales_order_customer_link.sql").match(/create or replace function cortex_norm_name[\s\S]*?\$\$;/);
  await db.exec(norm[0]);
  const org = (await db.query("insert into organizations (name) values ('F') returning id")).rows[0].id;
  // 30-day-old bills: past 15, inside 45.
  for (const p of ["Unknown Agreement Micro", "Recorded Yes Micro", "Recorded No Micro"]) {
    await db.query(`insert into invoices (org_id, party, amount, type, issue_date) values ($1, $2, 100000, 'payable',
      ((now() at time zone 'Asia/Kolkata')::date - 30))`, [org, p]);
  }
  for (const f of ["2026_msme_43bh.sql", "2026_msme_exposure_fix.sql", "2026_zzzm_msme_ist_window.sql"]) {
    await db.exec(raw("supabase/migrations/" + f));
  }
  await db.query("update vendors set udyam_category = 'micro'");
  const before = (await db.query("select * from cortex_msme_exposure($1)", [org])).rows;
  check(before.every((x) => !x.past_window), "non-vacuity: before the fix, every 30-day micro bill reads 'within 45d'");

  const mig = raw("supabase/migrations/2026_zzzz_c_msme_agreement_unknown.sql");
  await db.exec(mig);
  await db.exec(mig);   // idempotent
  await db.query("update vendors set has_written_agreement = true,  written_agreement_recorded_at = now() where name = 'Recorded Yes Micro'");
  await db.query("update vendors set has_written_agreement = false, written_agreement_recorded_at = now() where name = 'Recorded No Micro'");
  const after = Object.fromEntries((await db.query("select * from cortex_msme_exposure($1)", [org])).rows.map((x) => [x.party, x]));
  check(after["Unknown Agreement Micro"].window_days === 15 && after["Unknown Agreement Micro"].past_window === true,
    "43B(h): an UNRECORDED agreement ages at 15 days (the default `true` is no longer trusted)", JSON.stringify(after["Unknown Agreement Micro"]));
  check(after["Recorded Yes Micro"].window_days === 45 && after["Recorded Yes Micro"].past_window === false,
    "43B(h): a RECORDED written agreement gets 45 days");
  check(after["Recorded No Micro"].window_days === 15 && after["Recorded No Micro"].past_window === true,
    "43B(h): recorded 'no agreement' gets 15 days");
  const kept = (await db.query("select count(*)::int c from vendors where has_written_agreement = true")).rows[0].c;
  check(kept === 2, "43B(h): the migration rewrote no existing has_written_agreement value", `true count = ${kept}`);
  await db.close();

  const act = src("src/app/(app)/msme/actions.ts");
  check(/RANK\[role\] \|\| 0\) < \(RANK\.analyst/.test(act), "agreement toggle is rank-gated at analyst");
  check(/\.select\("id"\)/.test(act) && /length === 0/.test(act), "agreement toggle checks the update error AND that a row changed");
  const page = src("src/app/(app)/msme/page.tsx");
  check(/<AgreementToggle vendors=\{vendors\} \/>/.test(page) && /15-day window/.test(page), "/msme renders the toggle and explains the 15-day default");
  /* 15 (P1) — could-not-calculate is not signed-out. */
  const lib = src("src/lib/msme.ts");
  check(/if \(error\) return failed\(/.test(lib) && /exp\.error \?/.test(page), "/msme distinguishes 'could not calculate' from 'sign in'");
  check(!/\.limit\(500\)/.test(lib) && /pageAll<any>\(\(a, b\) => sb\.from\("vendors"\)/.test(lib), "vendors are paged, not capped at 500");
  check(/error: `Could not add/.test(lib), "a failed vendor sync returns its reason");
}

/* ===================================================================== */
/* 19 (P0) — privacy text must be true                                    */
/* ===================================================================== */
{
  for (const p of ["src/app/(app)/bank/page.tsx", "src/components/bank-statement.tsx", "src/app/(app)/gst-reader/page.tsx", "src/components/gst-return.tsx"]) {
    const s = src(p);
    check(!/nothing (is )?stored/i.test(s) && !/read (in your browser|on your device)/i.test(s),
      `${p}: no "read on your device / nothing stored" claim`);
    check(/AI provider/.test(s), `${p}: says the text is sent to our AI provider`);
  }
  /* 18 (P1) — held / failed saves are shown. */
  for (const p of ["src/components/bank-statement.tsx", "src/components/gst-return.tsx"]) {
    const s = src(p);
    check(/if \(j\.held\) setLedger\(\{ kind: "held"/.test(s) && /setMemErr\(/.test(s), `${p}: shows held reasons and Memory save failures`);
  }
}

/* ===================================================================== */
/* 10, 23, 24, 25, 26 (P1)                                                */
/* ===================================================================== */
{
  const pr = src("src/lib/practice.ts");
  check(/if \(r\.error\) unchecked\.push\("receivables"\)/.test(pr) && /Couldn't check/.test(pr),
    "practice: a failed read shows 'couldn't check', never 'Nothing needs you'");
  check(!/\.limit\(1000\)/.test(pr), "practice: receivables are paged, not silently capped at 1,000");
  const inv = src("src/app/(app)/inventory/page.tsx");
  check(!/movement/.test(inv), "inventory: no KPI is computed from the never-written `movement` column");
  const cu = src("src/app/(app)/customers/page.tsx");
  check(/Score \(rule-based\)/.test(cu) && !/AI score/.test(cu), "customers: the fixed rule is not labelled 'AI score'");
  const ch = src("src/lib/customer-history.ts");
  check(/recencyDays: h && h\.last \? daysSince\(h\.last\) : null/.test(ch), "rfm: a customer with no orders has no recency (not created_at)");
  const rfm = src("src/app/(app)/rfm/page.tsx");
  check(/\.filter\(\(c\) => c\.hasOrders\)/.test(rfm) && /monetary: c\.monetary12m/.test(rfm), "rfm: only customers with orders are segmented, on 12-month figures");
  const c360 = src("src/lib/customer-360.ts");
  check(/o\.customer_id == null && normalizeCustomerName/.test(c360), "customer 360: name matches never pull orders linked to another customer");
}

console.log(`\nnumbers fixes: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
