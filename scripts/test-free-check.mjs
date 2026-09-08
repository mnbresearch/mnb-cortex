/*
  The free ledger analysis — the first number this product ever shows a stranger.

  WHY THIS IS TESTED HARDER THAN IT LOOKS

  Someone who has never heard of us pastes their debtor list and gets back a
  figure. If that figure is wrong they will not file a bug; they will close the
  tab and conclude the product cannot count. There is no support conversation
  and no second chance, so every case below is a way the arithmetic could be
  quietly wrong on real Indian ledger data.

  The three that would actually happen:

  1. `parseFloat("1,20,000")` is 1. Indian digit grouping puts a comma after
     two digits, not three, and the naive parse returns a plausible-looking
     number rather than NaN — so ₹12 lakh of receivables reports as ₹1 and
     nobody notices.

  2. `new Date("03-04-2026")` is MARCH 4th in every JS engine. Tally and Busy
     export dd-mm-yyyy. For eight months of the year that turns an invoice
     three months overdue into one that is not due yet — the exact opposite of
     what this product is for.

  3. Already-paid rows counted as outstanding. Every accounting export includes
     settled invoices; summing the column gives a total that is too big and a
     debtor list of people who already paid. The first thing an owner would do
     with that report is find someone they know has paid, and stop reading.

  `now` is injected everywhere so nothing here is time-dependent. An ageing
  test that only passes in the week it was written is not a test.
*/
import { analyseLedger, parseAmount, parseDate } from "../src/lib/free-check.ts";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else failures.push(`${name}${detail ? " — " + detail : ""}`);
}
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* Fixed clock: 1 June 2026. */
const NOW = Date.UTC(2026, 5, 1);
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);

/* ============================================ amounts ==================== */

eq("plain number", parseAmount("50000"), 50000);
eq("Indian grouping: 1,20,000 is twelve lakh, not one", parseAmount("1,20,000"), 120000);
eq("western grouping still works", parseAmount("120,000"), 120000);
eq("rupee sign", parseAmount("₹1,20,000"), 120000);
eq("decimals survive", parseAmount("1,20,000.50"), 120000.5);
eq("trailing text", parseAmount("120000 INR"), 120000);
eq("accounting parentheses mean negative", parseAmount("(5,000)"), -5000);
eq("leading minus", parseAmount("-5000"), -5000);
check("empty is NaN, not zero", Number.isNaN(parseAmount("")),
  "zero would be counted as a real row worth nothing; NaN is skipped and reported");
check("text is NaN", Number.isNaN(parseAmount("n/a")));

/* ============================================ dates ====================== */

eq("ISO", parseDate("2026-03-04"), Date.UTC(2026, 2, 4));
eq("dd-mm-yyyy is read DAY first", parseDate("03-04-2026"), Date.UTC(2026, 3, 3));
eq("dd/mm/yyyy", parseDate("03/04/2026"), Date.UTC(2026, 3, 3));
eq("two-digit year", parseDate("03/04/26"), Date.UTC(2026, 3, 3));
eq("day above 12 is unambiguous", parseDate("25-04-2026"), Date.UTC(2026, 3, 25));
eq("month above 12 means the file is month-first after all", parseDate("04-25-2026"), Date.UTC(2026, 3, 25));
check("junk is null", parseDate("not a date") === null);
check("empty is null", parseDate("") === null);

/* ============================================ the ledger ================= */

const LEDGER = [
  { party: "Sharma Steel (India) Pvt Ltd", amount: 300000, dueDate: daysAgo(94) },
  // Deliberately NOT yet due, so `amount` and `overdue` differ for this party
  // and the ranking assertion below is testing something.
  { party: "Sharma Steel (India) Pvt Ltd", amount: 100000, dueDate: daysAgo(-20) },
  { party: "Verma Traders", amount: 80000, dueDate: daysAgo(5) },
  { party: "Gupta & Co", amount: 50000, dueDate: daysAgo(-30) },          // not yet due
  { party: "Already Paid Ltd", amount: 900000, dueDate: daysAgo(200), status: "Paid" },
];
const r = analyseLedger(LEDGER, NOW);

eq("every row is counted", r.rows, 5);
eq("settled rows are excluded from usable", r.usable, 4);
eq("outstanding excludes the paid invoice", r.totalOutstanding, 530000);
check("a settled row cannot appear as a debtor",
  !r.topDebtors.some((d) => d.party === "Already Paid Ltd"),
  "showing someone their own paid invoice as outstanding is how they stop trusting the number");
eq("overdue count", r.overdueCount, 2);
eq("overdue value", r.overdueValue, 380000);
eq("oldest overdue in days", r.oldestOverdueDays, 94);
eq("oldest names the party", r.oldestOverdueParty, "Sharma Steel (India) Pvt Ltd");

check("debtors are ranked by overdue, not by total",
  r.topDebtors[0].party === "Sharma Steel (India) Pvt Ltd",
  JSON.stringify(r.topDebtors[0]));
eq("a party's invoices are summed", r.topDebtors[0].amount, 400000);
eq("...and its overdue portion separately", r.topDebtors[0].overdue, 300000);

check("concentration is called out when one party dominates",
  r.findings.some((f) => /concentration risk/i.test(f)),
  r.findings.join(" | "));
check("the overdue finding carries a rupee figure",
  r.findings.some((f) => /₹3,80,000/.test(f)),
  r.findings.join(" | "));

/* ---- status words that mean settled --------------------------------- */
for (const s of ["paid", "PAID", "Settled", "cleared", "received"]) {
  const one = analyseLedger([{ party: "X", amount: 1000, dueDate: daysAgo(60), status: s }], NOW);
  eq(`"${s}" counts as settled`, one.totalOutstanding, 0);
}
const unpaid = analyseLedger([{ party: "X", amount: 1000, dueDate: daysAgo(60), status: "Partially paid" }], NOW);
eq("'Partially paid' is NOT treated as settled", unpaid.totalOutstanding, 1000);

/* ---- no due date: fall back to issue + 30, and say so ---------------- */
const noDue = analyseLedger([{ party: "A", amount: 10000, issueDate: daysAgo(50) }], NOW);
eq("issue+30 makes a 50-day-old invoice overdue", noDue.overdueCount, 1);
eq("...by 20 days", noDue.oldestOverdueDays, 20);

/* ---- no dates at all: nothing may be claimed as overdue -------------- */
const noDates = analyseLedger([{ party: "A", amount: 10000 }, { party: "B", amount: 5000 }], NOW);
check("with no dates, ageing is refused rather than guessed", noDates.overdueCount === 0 && noDates.datesMissing);
check("...and the report says why",
  noDates.findings.some((f) => /no date column/i.test(f)),
  noDates.findings.join(" | "));

/* ---- 43B(h): exposure, never a certainty ---------------------------- */
const msme = analyseLedger([
  { party: "Supplier A", amount: 200000, issueDate: daysAgo(60) },
  { party: "Supplier B", amount: 100000, issueDate: daysAgo(20) },
], NOW);
eq("only entries past 45 days count", msme.msmeCount, 1);
eq("...and their value", msme.msmeAtRisk, 200000);
check("43B(h) is framed as exposure to check, not a settled fact",
  msme.findings.some((f) => /if any of those suppliers are MSME-registered/i.test(f)),
  "we cannot know a supplier's Udyam status from a pasted file, and claiming otherwise is the overreach the in-product module was rewritten to remove");

/* ---- degenerate input ------------------------------------------------ */
const empty = analyseLedger([], NOW);
eq("empty input is safe", empty.totalOutstanding, 0);
const junk = analyseLedger([{ party: "A", amount: NaN }, { party: "B" }], NOW);
eq("unreadable rows are not counted as usable", junk.usable, 0);
check("...and that is stated rather than shown as ₹0 outstanding",
  junk.findings.some((f) => /could not read an amount/i.test(f)),
  junk.findings.join(" | "));

/* ---- nothing overdue reads as good news, not as an error ------------ */
const clean = analyseLedger([{ party: "A", amount: 10000, dueDate: daysAgo(-10) }], NOW);
check("a clean ledger says so plainly",
  clean.findings.some((f) => /Nothing is overdue/i.test(f)),
  clean.findings.join(" | "));

/* ------------------------------------------------------------------ report */
console.log(`\nfree ledger check: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log("  Indian grouping, day-first dates, settled rows excluded, ageing refused when undatable.");
