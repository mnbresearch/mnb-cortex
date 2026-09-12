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

  THIRTEEN PAGES, NOT NINETEEN — and the difference is the whole design.

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
    ids: ["tds"],
    h1: "TDS and TCS deposit due date",
    title: "TDS payment due date — depositing tax you deducted",
    description:
      "Tax deducted or collected in a month has to be deposited early the following month. See the day, who it applies to, and how it differs from the quarterly TDS return.",
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
    ids: ["itr-audit"],
    h1: "Tax audit and ITR due date",
    title: "Tax audit due date — ITR under section 44AB",
    description:
      "Where turnover crosses the section 44AB audit threshold, the return is due later than the non-audit date. The date and who it applies to.",
    standfirst:
      "Crossing the 44AB threshold moves your return date — it does not remove the obligation to have been ready earlier.",
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
    title: "PMT-06 due date — monthly GST payment under QRMP",
    description:
      "Businesses on the QRMP scheme file quarterly but pay monthly through PMT-06. The day it falls due and who it applies to.",
    standfirst:
      "QRMP moves your RETURN to quarterly. It does not move the payment, which stays monthly.",
  },
  {
    slug: "gstr-6-iff-due-date",
    ids: ["iff"],
    h1: "GSTR-6 and IFF due date",
    title: "GSTR-6 and IFF due date — ISD return and QRMP invoice upload",
    description:
      "The input service distributor return, and the optional invoice furnishing facility for QRMP filers. The day and who each applies to.",
    standfirst:
      "Two different obligations that happen to share a date: the ISD return, and the QRMP invoice upload.",
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

/** "20th of every month" / "15 June" — built from the rule, never typed. */
export function whenText(r: StatutoryRule): string {
  const ord = (n: number) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  if (r.cadence === "monthly") return `${ord(r.day)} of every month`;
  const months = ["", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${r.day} ${months[r.month || 1]}`;
}
