/**
 * Indian statutory deadlines — the dated ones, computed for a given day.
 *
 * WHAT WAS WRONG.
 *
 * "GST & statutory deadline warnings" is a bullet on the Watch plan, and the
 * only thing behind it was /compliance: a static reference table of due dates
 * rendered as cards. A calendar is not a warning. It never mentioned today, it
 * never appeared in an alert or the weekly brief, and an owner who did not
 * think to open that page was told nothing — which is precisely the case the
 * bullet is sold for.
 *
 * This turns the same dates into "GSTR-3B is due in 4 days" on a given date, so
 * the dashboard, the weekly brief and the Practice console can all say it.
 *
 * WHY IT IS A PURE FUNCTION WITH NO DATABASE.
 *
 * These dates are law, not workspace data. Making them a table would invite
 * per-tenant drift in something that must be identical for everyone, and would
 * mean a migration every time a due date moved. A pure function is testable
 * against known dates, which is the only way to be confident about arithmetic
 * that a customer will act on.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO.
 *
 * It does not claim to know which of these APPLY to a given business. Whether a
 * workspace files monthly or under QRMP, whether it is a company with ROC
 * obligations, whether it deducts TDS at all — Cortex is not told any of that.
 * So every warning is phrased as "if this applies to you", and `appliesIf`
 * carries the condition in words. Telling a proprietor they have missed AOC-4
 * would destroy trust in every other warning we send.
 */

/*
  Relative, WITH the extension, rather than the "@/lib/…" alias used in most of
  this codebase — and not a style choice.

  scripts/test-seo-pages.mjs executes this module directly
  (`await import("../src/lib/statutory.ts")`) so that the thirteen public
  deadline pages can be checked against the REAL catalogue rather than a copy.
  node resolves a relative specifier and does not resolve the alias, so writing
  `@/lib/statutory-profile` here broke that suite immediately with
  ERR_MODULE_NOT_FOUND. lib/deadline-seo.ts and lib/industry-seo.ts already
  carry the same note for the same reason.
*/
import { applicability, excludedBecause, type StatutoryProfile } from "./statutory-profile.ts";

export type Deadline = {
  id: string;
  name: string;
  what: string;
  /** The date it falls due, for the reference day passed in. */
  due: Date;
  daysAway: number;
  severity: "high" | "medium" | "low";
  /** Who this actually applies to. Always shown; never assumed. */
  appliesIf: string;
};

/*
  QUARTER-SHAPED RULES ARE NOT MONTHLY RULES.

  PMT-06 and IFF used to sit here as plain "every month" rules, so on 14 October
  the calendar announced a PMT-06 due on 25 October — a date that does not
  exist. Under QRMP the tax for the first two months of a quarter is paid by
  PMT-06 (and the optional IFF uploaded) on the 25th / 13th of the FOLLOWING
  month; the third month's tax goes with the quarterly GSTR-3B instead, and the
  13th after a quarter is the quarterly GSTR-1, not an IFF. And a QRMP filer,
  whose monthly GSTR-1/3B are (correctly) hidden, was shown no quarterly return
  at all.

  `months` lists the calendar months (1-12) a rule actually falls due in. A
  rule without it falls due every month. Quarters are the Indian FY quarters
  (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar), so:
    after months 1 and 2 of a quarter  -> May, Jun, Aug, Sep, Nov, Dec, Feb, Mar
    the month after a quarter ends     -> Jan, Apr, Jul, Oct
  `whenLabel` is the human phrasing for anything "Nth of every month" would
  misdescribe; every surface that prints a rule's date should prefer it.
*/
const AFTER_QRMP_MONTHS_1_2 = [2, 3, 5, 6, 8, 9, 11, 12];
const AFTER_QUARTER_END = [1, 4, 7, 10];

type MonthlyRule = {
  id: string; day: number; name: string; what: string; severity: Deadline["severity"]; appliesIf: string;
  months?: number[]; whenLabel?: string; dayLabel?: string;
};

/** Monthly (and month-in-quarter) obligations, by day of month. */
const MONTHLY: MonthlyRule[] = [
  /*
    The 7th is right for eleven months of TDS and for all twelve of TCS. Tax
    DEDUCTED in March is due on 30 April instead (its own rule, "tds-march",
    below) — TCS collected in March is still due on 7 April, which is why this
    rule keeps its April occurrence rather than moving it.
  */
  { id: "tds", day: 7, name: "TDS / TCS deposit",
    what: "Tax deducted or collected last month must be paid — except TDS deducted in March, which is due 30 April",
    severity: "high", appliesIf: "you deducted TDS or collected TCS last month",
    whenLabel: "7th of every month (TDS deducted in March: 30 April)" },
  { id: "gstr7", day: 10, name: "GSTR-7 / GSTR-8", what: "TDS/TCS under GST",
    severity: "low", appliesIf: "you are required to deduct or collect tax under GST" },
  { id: "gstr1", day: 11, name: "GSTR-1", what: "Outward supplies for last month",
    severity: "high", appliesIf: "you file GST monthly" },
  { id: "gstr6", day: 13, name: "GSTR-6", what: "Input service distributor return for last month",
    severity: "low", appliesIf: "you are registered as an Input Service Distributor (ISD)" },
  { id: "iff", day: 13, name: "IFF (optional)",
    what: "Optional upload of B2B invoices for the first or second month of a quarter, so your buyers can claim the credit early",
    severity: "low", appliesIf: "you file under QRMP and want to pass credit to buyers before the quarter ends",
    months: AFTER_QRMP_MONTHS_1_2,
    whenLabel: "13th of the month after the first and second months of each quarter" },
  { id: "gstr1-qrmp", day: 13, name: "GSTR-1 (quarterly)", what: "Outward supplies for the quarter just ended",
    severity: "high", appliesIf: "you file under QRMP",
    months: AFTER_QUARTER_END,
    whenLabel: "13th of the month after each quarter (January, April, July, October)" },
  { id: "pf", day: 15, name: "PF & ESI", what: "Provident fund and ESI contributions",
    severity: "high", appliesIf: "you have employees covered by EPF or ESI" },
  { id: "cmp08", day: 18, name: "CMP-08", what: "Quarterly statement and tax payment under the composition scheme",
    severity: "high", appliesIf: "you are registered under the GST composition scheme",
    months: AFTER_QUARTER_END,
    whenLabel: "18th of the month after each quarter (January, April, July, October)" },
  { id: "gstr3b", day: 20, name: "GSTR-3B", what: "Summary return and the GST payment itself",
    severity: "high", appliesIf: "you file GST monthly" },
  /*
    22nd OR 24th, by the state the GSTIN is registered in. Cortex does not know
    the state, so the rule is dated from the 22nd — the earlier of the two, so a
    warning is never late — and says plainly that it may be the 24th.
  */
  { id: "gstr3b-qrmp", day: 22, name: "GSTR-3B (quarterly)",
    what: "Quarterly summary return and the third month's tax — due the 22nd or the 24th depending on your state; Cortex warns from the 22nd",
    severity: "high", appliesIf: "you file under QRMP",
    months: AFTER_QUARTER_END, dayLabel: "22/24",
    whenLabel: "22nd or 24th (depending on your state) of the month after each quarter" },
  { id: "pmt06", day: 25, name: "PMT-06",
    what: "GST payment for the first or second month of a quarter — the third month's tax is paid with the quarterly GSTR-3B",
    severity: "medium", appliesIf: "you file under QRMP",
    months: AFTER_QRMP_MONTHS_1_2,
    whenLabel: "25th of the month after the first and second months of each quarter" },
];

/** Does a month-of-year rule fall due in calendar month `m` (1-12)? */
function fallsIn(r: { months?: number[] }, m: number): boolean {
  return !r.months || r.months.includes(m);
}

/**
 * Annual and quarterly obligations, as (month, day) with month 1-indexed.
 *
 * Advance tax is four separate instalments rather than one repeating rule
 * because the PERCENTAGE differs each time, and "pay your advance tax" without
 * saying 15% or 75% is not information anyone can act on.
 */
/**
 * How much notice an obligation actually needs, in days.
 *
 * WHY THIS IS PER-RULE AND NOT ONE NUMBER.
 *
 * Every caller used to pass a single window — /compliance 10 days, the
 * dashboard 14 — and every deadline was measured against it. That is right for
 * a monthly GST return, which one person can do in an afternoon, and useless
 * for the ones that need somebody else's time.
 *
 * The tax audit report is the case that exposed it. Ten days' notice of a
 * filing your AUDITOR has to prepare and upload is not an early warning; by
 * then the engagement should have been running for weeks. On the day the
 * report deadline was 14 days out, /compliance said nothing about it at all —
 * so splitting the date out of the ITR fixed the number and still left the
 * owner unwarned.
 *
 * So each rule carries the notice it needs. The caller's window is a floor,
 * not a ceiling: `Math.max(withinDays, leadDays)`, so nothing that used to be
 * warned about stops being warned about.
 */
const LEAD_DAYS: Record<string, number> = {
  /* Needs an auditor booked, fieldwork done, and a report uploaded. */
  "tax-audit-report": 45,
  /* Returns and ROC filings: a month, because they depend on closed books. */
  "itr-audit": 30,
  itr: 30,
  roc: 30,
  mgt7: 30,
  /* Instalments need the year's liability estimated first. */
  "adv-q1": 15, "adv-q2": 15, "adv-q3": 15, "adv-q4": 15,
  "tds-q1": 15, "tds-q2": 15, "tds-q3": 15, "tds-q4": 15, "tds-march": 15,
  /* Annual returns built from a closed year's books. */
  gstr9: 30, gstr4: 15, "msme1-h1": 15, "msme1-h2": 15,
};

const FIXED: Array<{ id: string; month: number; day: number; name: string; what: string; severity: Deadline["severity"]; appliesIf: string }> = [
  { id: "adv-q1", month: 6, day: 15, name: "Advance tax — 1st instalment", what: "15% of the year's estimated liability",
    severity: "medium", appliesIf: "your annual tax liability will exceed ₹10,000" },
  { id: "adv-q2", month: 9, day: 15, name: "Advance tax — 2nd instalment", what: "45% cumulative, less what you have paid",
    severity: "medium", appliesIf: "your annual tax liability will exceed ₹10,000" },
  { id: "adv-q3", month: 12, day: 15, name: "Advance tax — 3rd instalment", what: "75% cumulative, less what you have paid",
    severity: "medium", appliesIf: "your annual tax liability will exceed ₹10,000" },
  { id: "adv-q4", month: 3, day: 15, name: "Advance tax — final instalment", what: "100% of the year's liability",
    severity: "high", appliesIf: "your annual tax liability will exceed ₹10,000" },
  /*
    31 AUGUST, NOT 31 JULY, for non-audit business and professional income.
    Finance Act 2026 moved the due date for these returns (ITR-3 / ITR-4) a
    month later, permanently, from the returns filed in 2026. Returns with no
    business income (ITR-1 / ITR-2) stay at 31 July — said in `what`, because
    a proprietor's spouse on salary still has the earlier date.
  */
  { id: "itr", month: 8, day: 31, name: "Income Tax Return",
    what: "Non-audit cases with business or professional income (31 July if there is no business income)",
    severity: "high", appliesIf: "your accounts are not subject to audit" },
  /*
    THE AUDIT REPORT IS NOT THE RETURN. They are a month apart.

    This entry did not exist. The catalogue jumped straight to "ITR with tax
    audit — 31 Oct", and /compliance printed the two as one line reading
    "ITR + Tax Audit — 31 Oct". A business reading that prepares its audit
    report for the end of October, having already missed it by a month: the
    report under s.44AB is due one month BEFORE the return, and it is the
    auditor's filing, so it has to be commissioned earlier still.

    Missing a statutory date by a month, on the page sold as the thing that
    stops you missing statutory dates, is the worst failure this product has.
    Both dates now exist separately, and test-statutory.mjs pins the gap.
  */
  { id: "tax-audit-report", month: 9, day: 30, name: "Tax audit report (44AB)",
    what: "Signed and uploaded by your auditor — due a month before the return, not with it. \"44AB\" is the 1961-Act section; the Income-tax Act, 2025 renumbers it and its forms from tax year 2026-27, the audit itself remains",
    severity: "high", appliesIf: "your turnover crosses the 44AB audit threshold" },
  { id: "itr-audit", month: 10, day: 31, name: "ITR with tax audit", what: "The return itself, in audit cases — a month after the audit report",
    severity: "high", appliesIf: "your turnover crosses the 44AB audit threshold" },
  { id: "roc", month: 10, day: 30, name: "AOC-4 (ROC)", what: "Annual financial statements, within 30 days of the AGM",
    severity: "medium", appliesIf: "you are a company registered with the MCA" },
  { id: "mgt7", month: 11, day: 29, name: "MGT-7 (ROC)", what: "Annual return, within 60 days of the AGM",
    severity: "medium", appliesIf: "you are a company registered with the MCA" },
  { id: "tds-q1", month: 7, day: 31, name: "TDS return (Q1)", what: "24Q / 26Q for April–June",
    severity: "medium", appliesIf: "you deduct TDS" },
  { id: "tds-q2", month: 10, day: 31, name: "TDS return (Q2)", what: "24Q / 26Q for July–September",
    severity: "medium", appliesIf: "you deduct TDS" },
  { id: "tds-q3", month: 1, day: 31, name: "TDS return (Q3)", what: "24Q / 26Q for October–December",
    severity: "medium", appliesIf: "you deduct TDS" },
  { id: "tds-q4", month: 5, day: 31, name: "TDS return (Q4)", what: "24Q / 26Q for January–March",
    severity: "medium", appliesIf: "you deduct TDS" },
  /* The one month the 7th is wrong for TDS. See the "tds" rule above. */
  { id: "tds-march", month: 4, day: 30, name: "TDS deposit for March", what: "Tax deducted in March — due 30 April, not 7 April",
    severity: "high", appliesIf: "you deducted TDS in March" },
  { id: "gstr4", month: 4, day: 30, name: "GSTR-4 (composition)", what: "Annual return under the composition scheme, for the year just ended",
    severity: "medium", appliesIf: "you are registered under the GST composition scheme" },
  { id: "gstr9", month: 12, day: 31, name: "GSTR-9", what: "GST annual return for the previous financial year",
    severity: "medium",
    appliesIf: "you are a regular GST taxpayer — small taxpayers (turnover up to ₹2 crore) have been exempted year by year, so check the current notification" },
  { id: "msme1-h2", month: 4, day: 30, name: "MSME-1 (October–March)", what: "Half-yearly return to the ROC of dues to micro and small suppliers",
    severity: "medium", appliesIf: "you are a company with dues to micro or small enterprises outstanding beyond 45 days" },
  { id: "msme1-h1", month: 10, day: 31, name: "MSME-1 (April–September)", what: "Half-yearly return to the ROC of dues to micro and small suppliers",
    severity: "medium", appliesIf: "you are a company with dues to micro or small enterprises outstanding beyond 45 days" },
];

/* ===========================================================================
   THE SAME RULES, EXPORTED — so the public pages cannot hold a second copy.

   /deadlines and its thirteen topic pages are the highest-volume search
   surface this product has: "GSTR-3B due date" and "TDS payment due date" are
   asked every month by every business in India. Which means they are also the
   easiest pages to get WRONG in the most damaging way — a published due date
   that is off by a day is worse than no page, because someone will act on it.

   So the pages render from these two arrays rather than from anything typed
   into JSX. Nothing about a deadline exists in two places: change the day here
   and the product warning, the calendar hub and the page all move together.

   `cadence` is added on the way out because a page needs to say "every month"
   or "once a year" and the shape of the source array is the only place that is
   currently recorded.
   =========================================================================== */

export type StatutoryRule = {
  id: string;
  name: string;
  what: string;
  severity: Deadline["severity"];
  appliesIf: string;
  cadence: "monthly" | "annual";
  /** Day of the month it falls due. */
  day: number;
  /** 1-indexed month, for annual rules only. */
  month?: number;
  /**
   * Monthly rules only: the calendar months (1-12) it falls due in. Absent
   * means every month. PMT-06, IFF and the quarterly QRMP returns carry it.
   */
  months?: number[];
  /** Human phrasing of the due date where "Nth of every month" would be wrong. */
  whenLabel?: string;
  /** Short day label where the day is not one number (GSTR-3B quarterly: 22/24). */
  dayLabel?: string;
};

export const STATUTORY_CATALOGUE: StatutoryRule[] = [
  ...MONTHLY.map((r) => ({ ...r, cadence: "monthly" as const })),
  ...FIXED.map((r) => ({ ...r, cadence: "annual" as const })),
];

/** One rule by id, or null. */
export function statutoryRule(id: string): StatutoryRule | null {
  return STATUTORY_CATALOGUE.find((r) => r.id === id) || null;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * How a rule's due date reads in a reference table: "day 20", "30 Sep".
 *
 * Exported so that /compliance can render the catalogue instead of keeping its
 * own copy. It kept one — a `periodic` array typed into JSX that had drifted
 * from these definitions in two places at once: it printed ROC as
 * "30 Sep / 31 Oct" when the catalogue says AOC-4 is 30 Oct and MGT-7 is
 * 29 Nov, and it printed "ITR + Tax Audit — 31 Oct" as a single obligation.
 *
 * A customer comparing the signed-in calendar with the public one saw two
 * different sets of filing dates from the same company. Formatting lives here
 * so the next table that needs a label cannot start a third copy.
 */
export function ruleWhen(r: StatutoryRule): string {
  if (r.cadence !== "monthly") return `${r.day} ${MONTH_ABBR[(r.month ?? 1) - 1]}`;
  const day = `day ${r.dayLabel ?? r.day}`;
  if (!r.months || r.months.length === 12) return day;
  /* Name the months it falls in, or — when that is most of them — the ones it does not. */
  if (r.months.length <= 6) return `${day} · ${r.months.map((m) => MONTH_ABBR[m - 1]).join("/")}`;
  const not = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !r.months!.includes(m));
  return `${day} · not ${not.map((m) => MONTH_ABBR[m - 1]).join("/")}`;
}

/**
 * The due date as a sentence — "20th of every month", "15 June", or the rule's
 * own `whenLabel` where a bare day would misdescribe it (PMT-06 is not due
 * every month). Public pages should print this, or prefer `whenLabel` first.
 */
export function ruleWhenLong(r: StatutoryRule): string {
  if (r.whenLabel) return r.whenLabel;
  const ord = (n: number) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  if (r.cadence === "monthly") return `${ord(r.day)} of every month`;
  const months = ["", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${r.day} ${months[r.month || 1]}`;
}

/**
 * The next time a rule falls due, from a reference day.
 *
 * Shares istDate() and istToday() with upcomingDeadlines() rather than doing
 * its own date arithmetic — the IST offset and the month-wrap are exactly the
 * kind of thing that is subtly different in a second implementation.
 */
export function nextOccurrence(id: string, now = new Date()): Date | null {
  const r = statutoryRule(id);
  if (!r) return null;
  const { y, m, d } = istToday(now);
  const today = istDate(y, m, d);

  if (r.cadence === "monthly") {
    /* Walk forward month by month; a quarter-shaped rule skips the months it
       does not fall in, so the answer is never a date that does not exist. */
    for (let k = 0; k <= 12; k++) {
      const mm = ((m - 1 + k) % 12) + 1;
      const yy = y + Math.floor((m - 1 + k) / 12);
      if (!fallsIn(r, mm)) continue;
      const due = istDate(yy, mm, r.day);
      if (due.getTime() >= today.getTime()) return due;
    }
    return null;
  }

  const thisYear = istDate(y, r.month as number, r.day);
  return thisYear.getTime() >= today.getTime() ? thisYear : istDate(y + 1, r.month as number, r.day);
}

/** Midnight IST on a given y/m/d, as an instant. IST has no daylight saving. */
function istDate(y: number, m: number, d: number): Date {
  return new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+05:30`);
}

/**
 * A deadline's date as YYYY-MM-DD, in IST. The ONLY correct way to print one.
 *
 * WHY THIS EXISTS: `due.toISOString().slice(0, 10)` is off by a day, always.
 *
 * istDate() builds the due date at midnight IST — "2026-09-30T00:00:00+05:30" —
 * which is 18:30 UTC on the 29th. toISOString() renders UTC, so slicing it
 * yields "2026-09-29" for a deadline that falls on the 30th.
 *
 * lib/data.ts did exactly that when assembling the deadline list for the AI
 * context, beside a `daysAway` that IS computed in IST. So the model was handed
 * "Tax audit report (44AB) in 13 day(s) (2026-09-29)" — a countdown pointing at
 * the 30th next to a date reading the 29th — and repeated the wrong date into
 * the weekly plan while /compliance showed the right one. Two screens of one
 * product giving different statutory dates, for the filing that is two weeks
 * away, from a single character of timezone handling.
 *
 * Every surface that prints a deadline date must come through here.
 */
export function istISO(due: Date): string {
  const [d, m, y] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(due).split("/");
  return `${y}-${m}-${d}`;
}

/** Today's IST calendar date, whatever timezone the server runs in. */
export function istToday(now = new Date()): { y: number; m: number; d: number } {
  const [d, m, y] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(now).split("/");
  return { y: Number(y), m: Number(m), d: Number(d) };
}

/**
 * Today's IST calendar date as "YYYY-MM-DD".
 *
 * lib/metrics.ts already computed exactly this inline, with en-CA, to decide
 * which receivables are overdue — and it is the only place in the product that
 * got it right. Five other places wrote `new Date().toISOString().slice(0,10)`
 * instead, which is the UTC date and therefore YESTERDAY's for the 5h30m after
 * midnight IST. Exported here so the comparison has one definition rather than
 * six, and so the correct one is the easy one to reach for.
 */
export function istTodayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/**
 * Whole days a dated invoice is past due, in IST. NEGATIVE means not yet due.
 *
 * ============================================================================
 * WHY `Math.round(…/86_400_000)` WAS WRONG IN TWO SEPARATE WAYS
 * ============================================================================
 *
 * Four places computed ageing as `Math.round((Date.now() - due) / 86_400_000)`
 * where `due` is a date-only column parsed as UTC MIDNIGHT. Both halves fail:
 *
 *   ROUNDING. The half-day crossover is at 12:00 UTC, which is 17:30 IST. So
 *   from half past five every evening, an invoice due TODAY rounds up to "1
 *   day past due". /receivables therefore printed an overdue total that
 *   included every invoice due that day, while the dashboard — using the
 *   correct string comparison in metrics.ts — printed a smaller one. Two
 *   screens of the same product disagreeing about the same rupees, every
 *   evening.
 *
 *   THE UTC ANCHOR. Measuring from `Date.now()` rather than from today's IST
 *   midnight makes the answer depend on the time of day at all, which a count
 *   of whole days between two calendar dates must not.
 *
 * The worst instance reached a customer's inbox: lib/actions.ts put this
 * number into the reminder email body, so a debtor could be told their
 * invoice was a day later than it was — in our customer's name.
 *
 * ============================================================================
 * HOW THIS ONE IS CORRECT
 * ============================================================================
 *
 * Both sides are reduced to a calendar date first, then both are parsed at UTC
 * midnight and subtracted. The UTC parsing is not a bug here but the point:
 * once both operands are date-only, UTC is just a fixed origin, both are
 * shifted identically, and the difference is exact whole days with no
 * rounding, no time-of-day term and no DST. lib/worst-invoice.ts has worked
 * this way all along; this generalises it instead of adding a seventh variant.
 *
 * Returns 0 for a missing or unparseable date — the callers all treat "no due
 * date" as "not overdue", which is the safe direction for a figure that
 * decides whether to chase someone.
 */
export function daysPastDueIST(due: unknown, now = new Date()): number {
  if (!due) return 0;
  const iso = String(due).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    /* Not a date-only column — a timestamp, say. Reduce it to its IST calendar
       date rather than giving up, so a mixed-shape import still ages. */
    const t = new Date(String(due)).getTime();
    if (!Number.isFinite(t)) return 0;
    return daysPastDueIST(istTodayISO(new Date(t)), now);
  }
  const dueMs = Date.parse(`${iso}T00:00:00Z`);
  const todayMs = Date.parse(`${istTodayISO(now)}T00:00:00Z`);
  if (!Number.isFinite(dueMs) || !Number.isFinite(todayMs)) return 0;
  return Math.round((todayMs - dueMs) / 86_400_000);
}

/**
 * Everything falling due within `withinDays`, soonest first.
 *
 * Only ever looks FORWARD. A missed deadline is not something Cortex can help
 * with and telling someone on the 22nd that GSTR-3B was due on the 20th is
 * noise at best — the next one, which they can still act on, is what matters.
 */
export function upcomingDeadlines(withinDays = 10, now = new Date()): Deadline[] {
  const { y, m, d } = istToday(now);
  const today = istDate(y, m, d);
  const out: Deadline[] = [];

  const push = (id: string, name: string, what: string, due: Date,
                severity: Deadline["severity"], appliesIf: string) => {
    const daysAway = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    /*
      The rule's own notice period, or the caller's window — whichever is
      longer. See LEAD_DAYS: a caller cannot know that an audit report needs
      six weeks and a GSTR-3B needs ten days, and it should not have to.
      Keyed on the base id so the "-next" duplicates inherit it.
    */
    const lead = Math.max(withinDays, LEAD_DAYS[id.replace(/-next$/, "")] ?? 0);
    if (daysAway < 0 || daysAway > lead) return;
    out.push({ id, name, what, due, daysAway, severity, appliesIf });
  };
  /*
    The profile filter deliberately does NOT happen in here. `push` is shared
    by both loops and knows nothing about a workspace; filtering at the source
    would make the excluded rules unrecoverable, which safety rule 3 in
    lib/statutory-profile.ts forbids. See splitByProfile() below: it takes the
    full list and returns both halves, so a caller can only ever shorten a
    list it can still see the rest of.
  */

  /*
    This month's monthly deadlines AND next month's.

    Both, because on the 28th every remaining deadline this month is in the
    past, and a ten-day window that returns nothing on the 28th of every month
    would look broken exactly when the next GSTR-1 is nine days out.
  */
  for (const r of MONTHLY) {
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    /* Only in the months the rule actually falls due — see AFTER_QRMP_MONTHS_1_2. */
    if (fallsIn(r, m)) push(r.id, r.name, r.what, istDate(y, m, r.day), r.severity, r.appliesIf);
    if (fallsIn(r, nm)) push(`${r.id}-next`, r.name, r.what, istDate(ny, nm, r.day), r.severity, r.appliesIf);
  }

  /* Fixed dates: this calendar year and the next, for the same wrap reason. */
  for (const r of FIXED) {
    push(r.id, r.name, r.what, istDate(y, r.month, r.day), r.severity, r.appliesIf);
    push(`${r.id}-next`, r.name, r.what, istDate(y + 1, r.month, r.day), r.severity, r.appliesIf);
  }

  return out.sort((a, b) =>
    a.daysAway - b.daysAway ||
    ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]));
}

/* ===========================================================================
   HOW SOON, SAID ONCE.

   The "today / tomorrow / in N days" phrasing existed in three places:
   describeDeadline below, an inline ternary in app/(app)/compliance/page.tsx,
   and a third copy I added to app/(app)/gst/page.tsx when I gave that page
   real dates. Three copies of a sentence is survivable; three copies of the
   ARITHMETIC is not, and mine was different.

   upcomingDeadlines() measures from IST MIDNIGHT — `Math.round((due - today))`
   where `today` is istDate(y, m, d). My /gst version measured from `now`:

       Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000))

   Same rule, same day, two answers. At 18:00 IST on the 14th, a deadline on
   the 17th is 3 days away from IST midnight and ceil(2.25) = 3 from now — they
   agree. At 01:00 IST they are 3 and 3. But the boundaries drift: measuring
   from `now` makes the count depend on the hour the page was opened, so
   /compliance and /gst could print different numbers for the same filing on
   the same afternoon, and the product would be contradicting itself about a
   tax date.

   One function, measuring the way the warning engine already measures.
   =========================================================================== */

/**
 * Whole days from today (IST midnight) until `due`. Negative means it passed.
 *
 * Deliberately NOT measured from `now`: a deadline is a calendar date, and "how
 * many days until the 20th" must not change because it is the afternoon.
 */
export function daysUntilIST(due: Date, now = new Date()): number {
  const { y, m, d } = istToday(now);
  const today = istDate(y, m, d);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/** "today" / "tomorrow" / "in N days". "in 0 days" is never printed. */
export function whenPhrase(daysAway: number): string {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway} days`;
}

/**
 * Inside this many days, a deadline is urgent enough to outrank its own
 * severity — a medium filing due tomorrow matters more than a high one due in
 * three weeks. /compliance already used 3 for its colour change; /gst now
 * reads the same constant instead of repeating the number.
 */
export const URGENT_WITHIN_DAYS = 3;

/** One deadline as a sentence. */
export function describeDeadline(dl: Deadline): string {
  return `${dl.name} is due ${whenPhrase(dl.daysAway)} — ${dl.what}, if ${dl.appliesIf}.`;
}

/* ===========================================================================
   SPLIT, NEVER FILTER.

   Every caller that narrows the calendar to one workspace goes through here,
   and it returns BOTH halves. That shape is the enforcement mechanism for
   safety rule 3 in lib/statutory-profile.ts: a function that returned only
   the applicable rules would let a page shorten its list with no way to show
   what it dropped, and a silently shortened compliance list is
   indistinguishable from a bug — or from a missed filing.

   `hidden` carries the reason on each entry, in the owner's own words, so the
   page can say "hidden because you told us you have no employees" rather than
   the thing we must never say, which is "PF does not apply to you".
   =========================================================================== */

export type HiddenDeadline = Deadline & { hiddenBecause: string };

export function splitByProfile(
  all: Deadline[],
  profile: StatutoryProfile,
): { shown: Deadline[]; hidden: HiddenDeadline[] } {
  const shown: Deadline[] = [];
  const hidden: HiddenDeadline[] = [];
  for (const dl of all) {
    /*
      The id carries a "-next" suffix for the second occurrence of a rule
      within the window (see the wrap comment in upcomingDeadlines), and the
      profile gates are keyed on the bare rule id. Stripping it here rather
      than duplicating every key in the gate map means a rule cannot be
      gated in its first occurrence and ungated in its second — which would
      show January's TDS return to someone who told us they deduct no TDS.
    */
    const baseId = dl.id.replace(/-next$/, "");
    if (applicability(baseId, profile) === "excluded") {
      hidden.push({ ...dl, hiddenBecause: excludedBecause(baseId, profile) || "you told us this does not apply" });
    } else {
      shown.push(dl);
    }
  }
  return { shown, hidden };
}
