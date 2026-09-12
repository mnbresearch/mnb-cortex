/*
  Relative, WITH the extension, rather than the "@/lib/…" alias used elsewhere.
  node resolves this and does not resolve the alias, so
  scripts/test-seo-pages.mjs can execute the real module instead of a copy.
  tsconfig's "moduleResolution": "bundler" accepts it and webpack resolves it.
*/
import { INDUSTRIES } from "./industries.ts";

/*
  PER-INDUSTRY METADATA, DERIVED RATHER THAN LISTED.

  calculator-seo.ts holds a hand-written entry per route, which was right there
  — 28 tools with genuinely different search intent, and no structured source
  to derive from. INDUSTRIES is the opposite case: every record already carries
  a name, a tagline, three specific pains and an outcome, all written by a
  human who knew the trade. A second hand-written table would duplicate that
  and then drift from it, which is the failure this codebase has now hit twice
  in one week.

  So the title and description are composed from the record. Adding an industry
  to INDUSTRIES gives it a page, a sitemap entry and metadata with no second
  edit — and scripts/test-seo-pages.mjs fails if any of those go missing.

  WHAT THE COMPOSED TEXT HAS TO ACHIEVE

  A title that matches how the search is typed ("inventory software for a
  pharmacy" is not typed as "Pharmacy | MNB Cortex"), and a description that is
  a real sentence about that trade's problem rather than boilerplate with a
  noun swapped in. The first pain is the most specific thing we know about the
  industry, so it does the work.
*/

export type IndustrySeo = {
  slug: string;
  title: string;
  description: string;
  /** The one-line promise under the H1. */
  standfirst: string;
};

/** Lower-case the industry name for mid-sentence use, keeping D2C-style caps. */
function midSentence(name: string): string {
  return /[A-Z]{2,}/.test(name) ? name : name.toLowerCase();
}

export function industrySeo(slug: string): IndustrySeo | null {
  const i = INDUSTRIES.find((x) => x.slug === slug);
  if (!i) return null;
  const n = midSentence(i.name);

  return {
    slug: i.slug,
    /*
      Intent-shaped, and honest about what this is: early warning on cash and
      compliance, not an ERP for the trade. Overreaching here would put a claim
      on 27 pages at once.
    */
    title: `${i.name} — cash, receivables & GST early warning for Indian ${n} businesses`,
    description: `${i.tagline} Cortex watches what usually goes wrong in ${n} — ${midSentence(i.pains[0])} — against your own Tally, Vyapar or Busy exports, and warns you before it costs you.`,
    standfirst: i.tagline,
  };
}

export const INDUSTRY_SLUGS = INDUSTRIES.map((i) => i.slug);
