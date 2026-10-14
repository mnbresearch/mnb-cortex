/*
  Relative, WITH the extension, rather than the "@/lib/…" alias used elsewhere.
  node resolves this and does not resolve the alias, so
  scripts/test-seo-pages.mjs can execute the real module instead of a copy.
  tsconfig's "moduleResolution": "bundler" accepts it and webpack resolves it.
*/
import { STATUTORY_CATALOGUE, type StatutoryRule } from "./statutory.ts";

/*
  THE COMPLIANCE CALENDAR AS A SEARCH SURFACE.

  WHY THIS IS THE PAGE SET WORTH BUILDING

  "GSTR-3B due date", "TDS payment due date", "advance tax due date" are asked
  by every business in India, every month, for ever. They are the highest-volume
  commercial-intent queries this product could plausibly rank for, and the data
  behind them already exists and is already maintained — because the product
  itself warns customers about these dates. Publishing them costs no new
  research and creates no new claim.

  FEWER PAGES THAN RULES — and the difference is the whole design.

  The catalogue has nineteen rules, but four of them are advance-tax instalments
  and four more are quarterly TDS returns. Nineteen pages would mean eight that
  differ only in a percentage or a quarter name: near-duplicates competing with
  each other for one query, which is how a site teaches Google that its own
  pages are interchangeable. Grouped, each page answers one question a person
  actually types.

  The GROUPING below is editorial. Every FACT on the resulting page — the day,
  the form, who it applies to — is read from STATUTORY_CATALOGUE at render time.
  Nothing here restates a date.

  THE "IF THIS APPLIES TO YOU" RULE CARRIES OVER.

  statutory.ts opens by saying Cortex is never told whether a business is
  GST-registered, has employees, or deducts TDS at all — so every warning is
  phrased conditionally, and `appliesIf` carries the condition in words. That
  discipline matters MORE on a public page than in the app: a stranger who
  arrives from Google is even less likely to be someone the rule applies to.
  So `appliesIf` is rendered on every page, prominently, never omitted.
*/

export type DeadlineTopic = {
  /** URL slug — written the way the query is typed, not the way we file it. */
  slug: string;
  /** The statutory rule ids this page covers, in the order they should read. */
  ids: string[];
  /** <h1>. */
  h1: string;
  /** <title>, under ~60 chars before the brand. */
  title: string;
  /** Meta description. Says what the page answers, not what we sell. */
  description: string;
  /** One sentence of real context. Must be checkable against the rule itself. */
  standfirst: string;
};

export const DEADLINE_TOPICS: DeadlineTopic[] = [
  {
    slug: "gstr-3b-due-date",
    ids: ["gstr3b"],
    h1: "GSTR-3B due date",
    title: "GSTR-3B due date — when the summary return and payment fall due",
    description:
      "GSTR-3B is the summary GST return and the payment itself. See the day it falls due each month, who has to file it, and what happens to the ones you miss.",
    standfirst:
      "GSTR-3B is the return that actually moves the money — the summary and the payment in one filing.",
  },
  {
    slug: "gstr-1-due-date",
    ids: ["gstr1"],
    h1: "GSTR-1 due date",
    title: "GSTR-1 due date — outward supplies, month by month",
    description:
      "GSTR-1 reports your outward supplies. See the day it falls due each month for monthly filers, who it applies to, and how it relates to GSTR-3B.",
    standfirst:
      "GSTR-1 is what your buyers' input tax credit is built from, so a late one is their problem as well as yours.",
  },
  {
    slug: "tds-payment-due-date",
    /* The March exception lives on the deposit page: "TDS payment due date" is
       one question, and its honest answer has two dates. A separate page would
       be a near-duplicate competing for the same query. */
    ids: ["tds", "tds-march"],
    h1: "TDS and TCS deposit due date",
    title: "TDS payment due date — depositing tax you deducted",
    description:
      "Tax deducted or collected in a month has to be deposited early the following month — with a later date for TDS deducted in March. See both days, who they apply to, and how they differ from the quarterly TDS return.",
    standfirst:
      "Depositing the tax and filing the return are two different obligations on two different dates — this is the deposit.",
  },
  {
    slug: "tds-return-due-date",
    ids: ["tds-q1", "tds-q2", "tds-q3", "tds-q4"],
    h1: "TDS return due dates (24Q / 26Q)",
    title: "TDS return due dates — 24Q and 26Q, all four quarters",
    description:
      "The quarterly TDS return is separate from the monthly deposit. All four quarter-end dates for 24Q and 26Q, and who has to file them.",
    standfirst:
      "Four returns a year, each covering three months of deductions you have already deposited.",
  },
  {
    slug: "pf-esi-due-date",
    ids: ["pf"],
    h1: "PF and ESI due date",
    title: "PF and ESI due date — monthly contributions",
    description:
      "Provident fund and ESI contributions are due monthly. See the day, and who is covered.",
    standfirst:
      "This is money already deducted from an employee's pay, which is why it is treated more seriously than most monthly filings.",
  },
  {
    slug: "advance-tax-due-date",
    ids: ["adv-q1", "adv-q2", "adv-q3", "adv-q4"],
    h1: "Advance tax due dates",
    title: "Advance tax due dates — all four instalments and the percentages",
    description:
      "Advance tax is paid in four instalments across the year, each a cumulative percentage of the year's liability. All four dates and what share is due at each.",
    standfirst:
      "The instalments are cumulative, not equal — which is why missing the first one makes the second one larger rather than optional.",
  },
  {
    slug: "itr-filing-last-date",
    ids: ["itr"],
    h1: "ITR filing last date",
    title: "ITR filing last date — non-audit cases",
    description:
      "The income tax return due date where accounts are not subject to audit. The date, who it applies to, and the separate date if you are audited.",
    standfirst:
      "This is the date for everyone whose accounts do not need a tax audit; audited cases get longer.",
  },
  {
    slug: "tax-audit-due-date",
    /*
      TWO IDS, BECAUSE THEY ARE TWO DEADLINES.

      This page listed only "itr-audit" under the heading "Tax audit and ITR
      due date", so the single date it showed — 31 October — was the return,
      presented as though it were also the audit date. Someone searching "tax
      audit due date", which is what this page ranks for, got the wrong month
      for the thing they searched for: the 44AB report is due 30 September, a
      month earlier, and it is the auditor who files it.

      Listing both ids renders both dates separately with their own
      applicability, which is the only honest way to answer the query.
    */
    ids: ["tax-audit-report", "itr-audit"],
    h1: "Tax audit due date — the report and the return are a month apart",
    title: "Tax audit due date — 44AB report and the ITR that follows",
    description:
      "The section 44AB audit report and the income tax return in audit cases are two separate deadlines, a month apart. Both dates, and who each applies to.",
    standfirst:
      "The audit report comes first and your auditor files it; the return follows a month later. Planning for the later date means missing the earlier one.",
  },
  {
    slug: "aoc-4-due-date",
    ids: ["roc"],
    h1: "AOC-4 due date",
    title: "AOC-4 due date — annual financial statements to the ROC",
    description:
      "Companies file AOC-4 with the Registrar of Companies within thirty days of the AGM. The date and who it applies to.",
    standfirst:
      "AOC-4 is the financial statements; MGT-7 is the annual return. Two filings, two dates, both to the ROC.",
  },
  {
    slug: "mgt-7-due-date",
    ids: ["mgt7"],
    h1: "MGT-7 due date",
    title: "MGT-7 due date — annual return to the ROC",
    description:
      "The company annual return is due within sixty days of the AGM. The date and who it applies to.",
    standfirst:
      "MGT-7 is the annual return rather than the accounts — filed later than AOC-4, and just as easy to forget.",
  },
  {
    slug: "gst-qrmp-pmt-06-due-date",
    ids: ["pmt06"],
    h1: "PMT-06 due date under QRMP",
    title: "PMT-06 due date — GST payment for months 1 and 2 under QRMP",
    description:
      "Businesses on the QRMP scheme file GSTR-3B quarterly but pay the tax for the first two months of each quarter through PMT-06. When it falls due and who it applies to.",
    /*
      It said the payment "stays monthly". It does not: PMT-06 is due only
      after the first and second months of a quarter (eight times a year). The
      third month's tax is paid with the quarterly GSTR-3B, not by PMT-06.
    */
    standfirst:
      "QRMP moves your return to quarterly, but not all of the payment: the tax for the first two months of each quarter is paid through PMT-06, and the third month's goes with the quarterly GSTR-3B.",
  },
  {
    slug: "gstr-6-iff-due-date",
    /* GSTR-6 is now its own rule (every month, for ISDs); IFF is only after
       months 1 and 2 of a QRMP quarter. One page, two cards, two dates. */
    ids: ["gstr6", "iff"],
    h1: "GSTR-6 and IFF due date",
    title: "GSTR-6 and IFF due date — ISD return and QRMP invoice upload",
    description:
      "The input service distributor return, and the optional invoice furnishing facility for QRMP filers. The day and who each applies to.",
    standfirst:
      "Two different obligations that happen to share a day of the month: the ISD return, filed every month, and the optional QRMP invoice upload, which only applies after the first two months of a quarter.",
  },
  {
    slug: "gstr-7-gstr-8-due-date",
    ids: ["gstr7"],
    h1: "GSTR-7 and GSTR-8 due date",
    title: "GSTR-7 and GSTR-8 due date — TDS and TCS under GST",
    description:
      "GST TDS and TCS returns, filed by deductors and e-commerce operators. The day and who it applies to.",
    standfirst:
      "GST TDS is a different thing from income-tax TDS, with its own return and its own date.",
  },
  /*
    THE CAL-1/CAL-2/CAL-3 RULES. Each page below is built exactly like the
    ones above: the day comes from STATUTORY_CATALOGUE (whenLabel first), and
    the copy here only frames it. Wording is conservative on purpose — where
    the law depends on something Cortex is not told (the state a GSTIN is in,
    whether this year's exemption notification has been issued), the page
    says so rather than picking an answer.
  */
  {
    slug: "gstr-1-quarterly-due-date-qrmp",
    ids: ["gstr1-qrmp"],
    h1: "GSTR-1 quarterly due date (QRMP)",
    title: "GSTR-1 quarterly due date — outward supplies under QRMP",
    description:
      "Under the QRMP scheme GSTR-1 is filed once a quarter instead of every month. When the quarterly return falls due, who it applies to, and how it relates to the optional IFF.",
    standfirst:
      "On QRMP your outward supplies are reported once a quarter; the optional IFF is how B2B invoices from the first two months reach your buyers sooner.",
  },
  {
    slug: "gstr-3b-quarterly-due-date-qrmp",
    ids: ["gstr3b-qrmp"],
    h1: "GSTR-3B quarterly due date (QRMP)",
    title: "GSTR-3B quarterly due date — QRMP return, by state",
    description:
      "QRMP filers file GSTR-3B once a quarter, and the due date depends on the state the GSTIN is registered in. When it falls due, who it applies to, and what it pays.",
    standfirst:
      "The quarterly GSTR-3B is due on one of two days depending on your state of registration — check which group your state is in, and plan for the earlier day if you are unsure.",
  },
  {
    slug: "cmp-08-due-date",
    ids: ["cmp08"],
    h1: "CMP-08 due date",
    title: "CMP-08 due date — quarterly statement under the composition scheme",
    description:
      "Composition taxpayers file CMP-08 and pay their tax once a quarter. When it falls due, who it applies to, and how it relates to the annual GSTR-4.",
    standfirst:
      "CMP-08 is the composition scheme's quarterly statement and payment; GSTR-4 is the annual return that follows the year.",
  },
  {
    slug: "gstr-4-due-date",
    ids: ["gstr4"],
    h1: "GSTR-4 due date",
    title: "GSTR-4 due date — annual return for composition taxpayers",
    description:
      "GSTR-4 is the annual GST return for businesses under the composition scheme, filed after the financial year ends. When it falls due and who it applies to.",
    standfirst:
      "GSTR-4 covers the whole financial year just ended, and is filed on top of the four quarterly CMP-08 statements, not instead of them.",
  },
  {
    slug: "gstr-9-due-date",
    ids: ["gstr9"],
    h1: "GSTR-9 due date",
    title: "GSTR-9 due date — GST annual return for regular taxpayers",
    description:
      "GSTR-9 is the GST annual return for regular taxpayers, filed for the previous financial year. When it falls due, who it applies to, and the small-taxpayer exemption.",
    standfirst:
      "Small taxpayers (aggregate turnover up to ₹2 crore) have been exempted from GSTR-9 by notification one year at a time — the exemption is renewed year by year, not permanent, so check the notification for the year you are filing.",
  },
  {
    slug: "msme-1-due-date",
    ids: ["msme1-h1", "msme1-h2"],
    h1: "MSME-1 due dates",
    title: "MSME-1 due dates — half-yearly return of dues to MSE suppliers",
    description:
      "Companies that owe micro or small suppliers beyond 45 days file MSME-1 with the ROC twice a year, once for each half of the financial year. Both dates and who they apply to.",
    standfirst:
      "Two returns a year, one for April–September and one for October–March, each listing what the company owed micro and small suppliers past 45 days.",
  },
];

export const DEADLINE_SLUGS = DEADLINE_TOPICS.map((t) => t.slug);

export function getDeadlineTopic(slug: string): DeadlineTopic | null {
  return DEADLINE_TOPICS.find((t) => t.slug === slug) || null;
}

/** The real rules behind a topic, resolved from the single source. */
export function rulesFor(topic: DeadlineTopic): StatutoryRule[] {
  return topic.ids
    .map((id) => STATUTORY_CATALOGUE.find((r) => r.id === id))
    .filter((r): r is StatutoryRule => Boolean(r));
}

/**
 * "20th of every month" / "15 June" — built from the rule, never typed.
 *
 * The rule's own `whenLabel` comes first: "Nth of every month" misdescribes
 * PMT-06, IFF and the quarterly QRMP returns, which fall due only in some
 * months, and GSTR-3B (QRMP), which is the 22nd OR the 24th by state.
 */
export function whenText(r: StatutoryRule): string {
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
