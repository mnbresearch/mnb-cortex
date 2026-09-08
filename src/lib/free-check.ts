/*
  A REAL READ OF A REAL LEDGER, FOR SOMEONE WHO HAS NOT SIGNED UP.

  WHY THIS EXISTS

  The Business Health Check was six multiple-choice questions. It produced a
  score out of 100 from what the visitor said about themselves — which is a
  quiz, not an analysis, and everyone knows it. It also told them twice that a
  full breakdown was on its way and then sent "our team will reach out
  shortly". The most engaged visitor on the site was being disappointed.

  This is the other half: paste or upload your receivables and get the actual
  numbers, with no account, no card, and no AI call. Everything below is
  arithmetic over the rows they gave us.

  WHY DETERMINISTIC, EXPLICITLY

  It would be easy to send this to a model. Three reasons not to:

  1. COST AND ABUSE. An unauthenticated endpoint that spends money per request
     is a bill someone else controls. This one costs a few milliseconds of CPU,
     so the rate limit is about politeness rather than survival.
  2. TRUST. The output is "you have ₹4,20,000 overdue across 11 invoices, the
     oldest by 94 days". A model might phrase that better and might also get it
     wrong, and the first number this product ever shows a stranger is not the
     place to be approximately right.
  3. IT IS THE HONEST DEMO. This is exactly what Cortex does with their books
     every night. Showing the real mechanism is a better argument than showing
     a cleverer-sounding one.

  WHAT IT DELIBERATELY DOES NOT DO

  Nothing here is stored. The route that calls this holds the rows in memory
  for the length of one request and returns a summary. A visitor pasting their
  debtor list has not agreed to us keeping it, and asking them to trust us with
  it before they have any reason to is the wrong order.
*/

export type FreeCheckRow = {
  party?: string;
  amount?: number;
  issueDate?: string;
  dueDate?: string;
  status?: string;
};

export type FreeCheckResult = {
  rows: number;
  /** Rows we could read an amount from. The rest are reported, not hidden. */
  usable: number;
  currencyNote?: string;
  totalOutstanding: number;
  overdueCount: number;
  overdueValue: number;
  oldestOverdueDays: number;
  oldestOverdueParty?: string;
  topDebtors: { party: string; amount: number; overdue: number }[];
  /** Payables to micro/small suppliers past 45 days — section 43B(h). */
  msmeAtRisk: number;
  msmeCount: number;
  /** Plain-language findings, worst first. Each is a fact, not a pitch. */
  findings: string[];
  /** True when the file had no date column at all, so ageing is unknowable. */
  datesMissing: boolean;
};

const DAY = 86_400_000;

/**
 * Indian digit grouping and stray currency marks.
 *
 * `parseFloat("1,20,000")` is 1 — the lakh grouping breaks the naive path, and
 * silently, because 1 is a perfectly plausible number. Strip everything that is
 * not a digit, a dot or a minus, then parse. Parentheses mean negative in most
 * accounting exports, so they are honoured rather than dropped.
 */
export function parseAmount(v: unknown): number {
  const raw = String(v ?? "").trim();
  if (!raw) return NaN;
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith("-");
  const cleaned = raw.replace(/[()]/g, "").replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return NaN;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

/**
 * Dates as Indian software actually writes them.
 *
 * Tally and Busy export dd-mm-yyyy; spreadsheets export yyyy-mm-dd; some
 * exports use dd/mm/yy. `new Date("03-04-2026")` is parsed as MARCH 4th by
 * every JS engine, which would make a 92-day-overdue invoice look current for
 * eight months of the year. So the ambiguous form is read day-first, which is
 * the convention everywhere this product is sold.
 */
export function parseDate(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // ISO first: unambiguous, and what a well-behaved export produces.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const t = Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
    return Number.isFinite(t) ? t : null;
  }

  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    let [, d, m, y] = dmy;
    let year = +y;
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const day = +d, mon = +m;
    // A value above 12 in the first position can only be a day, which confirms
    // day-first. Above 12 in the second means the file is month-first after all.
    if (mon > 12 && day <= 12) return Date.UTC(year, day - 1, mon);
    if (mon > 12) return null;
    const t = Date.UTC(year, mon - 1, day);
    return Number.isFinite(t) ? t : null;
  }

  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Statuses that mean the money has already arrived. */
const SETTLED = new Set(["paid", "settled", "cleared", "received", "closed", "complete", "completed"]);

/**
 * Analyse a ledger. `now` is injectable so the tests are not time-dependent —
 * an ageing calculation that only passes on the day it was written is not a
 * test of anything.
 */
export function analyseLedger(rows: FreeCheckRow[], now: number = Date.now()): FreeCheckResult {
  const findings: string[] = [];
  const out: FreeCheckResult = {
    rows: rows.length, usable: 0, totalOutstanding: 0,
    overdueCount: 0, overdueValue: 0, oldestOverdueDays: 0,
    topDebtors: [], msmeAtRisk: 0, msmeCount: 0, findings, datesMissing: false,
  };
  if (!rows.length) return out;

  const byParty = new Map<string, { amount: number; overdue: number }>();
  let anyDate = false;
  let oldest = { days: 0, party: "" };

  for (const r of rows) {
    const amt = Number(r.amount);
    if (!Number.isFinite(amt) || amt === 0) continue;

    const status = String(r.status || "").trim().toLowerCase();
    if (SETTLED.has(status)) continue;   // already paid — not outstanding

    out.usable++;
    const value = Math.abs(amt);
    out.totalOutstanding += value;

    const party = String(r.party || "").trim() || "Unnamed";
    const cur = byParty.get(party) || { amount: 0, overdue: 0 };
    cur.amount += value;

    const due = r.dueDate ? parseDate(r.dueDate) : null;
    const issued = r.issueDate ? parseDate(r.issueDate) : null;
    if (due || issued) anyDate = true;

    /*
      Overdue is measured against the DUE date where there is one. Where there
      is not, fall back to the issue date plus 30 — the common informal term in
      Indian SME trade — and say so in the findings rather than presenting a
      guess as a fact.
    */
    const deadline = due ?? (issued !== null ? issued + 30 * DAY : null);
    if (deadline !== null && deadline < now) {
      const days = Math.floor((now - deadline) / DAY);
      out.overdueCount++;
      out.overdueValue += value;
      cur.overdue += value;
      if (days > oldest.days) oldest = { days, party };
    }

    /*
      SECTION 43B(h). A payable to a registered micro or small supplier that is
      unpaid past 45 days is disallowed as a deduction in the year it was
      incurred. We cannot know the supplier's registration status from a pasted
      file, so this is computed as EXPOSURE — "this much is sitting past 45
      days, check which of these suppliers are MSME-registered" — and labelled
      that way. Claiming it as a certainty would be the same overreach the
      in-product module was rewritten to remove.
    */
    if (issued !== null && issued + 45 * DAY < now) {
      out.msmeAtRisk += value;
      out.msmeCount++;
    }

    byParty.set(party, cur);
  }

  out.datesMissing = !anyDate;
  out.oldestOverdueDays = oldest.days;
  out.oldestOverdueParty = oldest.party || undefined;

  out.topDebtors = [...byParty.entries()]
    .map(([party, v]) => ({ party, amount: v.amount, overdue: v.overdue }))
    .sort((a, b) => b.overdue - a.overdue || b.amount - a.amount)
    .slice(0, 5);

  /* ---------------------------------------------------------- findings ---
     Worst first, each one a fact with a number in it. No recommendations
     dressed as findings — the reader can tell the difference and resents it.
  */
  if (out.usable === 0) {
    findings.push("We could not read an amount from any row. Check that one column holds the invoice value.");
    return out;
  }

  if (out.datesMissing) {
    findings.push(
      `We read ${out.usable} open ${out.usable === 1 ? "entry" : "entries"} worth ${inr(out.totalOutstanding)}, but the file has no date column — so nothing can be aged. Add a due date or invoice date and the overdue picture appears.`,
    );
  } else if (out.overdueCount === 0) {
    findings.push(`Nothing is overdue. ${inr(out.totalOutstanding)} is outstanding across ${out.usable} ${out.usable === 1 ? "entry" : "entries"}, all still within terms.`);
  } else {
    const pct = Math.round((out.overdueValue / out.totalOutstanding) * 100);
    findings.push(
      `${inr(out.overdueValue)} is past due — ${pct}% of the ${inr(out.totalOutstanding)} outstanding, across ${out.overdueCount} ${out.overdueCount === 1 ? "invoice" : "invoices"}.`,
    );
    if (out.oldestOverdueDays > 0) {
      findings.push(
        `The oldest is ${out.oldestOverdueDays} days past due${out.oldestOverdueParty ? ` (${out.oldestOverdueParty})` : ""}. Past 90 days, recovery rates fall sharply.`,
      );
    }
    const top = out.topDebtors[0];
    if (top && top.overdue > 0 && out.overdueValue > 0) {
      const share = Math.round((top.overdue / out.overdueValue) * 100);
      if (share >= 30) {
        findings.push(`${share}% of everything overdue sits with one party, ${top.party} — ${inr(top.overdue)}. That is concentration risk, not a collections problem.`);
      }
    }
  }

  if (out.msmeCount > 0) {
    findings.push(
      `${inr(out.msmeAtRisk)} across ${out.msmeCount} ${out.msmeCount === 1 ? "entry" : "entries"} is past 45 days. If any of those suppliers are MSME-registered, section 43B(h) disallows the deduction until paid — worth checking their Udyam status before year end.`,
    );
  }

  return out;
}
