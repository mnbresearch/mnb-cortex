/**
 * Cross-file follow-ups: each block guards one fix. Pure logic is EXECUTED
 * (money-rules, the export flattener); everything that needs Supabase or a
 * React tree is guarded by narrow source assertions with comments stripped
 * first, so prose that names a fix cannot satisfy a check after the code has
 * been reverted. Every assertion was mutation-checked (revert -> fail -> restore).
 *
 *   node --experimental-strip-types --no-warnings scripts/test-followups.mjs
 */
import { readFileSync } from "node:fs";
import { isOpenReceivable, isPastDueReceivable, likeForLikeWindows } from "../src/lib/money-rules.ts";
import { flattenExport } from "../src/lib/accounting-export.ts";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const raw = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (p) => strip(raw(p));

/* 1 — MIS pack: unknown profit is blank, bank flow has its own column, payroll is labelled as payroll */
{
  const x = src("src/lib/engine/xlsx.ts");
  const mis = x.slice(x.indexOf("async function misPack"), x.indexOf("await receivablesAgeing(wb, orgId, biz);", x.indexOf("async function misPack")));
  check(!/np: Number\(r\.net_profit\) \|\| 0/.test(mis) && /np: known\(r\.net_profit\)/.test(mis), "MIS: net profit is blank when null, not ₹0");
  check(/ncf: known\(r\.net_cash_flow\)/.test(mis) && /Net cash flow \(bank/.test(mis), "MIS: a Net cash flow (bank) column reads net_cash_flow");
  check(/from\("finance_ledger"\)\.select\("\*"\)/.test(mis), "MIS: ledger read tolerates a missing net_cash_flow column (select *)");
  check(!/header: "Opex \(₹\)"/.test(mis) && /Monthly payroll on file/.test(mis), "MIS: the opex column is labelled as the monthly payroll it is");
  check(/E\$\{n\}=""/.test(mis) && /F\$\{n\}=""/.test(mis), "MIS: a blank profit gives a blank margin, not 0%");
}

/* 2 — one past-due rule */
{
  const today = "2026-10-14";
  check(isOpenReceivable({ status: null, type: null }) && !isOpenReceivable({ type: "payable" }), "money-rules: untyped is a receivable, payables never are");
  check(isPastDueReceivable({ status: "Overdue", type: null }, today), "money-rules: status overdue (any case) is past due without a date");
  check(!isPastDueReceivable({ status: "overdue", type: "payable" }, today), "money-rules: a payable is never past-due receivable");
  const col = src("src/lib/collections/index.ts");
  check(!/\.eq\("type", "receivable"\)/.test(col) && /\.filter\(\(inv\) => isOpenReceivable\(inv\)\)/.test(col),
    "collections: candidates use the shared open-receivable rule (untyped included, payables excluded)");
  check(/if \(!due\) blockedBy =/.test(col), "collections: still never chases an invoice with no due date");
  const act = src("src/lib/actions.ts");
  const od = act.slice(act.indexOf("const today = istTodayISO();"), act.indexOf("if (!overdue.length)"));
  check(/isPastDueReceivable\(i, today\)/.test(od) && !/\.eq\("type", "receivable"\)/.test(od), "overdue email: uses isPastDueReceivable, not its own filter");
}

/* 3 — imports flatten for the table being imported */
{
  const grid = [["Date", "Particulars", "Voucher Type", "Debit", "Credit"],
    ["2026-04-01", "Acme", "Sales", "1000", ""], ["2026-04-02", "Supplier", "Purchase", "", "400"], ["2026-04-03", "Acme", "Receipt", "", "1000"]];
  const so = flattenExport(grid, { table: "sales_orders" });
  check(so.rows.length === 1 && so.skippedVouchers && so.skippedVouchers.Purchase === 1, "flattenExport({table:'sales_orders'}) drops purchases", JSON.stringify(so.skippedVouchers));
  const act = src("src/lib/actions.ts");
  const url = act.slice(act.indexOf("export async function importFromUrl"));
  check(/flattenExport\(parseCsvGrid\(await res\.text\(\)\), \{ table \}\)/.test(url), "importFromUrl: flattenExport(grid, { table })");
  check(/\.\.\.flatInfo/.test(url) && /skippedVouchers: flat\.skippedVouchers/.test(url), "importFromUrl: returns note / skippedVouchers");
  const ci = src("src/components/csv-import.tsx");
  check(/flattenExport\(g0, \{ table: target \}\)/.test(ci) && /flattenExport\(grid, \{ table: next \}\)/.test(ci), "csv-import: flattens for the selected table (and re-flattens on change)");
  check(/result\.note &&/.test(ci), "csv-import: the URL path shows the flattener's note");
}

/* 5 — leads and pipeline: error card, truncation, KPIs over every row */
{
  const pl = src("src/app/(app)/pipeline/page.tsx");
  check(/getTableStats\("sales_pipeline"/.test(pl) && /scorePipeline\(kpiRows/.test(pl) && !/scorePipeline\(deals/.test(pl), "pipeline: KPIs from getTableStats, not the 200-row list");
  check(/\{kpiError && \(/.test(pl) && /!kpiError && deals\.length === 0/.test(pl), "pipeline: a read error is an error card, not 'No deals yet'");
  check(/!kpiError && truncated &&/.test(pl), "pipeline: says when the board is truncated");
  const ld = src("src/app/(app)/leads/page.tsx");
  check(/getTableStats\("leads"/.test(ld) && /\{loadFailed \? \(/.test(ld), "leads: a failed read shows an error, not 'No leads yet'");
  check(/Showing the latest/.test(ld) && /partial \?/.test(ld), "leads: 'showing the latest N of M' when truncated");
}

/* 7 — the anon bar no longer claims deadline emails */
{
  const a = src("src/components/anon-tool-bar.tsx");
  check(!/emails you/.test(a) && /dashboard and compliance calendar/.test(a), "anon bar: says deadlines are shown in the app, not emailed");
}

/* 8 — YoY is like for like */
{
  const w = likeForLikeWindows("2026-10-14");
  check(w && w.thisStart === "2026-10-01" && w.thisEnd === "2026-10-15" && w.lastStart === "2025-10-01" && w.lastEnd === "2025-10-15",
    "likeForLike: days 1..14 of October vs days 1..14 of October last year", JSON.stringify(w));
  const leap = likeForLikeWindows("2028-02-29");
  check(leap && leap.lastEnd === "2027-03-01" && leap.thisEnd === "2028-03-01", "likeForLike: 29 Feb clamps to 28 Feb last year", JSON.stringify(leap));
  const eom = likeForLikeWindows("2026-10-31");
  check(eom && eom.thisEnd === "2026-11-01", "likeForLike: month-end rolls the exclusive end into next month");
  check(likeForLikeWindows("garbage") === null, "likeForLike: junk date → null");
  const m = src("src/lib/metrics.ts");
  check(!/buckets\[0\]/.test(m) && /likeForLikeWindows\(today\)/.test(m) && /metric_key: "growth"/.test(m), "metrics: growth uses like-for-like windows, keeps the 'growth' key");
  check(/if \(r\.error \|\| r\.truncated\) return null;/.test(m), "metrics: a failed or truncated window read gives no metric, never a guess");
}

/* 10 — skip-link targets */
{
  for (const f of ["src/app/(app)/chat/page.tsx", "src/app/(app)/superadmin/paytest/page.tsx"]) {
    const s = src(f);
    check((s.match(/id="main"/g) || []).length === 1 && /tabIndex=\{-1\}/.test(s) && !/PageShell/.test(s), `${f}: exactly one id="main" skip target`);
  }
}

/* 11 — image/video denial message */
{
  const c = src("src/lib/credits.ts");
  check(!/generation isn't included on the \$\{plan\} plan/.test(c) && /need \$\{needs\} or above — credit packs don't include it\./.test(c), "credits: denial names the plan that includes it and says packs don't");
  check(/PLANS\.find\(\(p\) => !\/retired\/i\.test\(p\.name\) && \(IMAGE_WEEKLY\[p\.id\] \?\? 0\) > 0/.test(c), "credits: plan name derived from the weekly tables, not hardcoded");
}

/* 12 — pooled-by name */
{
  const b = src("src/lib/billing.ts");
  check(/pooledByName: string \| null;/.test(b) && /pooledByName = firmName \? firmName\.slice\(0, 120\) : null;/.test(b) && /pooledBy, pooledByName,/.test(b), "billing: pooledByName from the firm row, null-tolerant");
  const pg = src("src/app/(app)/billing/page.tsx");
  check(/billing\.pooledByName \? `\$\{billing\.pooledByName\}'s` : "your CA firm's"/.test(pg), "billing page: 'Covered by {name}'s Practice plan'");
}

/* 13 — AI replies: branch on ok */
{
  for (const f of ["funding-calculator", "rfm-segments", "financial-ratios", "alert-rules"]) {
    const s = src(`src/components/${f}.tsx`);
    check(!/setOut\(j\.text \|\| "No response\."\)/.test(s) && /j\.ok === true/.test(s) && /setErr\(aiFailure\(j\)\)/.test(s) && /\{err && /.test(s), `${f}: an error reply is shown as an error, not as the analysis`);
  }
  const e = src("src/components/email-console.tsx");
  check(!/if \(j\.text\) setBody/.test(e) && /j\.ok === true[\s\S]{0,80}setBody\(/.test(e) && /setMsg\(aiFailure\(j\)\)/.test(e), "email console: AI error text never lands in the email body");
}

console.log(`\nfollow-ups: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
