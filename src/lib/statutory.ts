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

/** Monthly obligations, by day of month. */
const MONTHLY: Array<{ id: string; day: number; name: string; what: string; severity: Deadline["severity"]; appliesIf: string }> = [
  { id: "tds", day: 7, name: "TDS / TCS deposit", what: "Tax deducted last month must be paid",
    severity: "high", appliesIf: "you deducted TDS or collected TCS last month" },
  { id: "gstr7", day: 10, name: "GSTR-7 / GSTR-8", what: "TDS/TCS under GST",
    severity: "low", appliesIf: "you are required to deduct or collect tax under GST" },
  { id: "gstr1", day: 11, name: "GSTR-1", what: "Outward supplies for last month",
    severity: "high", appliesIf: "you file GST monthly" },
  { id: "iff", day: 13, name: "GSTR-6 / IFF", what: "Input service distributor return, or QRMP invoice upload",
    severity: "low", appliesIf: "you are an ISD, or file under QRMP" },
  { id: "pf", day: 15, name: "PF & ESI", what: "Provident fund and ESI contributions",
    severity: "high", appliesIf: "you have employees covered by EPF or ESI" },
  { id: "gstr3b", day: 20, name: "GSTR-3B", what: "Summary return and the GST payment itself",
    severity: "high", appliesIf: "you file GST monthly" },
  { id: "pmt06", day: 25, name: "PMT-06", what: "GST payment for the quarter's first two months",
    severity: "medium", appliesIf: "you file under QRMP" },
];

/**
 * Annual and quarterly obligations, as (month, day) with month 1-indexed.
 *
 * Advance tax is four separate instalments rather than one repeating rule
 * because the PERCENTAGE differs each time, and "pay your advance tax" without
 * saying 15% or 75% is not information anyone can act on.
 */
const FIXED: Array<{ id: string; month: number; day: number; name: string; what: string; severity: Deadline["severity"]; appliesIf: string }> = [
  { id: "adv-q1", month: 6, day: 15, name: "Advance tax — 1st instalment", what: "15% of the year's estimated liability",
    severity: "medium", appliesIf: "your annual tax liability will exceed ₹10,000" },
  { id: "adv-q2", month: 9, day: 15, name: "Advance tax — 2nd instalment", what: "45% cumulative, less what you have paid",
    severity: "medium", appliesIf: "your annual tax liability will exceed ₹10,000" },
  { id: "adv-q3", month: 12, day: 15, name: "Advance tax — 3rd instalment", what: "75% cumulative, less what you have paid",
    severity: "medium", appliesIf: "your annual tax liability will exceed ₹10,000" },
  { id: "adv-q4", month: 3, day: 15, name: "Advance tax — final instalment", what: "100% of the year's liability",
    severity: "high", appliesIf: "your annual tax liability will exceed ₹10,000" },
  { id: "itr", month: 7, day: 31, name: "Income Tax Return", what: "Non-audit cases",
    severity: "high", appliesIf: "your accounts are not subject to audit" },
  { id: "itr-audit", month: 10, day: 31, name: "ITR with tax audit", what: "Audit cases under section 44AB",
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
];

/** Midnight IST on a given y/m/d, as an instant. IST has no daylight saving. */
function istDate(y: number, m: number, d: number): Date {
  return new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+05:30`);
}

/** Today's IST calendar date, whatever timezone the server runs in. */
export function istToday(now = new Date()): { y: number; m: number; d: number } {
  const [d, m, y] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(now).split("/");
  return { y: Number(y), m: Number(m), d: Number(d) };
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
    if (daysAway < 0 || daysAway > withinDays) return;
    out.push({ id, name, what, due, daysAway, severity, appliesIf });
  };

  /*
    This month's monthly deadlines AND next month's.

    Both, because on the 28th every remaining deadline this month is in the
    past, and a ten-day window that returns nothing on the 28th of every month
    would look broken exactly when the next GSTR-1 is nine days out.
  */
  for (const r of MONTHLY) {
    push(r.id, r.name, r.what, istDate(y, m, r.day), r.severity, r.appliesIf);
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    push(`${r.id}-next`, r.name, r.what, istDate(ny, nm, r.day), r.severity, r.appliesIf);
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

/** One deadline as a sentence. "in 0 days" is never printed. */
export function describeDeadline(dl: Deadline): string {
  const when = dl.daysAway === 0 ? "today"
    : dl.daysAway === 1 ? "tomorrow"
    : `in ${dl.daysAway} days`;
  return `${dl.name} is due ${when} — ${dl.what}, if ${dl.appliesIf}.`;
}
