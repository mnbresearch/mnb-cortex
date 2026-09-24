/**
 * Advance tax: the cliff, the base, and the two schedules.
 *
 * ============================================================================
 * WHY THIS SUITE IS LONGER THAN THE MODULE IT TESTS
 * ============================================================================
 *
 * /advance-tax named sections 234B and 234C in its own copy and computed
 * neither. It also collected "Advance tax already paid" and rendered the
 * result nowhere — an input that changed nothing on screen.
 *
 * Adding the arithmetic means the page now states a rupee figure about
 * somebody's tax, which is a different class of claim from a table of
 * percentages. Three things about section 234C are easy to get plausibly
 * wrong, and each of the three produces a confident, specific, incorrect
 * number:
 *
 *   1. THE CLIFF AND THE BASE ARE DIFFERENT NUMBERS. Pay at least 12% by
 *      15 June and no interest is charged — but miss that, and interest runs
 *      on the shortfall from FIFTEEN per cent, not from twelve. Reading a
 *      summary and implementing "shortfall below 12%" understates every
 *      charge; implementing "shortfall below 15%" with no relief overstates
 *      every charge for a business inside the tolerance. Both boundaries are
 *      pinned below, to the rupee.
 *
 *   2. THE PERIODS ARE FIXED, NOT PRORATED. Three months on each of the first
 *      three instalments, one month on the last. Not days late.
 *
 *   3. PRESUMPTIVE TAXPAYERS HAVE ONE INSTALMENT. Running the four-instalment
 *      schedule against a 44AD business tells it that it is three payments
 *      late when it is not late at all — an invented liability.
 *
 * The worked example from the Department's own guidance is executed verbatim.
 */

import { readFileSync } from "node:fs";
import {
  computeAdvanceTax, nextInstalment, SCHEDULE, PRESUMPTIVE_SCHEDULE,
  ADVANCE_TAX_THRESHOLD, INTEREST_RATE_PER_MONTH, ADVANCE_TAX_AS_OF,
} from "../src/lib/advance-tax.ts";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const eq = (got, want, n, d = "") => check(got === want, n, `expected ${want}, got ${got}${d ? " · " + d : ""}`);
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

/* ======================================================================== */
/* 1. THE SCHEDULE ITSELF                                                   */
/* ======================================================================== */

eq(SCHEDULE.length, 4, "four instalments");
eq(SCHEDULE.map((s) => s.cum).join(","), "0.15,0.45,0.75,1", "cumulative targets are 15/45/75/100");
eq(SCHEDULE.map((s) => s.relief).join(","), "0.12,0.36,0.75,1",
  "relief thresholds are 12/36/75/100",
  "The first two have a tolerance BELOW the target. The last two do not.");
eq(SCHEDULE.map((s) => s.months).join(","), "3,3,3,1",
  "three months on the first three instalments, one on the last");
eq(PRESUMPTIVE_SCHEDULE.length, 1, "44AD/44ADA has exactly one instalment");
eq(PRESUMPTIVE_SCHEDULE[0].by, "15 Mar", "…and it falls on 15 March");
eq(ADVANCE_TAX_THRESHOLD, 10_000, "advance tax starts at ₹10,000 of annual liability");
eq(INTEREST_RATE_PER_MONTH, 0.01, "1% per month");

/* ======================================================================== */
/* 2. THE DEPARTMENT'S OWN WORKED EXAMPLE                                   */
/* ======================================================================== */

/*
  Liability ₹1,00,000. ₹15,000 due by 15 June; ₹10,000 paid. Published answer:
  1% x ₹5,000 x 3 months = ₹150.

  Note that ₹10,000 is 10% — BELOW the 12% cliff — so interest is charged, and
  it is charged on 15,000 − 10,000, not on 12,000 − 10,000. An implementation
  that used the relief as the base would return ₹60 here.
*/
{
  const r = computeAdvanceTax({ tax: 100_000, payments: [{ by: "15 Jun", paidCumulative: 10_000 }] });
  const jun = r.rows[0];
  eq(jun.dueCumulative, 15_000, "worked example: ₹15,000 due by 15 June");
  eq(jun.shortfall, 5_000, "worked example: shortfall is from 15%, not from 12%",
    "Using the relief threshold as the base would give 2,000 and an interest of ₹60.");
  eq(jun.interest, 150, "worked example: ₹150 of interest");
  eq(jun.withinTolerance, false, "worked example: 10% is below the 12% cliff");
}

/* ======================================================================== */
/* 3. THE CLIFF, TO THE RUPEE, ON BOTH SIDES                                */
/* ======================================================================== */

/* Exactly 12% — "not less than twelve per cent" — is inside the relief. */
{
  const r = computeAdvanceTax({ tax: 100_000, payments: [{ by: "15 Jun", paidCumulative: 12_000 }] });
  eq(r.rows[0].withinTolerance, true, "exactly 12% by 15 June is INSIDE the tolerance");
  eq(r.rows[0].shortfall, 0, "…so there is no shortfall to charge on");
  eq(r.rows[0].interest, 0, "…and no interest");
}
/* One rupee under the cliff, and the full 15% gap becomes chargeable. */
{
  const r = computeAdvanceTax({ tax: 100_000, payments: [{ by: "15 Jun", paidCumulative: 11_999 }] });
  eq(r.rows[0].withinTolerance, false, "₹1 below 12% falls off the cliff");
  eq(r.rows[0].shortfall, 3_001, "…and the shortfall jumps to the gap from 15%",
    "This discontinuity is the statute, not a bug: the relief is a cliff, not a rebate.");
  eq(r.rows[0].interest, 90, "…charged at 1% x 3 months");
}
/* The same cliff at the second instalment: 36% relief, 45% base. */
{
  const ok = computeAdvanceTax({ tax: 100_000, payments: [{ by: "15 Sep", paidCumulative: 36_000 }] });
  eq(ok.rows[1].interest, 0, "exactly 36% by 15 September is inside the tolerance");
  const under = computeAdvanceTax({ tax: 100_000, payments: [{ by: "15 Sep", paidCumulative: 35_999 }] });
  eq(under.rows[1].shortfall, 9_001, "₹1 under 36% is charged on the gap from 45%");
  eq(under.rows[1].interest, 270, "…1% x 3 months on ₹9,001");
}
/* The third and fourth instalments have NO tolerance — target is the cliff. */
{
  const r = computeAdvanceTax({ tax: 100_000, payments: [{ by: "15 Dec", paidCumulative: 74_999 }] });
  eq(r.rows[2].withinTolerance, false, "15 December has no tolerance below 75%");
  eq(r.rows[2].shortfall, 1, "…so ₹1 short is a ₹1 shortfall");
}

/* ======================================================================== */
/* 4. FULLY PAID, AND CUMULATIVE CARRY-FORWARD                              */
/* ======================================================================== */

{
  const r = computeAdvanceTax({
    tax: 240_000,
    payments: [
      { by: "15 Jun", paidCumulative: 36_000 },   // 15%
      { by: "15 Sep", paidCumulative: 108_000 },  // 45%
      { by: "15 Dec", paidCumulative: 180_000 },  // 75%
      { by: "15 Mar", paidCumulative: 240_000 },  // 100%
    ],
  });
  eq(r.interest234C, 0, "paying exactly on schedule costs nothing");
  eq(r.interest234B.applies, false, "…and 234B does not apply");
  eq(r.unpaid, 0, "…and nothing is unpaid");
}
{
  /* Only the June payment is known. The later dates must INHERIT it, not reset
     to zero — a sparse input is missing information, not evidence of arrears
     that were repaid. */
  const r = computeAdvanceTax({ tax: 100_000, payments: [{ by: "15 Jun", paidCumulative: 50_000 }] });
  eq(r.rows[1].paidCumulative, 50_000, "an unknown date carries the last known total forward");
  eq(r.rows[0].interest, 0, "…and ₹50,000 by June is well past 15%");
  eq(r.rows[1].interest, 0, "…and past 45% too");
  eq(r.rows[2].shortfall, 25_000, "…but short of 75% by December");
}

/* ======================================================================== */
/* 5. NOTHING PAID AT ALL — THE WORST CASE, CHECKED BY HAND                 */
/* ======================================================================== */

{
  const r = computeAdvanceTax({ tax: 100_000 });
  /* 15,000x1%x3 + 45,000x1%x3 + 75,000x1%x3 + 100,000x1%x1
     = 450 + 1,350 + 2,250 + 1,000 = 5,050 */
  eq(r.rows[0].interest, 450, "nothing paid: June instalment");
  eq(r.rows[1].interest, 1_350, "nothing paid: September instalment");
  eq(r.rows[2].interest, 2_250, "nothing paid: December instalment");
  eq(r.rows[3].interest, 1_000, "nothing paid: March instalment (ONE month, not three)");
  eq(r.interest234C, 5_050, "nothing paid: total 234C");
  eq(r.interest234B.applies, true, "nothing paid: 234B applies");
  eq(r.interest234B.principal, 100_000, "…on the whole liability");
  eq(r.interest234B.perMonth, 1_000, "…at ₹1,000 a month");
}

/* ======================================================================== */
/* 6. 234B's 90% LINE                                                       */
/* ======================================================================== */

{
  const at90 = computeAdvanceTax({ tax: 100_000, payments: [{ by: "15 Mar", paidCumulative: 90_000 }] });
  eq(at90.interest234B.applies, false, "exactly 90% paid: 234B does NOT apply");
  const under90 = computeAdvanceTax({ tax: 100_000, payments: [{ by: "15 Mar", paidCumulative: 89_999 }] });
  eq(under90.interest234B.applies, true, "₹1 under 90%: 234B applies");
  eq(under90.interest234B.principal, 10_001, "…on the unpaid amount, not on the 10% gap");
}
/* 234B is never reported as a total, because the period depends on when the
   owner actually pays — which this calculator cannot know. */
{
  const r = computeAdvanceTax({ tax: 100_000 });
  check(!("total" in r.interest234B), "234B exposes a rate and a principal, never a total",
    "A total would have to assume a settlement date, and would be a confident wrong number.");
}

/* ======================================================================== */
/* 7. PRESUMPTIVE                                                           */
/* ======================================================================== */

{
  const r = computeAdvanceTax({ tax: 100_000, presumptive: true });
  eq(r.rows.length, 1, "presumptive: one row, not four");
  eq(r.rows[0].by, "15 Mar", "presumptive: due 15 March");
  eq(r.interest234C, 1_000, "presumptive, nothing paid: 1% for ONE month on the full liability",
    "Running the four-instalment schedule here would charge ₹5,050 — an invented liability.");
}
{
  const r = computeAdvanceTax({ tax: 100_000, presumptive: true, payments: [{ by: "15 Mar", paidCumulative: 100_000 }] });
  eq(r.interest234C, 0, "presumptive, paid in full by 15 March: nothing owed");
}

/* ======================================================================== */
/* 8. BELOW THE ₹10,000 THRESHOLD THERE IS NO OBLIGATION                    */
/* ======================================================================== */

{
  const r = computeAdvanceTax({ tax: 9_999 });
  eq(r.belowThreshold, true, "₹9,999 of liability is below the advance-tax threshold");
  eq(r.interest234C, 0, "…so no interest, even with nothing paid",
    "Charging here would invent a liability for a small proprietor who owes none.");
  eq(r.interest234B.applies, false, "…and no 234B");
  const at = computeAdvanceTax({ tax: 10_000 });
  eq(at.belowThreshold, false, "₹10,000 exactly is IN scope");
}
{
  const zero = computeAdvanceTax({ tax: 0 });
  eq(zero.interest234C, 0, "zero liability is not a shortfall");
  const nonsense = computeAdvanceTax({ tax: Number.NaN });
  eq(nonsense.interest234C, 0, "a non-numeric liability does not produce NaN interest");
}

/* ======================================================================== */
/* 9. WHICH INSTALMENT IS NEXT                                              */
/* ======================================================================== */

const d = (s) => new Date(s + "T00:00:00Z");
eq(nextInstalment(d("2026-04-01"))?.by, "15 Jun", "1 April: next is 15 June");
eq(nextInstalment(d("2026-06-15"))?.by, "15 Jun", "ON 15 June it is still due, not past");
eq(nextInstalment(d("2026-06-16"))?.by, "15 Sep", "16 June: next is 15 September");
eq(nextInstalment(d("2026-12-16"))?.by, "15 Mar", "16 December: next is 15 March");
/*
  January belongs to the FY that began the PREVIOUS April, so the March
  deadline is 15 March 2027 — not 15 March 2026, which is in the past.
*/
{
  const n = nextInstalment(d("2027-01-10"));
  eq(n?.by, "15 Mar", "10 January: next is 15 March");
  eq(n?.date.toISOString().slice(0, 10), "2027-03-15",
    "…of 2027, because Jan–Mar belong to the FY that began the previous April");
  eq(n?.daysAway, 64, "…64 days away");
}
eq(nextInstalment(d("2027-03-16")), null, "after 15 March nothing is left for the year");
eq(nextInstalment(d("2026-07-01"), true)?.by, "15 Mar", "presumptive: the only date is 15 March");

/* ======================================================================== */
/* 10. THE PAGE ACTUALLY USES ALL OF THIS                                   */
/* ======================================================================== */

const comp = src("src/components/advance-tax.tsx");
const code = comp.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

check(/from "@\/lib\/advance-tax"/.test(code),
  "the page uses the shared module",
  "It had its own private copy of the schedule — a second place for the law to drift.");
check(!/cum:\s*0\.15/.test(code),
  "the page no longer carries its own copy of the schedule");
check(/interest234C/.test(code),
  "the page renders the 234C interest it names",
  "Naming a section and not computing it is the defect this tranche exists for.");
check(/presumptive/.test(code),
  "the page offers the presumptive schedule",
  "Its own copy told 44AD taxpayers they may pay in one go; it then modelled four instalments for them.");
check(/interest234B/.test(code), "the page surfaces the 234B exposure");

/* The stale-stamp rule the rest of the statutory layer follows: a verification
   date older than eighteen months is a claim nobody has checked. */
{
  const m = ADVANCE_TAX_AS_OF.match(/([A-Z][a-z]+)\s+(\d{4})/);
  check(Boolean(m), "the verification stamp names a month and year", ADVANCE_TAX_AS_OF);
  if (m) {
    const when = new Date(`${m[1]} 1, ${m[2]} UTC`);
    const months = (Date.now() - when.getTime()) / (30.44 * 86_400_000);
    check(months < 18, "the advance-tax rules were verified within eighteen months",
      `stamp reads "${ADVANCE_TAX_AS_OF}" — ${Math.round(months)} months ago. Re-check the schedule and the reliefs.`);
  }
}

/* ======================================================================== */
/* 11. QUOTES CAN NOW CLOSE — AND CAN ONLY BE INVOICED ONCE                 */
/* ======================================================================== */

/*
  `quotes.status` is a CHECK-constrained column that listQuotes selected and
  nothing ever wrote, so every quote in every workspace was permanently
  "open". Converting an accepted one into a receivable is the natural next
  step, and it carries the one risk that matters: doing it twice puts the
  amount into receivables twice, inflating the cash forecast, the MSME
  exposure and every KPI built on invoices.
*/
const actionsSrc = src("src/lib/actions.ts");
const quoteSection = actionsSrc.slice(
  actionsSrc.indexOf("const QUOTE_STATUSES"),
  actionsSrc.indexOf("// ---- Action board"),
);
check(quoteSection.length > 500, "found the quote lifecycle actions", `saw ${quoteSection.length} chars`);

check(/export async function setQuoteStatus/.test(quoteSection),
  "a quote's status can be set at all",
  "The column existed and was never written — every quote was 'open' forever.");
check(/export async function convertQuoteToInvoice/.test(quoteSection),
  "an accepted quote can become an invoice");

check(/converted_invoice_id/.test(quoteSection),
  "conversion records the invoice it created");
check(/if \(meta\.converted_invoice_id\)[\s\S]{0,200}return fail\(/.test(quoteSection),
  "conversion REFUSES to run a second time",
  "Converting twice double-counts the amount in receivables.");
/* The guard has to run before the insert, not after — checking afterwards
   means the duplicate invoice already exists. */
check(quoteSection.indexOf("meta.converted_invoice_id") < quoteSection.indexOf('.from("invoices")'),
  "…and refuses BEFORE inserting, not after");

check(/type: "receivable"/.test(quoteSection),
  "the created invoice is a receivable");
check(/issue_date: today/.test(quoteSection),
  "the invoice is dated today, not backdated to the quote",
  "MSME 43B(h) exposure ages from issue_date. Backdating would report a " +
  "brand-new invoice as already overdue — a statutory warning about a " +
  "payment that is not late.");

check(/\.eq\("org_id", orgId\)/.test(quoteSection),
  "quote lifecycle queries are org-scoped");
check(/requireWriteOrg\(\)/.test(quoteSection),
  "quote lifecycle writes go through requireWriteOrg");
check(/count === 0/.test(quoteSection),
  "a zero-row status update is reported, not swallowed");

/* The status list must match the database CHECK constraint, or a valid-looking
   click returns a raw Postgres constraint violation. */
{
  /* The quotes table ships in its own migration, not the base schema. Read
     the file that actually creates it, so this compares against the
     constraint Postgres is really enforcing. */
  const schema = src("supabase/migrations/2026_invoice_documents.sql");
  const m = schema.match(/status\s+text not null default 'open' check \(status in \(([^)]+)\)\)/);
  check(Boolean(m), "found the quotes status CHECK constraint");
  if (m) {
    const allowed = m[1].split(",").map((s) => s.trim().replace(/'/g, "")).sort().join(",");
    const inCode = (quoteSection.match(/const QUOTE_STATUSES = \[([^\]]+)\]/) || [])[1];
    const coded = String(inCode || "").split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean).sort().join(",");
    check(allowed === coded,
      "the app's status list matches the database CHECK constraint exactly",
      `db: ${allowed} · code: ${coded}`);
  }
}

/* listQuotes must return meta, or the UI cannot tell an accepted quote from an
   invoiced one and will keep offering "Invoice it" on one already converted. */
{
  const list = actionsSrc.slice(actionsSrc.indexOf("export async function listQuotes"), actionsSrc.indexOf("export async function listQuotes") + 700);
  check(/select\("[^"]*\bmeta\b[^"]*"\)/.test(list),
    "listQuotes selects meta, so the UI knows what has been invoiced");
}

const qb = src("src/components/quote-builder.tsx");
check(/convertQuoteToInvoice/.test(qb) && /setQuoteStatus/.test(qb),
  "the quote list offers both actions");
check(/converted_invoice_id/.test(qb),
  "the quote list hides 'Invoice it' on a quote already converted");

/* ======================================================================== */

console.log(`\nadvance tax + quote lifecycle: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
