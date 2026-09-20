/**
 * PLAYBOOKS — the unit of value this product actually sells.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT MARKETING COPY.
 *
 * Cortex has 128 modules. That is a true number and a bad way to describe a
 * product: breadth reads as a free-tools site, and an owner deciding in five
 * seconds does not want 128 of anything. What they want is the handful of
 * things that will cost them money this month, watched without being asked.
 *
 * A playbook is that unit. Each one names, in the owner's language:
 *
 *   WATCHES  — the specific condition in their own data
 *   DOES     — what Cortex does when the condition is met
 *   MODULE   — the route that implements it, which must exist
 *
 * The last field is the point. Every playbook on the landing page resolves to
 * a real module in lib/nav.ts, and scripts/test-claims.mjs fails the build if
 * one does not. This product has spent a lot of effort removing claims that
 * were written rather than implemented; a "templates" section is exactly where
 * that failure would recur, so the guard is built in from the first line.
 *
 * WHAT MAKES THEM AI-NATIVE, precisely — because the phrase is usually empty.
 *
 * Three different things are doing work in a playbook, and only one of them is
 * a model. Being honest about which is which is what separates this from a
 * chatbot with a marketing page:
 *
 *   RULES decide. The 45-day MSME clock, the statutory calendar, a reorder
 *   point: these are arithmetic over the customer's rows, in tested code
 *   (lib/msme.ts, lib/statutory.ts). A model that is asked to compute a
 *   statutory deadline will eventually get one wrong, and a wrong tax date is
 *   worse than no product.
 *
 *   THE MODEL READS AND WRITES. It reads the customer's own rows through tool
 *   calls, explains what it found in their language, and drafts the message,
 *   the plan or the summary a human then approves.
 *
 *   THE PRODUCT ACTS. Draft, approve, send, and record what came back. A
 *   recommendation nobody executes is a PDF.
 *
 * The industry lists are about EMPHASIS, not gating: every playbook runs for
 * every workspace that has the data it needs. A manufacturer and a clinic both
 * have receivables; only one of them has a reorder point that matters.
 */

export type Playbook = {
  id: string;
  name: string;
  /** The trigger, in the owner's words. */
  watches: string;
  /** What happens when it fires. */
  does: string;
  /** The module that implements it. MUST exist in lib/nav.ts. */
  module: string;
  /** Who feels this one most. Empty means "everyone". */
  industries: string[];
  /** Where the decision is made — see the note above on what AI-native means. */
  engine: "rules" | "rules+model" | "model";
};

export const PLAYBOOKS: Playbook[] = [
  {
    id: "receivables",
    name: "Nobody has paid you",
    watches: "Every invoice that passes its due date, and how long the money has been out.",
    does: "Names the customer and the amount the day it goes overdue, and ranks who to chase first by size and age.",
    module: "/receivables",
    industries: ["Manufacturing", "Services", "Wholesale"],
    engine: "rules",
  },
  {
    id: "msme-43bh",
    name: "The 45-day MSME clock",
    watches: "Bills from MSME-registered suppliers approaching the 45-day limit in Section 43B(h).",
    does: "Shows the exposure that becomes non-deductible if you miss it, aged from the invoice date, and which bills to clear first.",
    module: "/msme",
    industries: ["Manufacturing", "Wholesale", "Construction"],
    engine: "rules",
  },
  {
    id: "statutory",
    name: "The date you were going to miss",
    watches: "GST, TDS, advance tax, ROC and the audit dates that apply to YOUR registration — not a generic calendar.",
    does: "Warns ahead of each one, with a notice period set per deadline rather than a flat reminder.",
    module: "/compliance",
    industries: [],
    engine: "rules",
  },
  {
    id: "runway",
    name: "When the cash runs out",
    watches: "Money in and out across thirteen weeks, from your ledger rather than a guess.",
    does: "Projects the runway, marks the week it turns, and lets you model a what-if before you commit to it.",
    module: "/cashflow",
    industries: [],
    engine: "rules+model",
  },
  {
    id: "collections",
    name: "Chasing, without you doing it",
    watches: "Overdue invoices that have gone past the point where a polite reminder is due.",
    does: "Drafts the reminder in your business's name, waits for your approval, sends it, and stops the moment the invoice is marked paid.",
    module: "/collections",
    industries: [],
    engine: "rules+model",
  },
  {
    id: "reorder",
    name: "About to run out of stock",
    watches: "On-hand quantity against the reorder level and how fast each SKU is moving.",
    does: "Flags what to reorder before the shelf is empty, and what is sitting still and tying up cash.",
    module: "/inventory",
    industries: ["Manufacturing", "Retail", "D2C", "Wholesale", "Pharmacy"],
    engine: "rules",
  },
  {
    id: "churn",
    name: "A customer going quiet",
    watches: "Ordering patterns that break — the buyer who used to come monthly and has not for two cycles.",
    does: "Ranks who is drifting away by what they are worth, so the call goes to the account that matters.",
    module: "/churn",
    industries: ["D2C", "Retail", "Services", "SaaS", "Wholesale"],
    engine: "rules+model",
  },
  {
    id: "weekly-plan",
    name: "The Monday plan",
    watches: "Everything above, once a week, together.",
    does: "One email: the three things worth your attention, why each one, and what to do about it.",
    module: "/plan",
    industries: [],
    engine: "rules+model",
  },
  {
    id: "pricing",
    name: "The price you are leaving on the table",
    watches: "Margin by product and customer, and where discounting has quietly become the default.",
    does: "Shows what a price move does to contribution before you make it.",
    module: "/pricing",
    industries: ["Manufacturing", "D2C", "Retail", "Services"],
    engine: "rules+model",
  },
  {
    id: "best-customers",
    name: "Who is actually worth keeping",
    watches: "Recency, frequency and value across your customer base.",
    does: "Segments them so the effort goes where the money is, instead of where the noise is.",
    module: "/rfm",
    industries: ["D2C", "Retail", "Services", "Wholesale"],
    engine: "rules",
  },
];

/**
 * How many industries the product has a tailored pack for.
 *
 * Deliberately a function over the real list rather than a number typed into
 * a page. Published counts in this repo have drifted from reality twice
 * before, which is why scripts/test-claims.mjs exists.
 */
export function playbookCount(): number {
  return PLAYBOOKS.length;
}

/** The modules every playbook depends on, for the guard in test-claims. */
export function playbookModules(): string[] {
  return PLAYBOOKS.map((p) => p.module);
}
