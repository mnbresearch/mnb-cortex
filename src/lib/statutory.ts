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
    what: "Form 3CA/3CB with 3CD, signed and uploaded by your auditor — due a month before the return, not with it",
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
  return r.cadence === "monthly" ? `day ${r.day}` : `${r.day} ${MONTH_ABBR[(r.month ?? 1) - 1]}`;
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
    const thisMonth = istDate(y, m, r.day);
    if (thisMonth.getTime() >= today.getTime()) return thisMonth;
    return istDate(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, r.day);
  }

  const thisYear = istDate(y, r.month as number, r.day);
  return thisYear.getTime() >= today.getTime() ? thisYear : istDate(y + 1, r.month as number, r.day);
}

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
