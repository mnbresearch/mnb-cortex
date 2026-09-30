/**
 * The warning must name the customer, because the landing page says it does.
 *
 * ============================================================================
 * THE CLAIM UNDER TEST
 * ============================================================================
 *
 * Three public surfaces promise a named customer:
 *
 *   page.tsx      "names the worst thing in what you just sent — which
 *                  customer, how much, how late"
 *   page.tsx      "Cortex emails you the day an invoice crosses its due date
 *                  — with the name and the number."
 *   investors     "names the thing that is about to cost you money — the
 *                  customer, the amount, the date"
 *
 * For a long time none of it was true. `InsightSignals` had no party field of
 * any kind; the receivables insight read "₹4.2 L of receivables is past its
 * due date" and the alert email was built from that same title. The name
 * existed on /receivables and nowhere else.
 *
 * This suite holds the mechanism to the claim. It is deliberately split into
 * three: the ranking (pure), the insight wording (pure), and the wiring
 * (source-level) — because the first two can be proven by running them and
 * the third cannot, and it is worth being honest about which is which.
 */

import { readFileSync } from "node:fs";
import { worstOverdue, daysLate, byWorst } from "../src/lib/worst-invoice.ts";
import { deriveInsights } from "../src/lib/insights.ts";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const eq = (a, b, n) => check(JSON.stringify(a) === JSON.stringify(b), n, `got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

const TODAY = "2026-09-30";

/* ======================================================================== */
/* 1. THE RANKING                                                           */
/* ======================================================================== */

eq(daysLate("2026-09-20", TODAY), 10, "daysLate counts whole days");
eq(daysLate("2026-09-30", TODAY), 0, "an invoice due today is not late");
eq(daysLate("2026-10-05", TODAY), -5, "a future invoice is negative, not clamped");

/*
  THE CASE THAT DECIDES THE RANKING RULE.

  ₹50,000 at 200 days is a bad debt. ₹2,00,000 at 3 days is a customer who
  pays on the 5th. Ranking on amount alone picks the second and wastes the
  owner's phone call, so the rule is amount x days.
*/
const mixed = [
  { party: "Slow Pay Ltd", amount: 50_000, due_date: "2026-03-14", status: "pending", type: "receivable" },
  { party: "Big But Punctual", amount: 200_000, due_date: "2026-09-27", status: "pending", type: "receivable" },
];
eq(worstOverdue(mixed, TODAY)?.party, "Slow Pay Ltd",
  "amount x days beats amount alone — the old bad debt outranks the big fresh invoice");

eq(worstOverdue(mixed, TODAY)?.daysLate, 200, "the named invoice carries its own days late");
eq(worstOverdue(mixed, TODAY)?.amount, 50_000, "and its own amount, not the aggregate");

/* Exclusions, each one its own assertion so a failure says which rule broke. */
const base = { party: "Acme", amount: 100_000, due_date: "2026-08-31", status: "pending", type: "receivable" };
eq(worstOverdue([{ ...base, status: "paid" }], TODAY), null, "a paid invoice is never named");
eq(worstOverdue([{ ...base, type: "payable" }], TODAY), null, "a payable is money we owe, not money owed to us");
eq(worstOverdue([{ ...base, due_date: "2026-10-30" }], TODAY), null, "an invoice not yet due is not overdue");
eq(worstOverdue([{ ...base, due_date: TODAY }], TODAY), null, "due today is not late");
eq(worstOverdue([{ ...base, amount: 0 }], TODAY), null, "a zero-rupee invoice is not worth a phone call");
eq(worstOverdue([{ ...base, amount: -5000 }], TODAY), null, "a credit note is not an overdue invoice");
eq(worstOverdue([], TODAY), null, "no invoices, nothing to name");

/*
  NO PARTY MEANS NO NAME — NOT "Unknown".

  The entire point of the claim is to name a customer. "Unknown owes you ₹2 L"
  is worse than the aggregate it would replace, so an unnamed invoice is
  skipped for naming while still counting towards the total elsewhere.
*/
eq(worstOverdue([{ ...base, party: null }], TODAY), null, "an invoice with no party is never invented into a name");
eq(worstOverdue([{ ...base, party: "   " }], TODAY), null, "nor is a whitespace-only party");
eq(worstOverdue([{ ...base, party: null }, { ...base, party: "Real Co" }], TODAY)?.party, "Real Co",
  "an unnamed invoice does not block a named one behind it");

/* Amounts arriving as strings from PostgREST numerics. */
eq(worstOverdue([{ ...base, amount: "100000" }], TODAY)?.amount, 100_000, "numeric strings are parsed, not NaN");

/* Status 'overdue' with no due_date: real, but of unknown age. */
const noDate = worstOverdue([{ party: "No Date Co", amount: 90_000, due_date: null, status: "overdue", type: "receivable" }], TODAY);
eq(noDate?.daysLate, 1, "an overdue invoice with no due date scores one day — considered, never top-ranked");
eq(worstOverdue([{ party: "Pending No Date", amount: 90_000, due_date: null, status: "pending", type: "receivable" }], TODAY), null,
  "but merely pending with no due date is not overdue at all");

/* The comparator /receivables shares. */
const sorted = [{ amount: 10, days: 1 }, { amount: 1, days: 100 }, { amount: 5, days: 5 }].sort(byWorst);
eq(sorted.map((x) => x.amount * x.days), [100, 25, 10], "byWorst sorts worst-first by amount x days");

/* ======================================================================== */
/* 2. THE WORDING                                                           */
/* ======================================================================== */

const signals = {
  hasSales: true, hasInvoices: true, hasStock: false, hasStaff: false, hasBank: false,
  revenueNow: 0, revenuePrev: 0, ordersNow: 0, ordersUnset: 0,
  openRecv: 1_000_000, overdueRecv: 400_000, openPay: 0,
  itemCount: 0, belowReorder: 0, coverDays: null, stockValue: 0,
  avgAttrition: 0, avgAttend: 0, payroll: 0,
  cashClosing: 0, avgNet: 0,
};

const named = deriveInsights({ ...signals, worstOverdue: { party: "Patel Brothers Auto", amount: 879_000, daysLate: 122 } })
  .find((i) => i.route === "/receivables");

check(!!named, "the receivables insight is produced");
check(named.title.includes("Patel Brothers Auto"), "THE CLAIM: the title names the customer", named?.title);
check(/122 days/.test(named.title), "the title says how late", named?.title);
check(/₹8\.79 L/.test(named.title), "the title says how much", named?.title);
check(named.recommended_actions[0] === "Call Patel Brothers Auto today",
  "the first recommended action names them too", named?.recommended_actions?.[0]);
check(named.detail.includes("₹4.00 L"),
  "the detail still carries the portfolio total, so the named invoice is not mistaken for the whole problem", named?.detail);

/*
  THE FALLBACK MUST SURVIVE.

  A workspace whose invoices carry no party names still deserves the warning
  it always got. Making the named version mandatory would have turned a
  working feature into a blank space for anyone importing from a system that
  does not export a counterparty.
*/
const unnamed = deriveInsights(signals).find((i) => i.route === "/receivables");
check(!!unnamed, "an insight is still produced with no worstOverdue at all");
check(/of receivables is past its due date/.test(unnamed.title),
  "and falls back to the aggregate wording rather than a placeholder name", unnamed?.title);
check(!/undefined|null|NaN|Unknown/.test(unnamed.title + unnamed.detail),
  "the fallback leaks no undefined, null, NaN or 'Unknown'", unnamed?.title);

const explicitNull = deriveInsights({ ...signals, worstOverdue: null }).find((i) => i.route === "/receivables");
check(/of receivables is past its due date/.test(explicitNull.title), "an explicit null falls back the same way");

/* Severity must not have changed: it is a portfolio judgement, not a per-invoice one. */
eq(named.severity, unnamed.severity, "naming the customer does not change the severity band");

/* ======================================================================== */
/* 3. THE WIRING                                                            */
/* ======================================================================== */

const metrics = read("src/lib/metrics.ts");

check(/worstOverdue\(overdueRows,\s*today\)/.test(metrics),
  "recomputeMetrics passes the worst invoice into deriveInsights");

/*
  The read must NOT be conditional on the aggregate.

  Every other row read in that Promise.all is `agg ? Promise.resolve(...) : ...`
  because cortex_aggregate() already returned the sums. This one is different:
  the aggregate returns no party, so gating it the same way would mean the
  customer's name appears only on databases that have NOT run the performance
  migration — i.e. it would silently vanish in production and work locally.
*/
/*
  Matched from the START OF THE LINE, not from `svc.`.

  My first version of this check anchored on `svc.from("invoices").select("party`
  and then asserted the match contained no `agg ?`. Mutation M5 — prefixing the
  statement with `agg ? Promise.resolve({ data: [] }) : ` exactly as the six
  neighbouring reads are written — PASSED, because the conditional sits before
  the anchor and therefore outside the window being examined. The guard was
  looking downstream of the thing it was meant to catch.
*/
const ovLine = metrics.split("\n").find((l) => /\.from\("invoices"\)\s*\.select\("party/.test(l));
check(!!ovLine, "there is a dedicated invoices read that selects party");
check(!!ovLine && !/\bagg\s*\?/.test(ovLine),
  "that read is unconditional — not skipped on the cortex_aggregate fast path",
  ovLine ? `the line is gated: ${ovLine.trim().slice(0, 90)}` : "");
const ovRead = ovLine ? [metrics.slice(metrics.indexOf(ovLine)).split(";")[0]] : null;
check(!!ovRead && /\.eq\("org_id",\s*orgId\)/.test(ovRead[0]),
  "and it is scoped to the org, like every other read");
check(!!ovRead && /\.limit\(/.test(ovRead[0]), "and bounded");

/* The IST date, not UTC — an invoice due today must not read "1 day late". */
check(/worstOverdue\(overdueRows,\s*today\)/.test(metrics) && /const today = new Intl\.DateTimeFormat/.test(metrics),
  "the date passed in is the IST calendar date metrics.ts already computes");

/* One ranking, two callers. */
const aging = read("src/components/receivables-aging.tsx");
check(/byWorst/.test(aging) && /from "@\/lib\/worst-invoice"/.test(aging),
  "/receivables ranks with the shared comparator");
check(!/b\.amount \* b\.days - a\.amount \* a\.days/.test(aging),
  "and no longer carries its own copy of the rule",
  "two implementations of 'worst' is how the dashboard and /receivables come to name different customers");

/* The public claim itself must still be on the page — this suite is worthless
   if the copy quietly goes away and the mechanism is left untested. */
const landing = read("src/app/page.tsx");
check(/which customer/i.test(landing) || /the customer, the amount/i.test(landing),
  "the landing page still makes the named-customer claim this suite exists to back");

console.log(`\nworst invoice: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  the warning names the customer, ranked by amount x days, shared with /receivables.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
