import type { Metadata } from "next";

/*
  THE 29 CALCULATORS ARE THE LARGEST UNUSED ACQUISITION ASSET IN THIS PRODUCT.

  WHAT WAS TRUE BEFORE THIS FILE

  All 29 are already public — middleware gates nothing and the data layer falls
  back to demo mode, so https://cortex.mnbresearch.com/gst-calc returns 200 to
  anybody. They are real, working tools for queries Indian business owners
  search constantly: GST, TDS, EPF, gratuity, advance tax, depreciation.

  And every single one served the ROOT LAYOUT'S metadata. Twenty-nine pages
  with the identical title — "MNB Cortex — Know what's going wrong, before it
  costs you" — and the identical site-wide description. None were in
  sitemap.xml (21 URLs, zero calculators). robots.ts allows them, so they are
  crawlable; they were simply indistinguishable from each other and from the
  home page.

  To a search engine that is not "29 pages of useful tools". It is one site
  saying the same thing 29 times, which is worse than not having them.

  WHY A CENTRAL MAP RATHER THAN COPY IN EACH FILE

  Titles and descriptions are marketing copy that wants reviewing as a set —
  you can only see whether they cannibalise each other by reading them
  together. Scattered across 29 page files nobody ever reads them together,
  and the seventh person to add a calculator copies whatever the sixth wrote.

  Each page then carries one line:

      export const metadata = calcMetadata("/gst-calc");

  HOW THESE ARE WRITTEN

  Titles lead with the thing being searched for, not the brand — someone typing
  "gratuity calculator" is not looking for us. The brand comes last, after the
  useful words, where it costs nothing.

  Descriptions say what the tool DOES and, where it matters, name the statutory
  basis it follows. That is a genuine differentiator against the free
  calculators that never say which Finance Act they implement, and it is only
  a fair claim because scripts/test-statutory.mjs pins the constants.

  Nothing here promises a free trial, because there is not one. See the
  TRIAL_DAYS block in scripts/test-positioning.mjs.
*/

type CalcSeo = { title: string; description: string; keywords?: string[] };

export const CALCULATOR_SEO: Record<string, CalcSeo> = {
  /* ---------------------------------------------------------- tax & GST -- */
  "/gst-calc": {
    title: "GST Calculator — add or remove GST, with CGST/SGST/IGST split",
    description:
      "Add GST to a base price or strip it out of an inclusive one, at 0.25%, 3%, 5%, 12%, 18% or 28%, with the CGST/SGST and IGST split shown separately. Free, no signup.",
    keywords: ["gst calculator", "gst inclusive exclusive", "cgst sgst igst split", "reverse gst calculator india"],
  },
  "/gst-latefee": {
    title: "GST Late Fee & Interest Calculator — GSTR-1 and GSTR-3B",
    description:
      "Work out the late fee and 18% interest on a delayed GSTR-1 or GSTR-3B, including the nil-return concession and the per-return cap. Free, no signup.",
    keywords: ["gst late fee calculator", "gstr 3b late fee", "gst interest 18 percent", "nil return late fee"],
  },
  "/itc": {
    title: "GST Input Tax Credit Set-off Calculator — the order ITC must be used",
    description:
      "Apply your IGST, CGST and SGST credit in the order the law requires and see what cash you still have to pay. Free, no signup.",
    keywords: ["itc set off calculator", "gst input tax credit order", "igst cgst sgst utilisation"],
  },
  "/tds": {
    title: "TDS Calculator — section-wise rates, thresholds and the amount to deduct",
    description:
      "Pick the section (194C, 194J, 194H, 194I and more), enter the payment, and see the threshold, the rate and the tax to deduct — including the higher rate for a missing PAN. Free, no signup.",
    keywords: ["tds calculator", "194c tds rate", "194j tds", "tds threshold limit", "tds without pan"],
  },
  "/advance-tax": {
    title: "Advance Tax Calculator — the four instalments and 234B/234C interest",
    description:
      "See what is due on 15 June, 15 September, 15 December and 15 March, and the section 234B and 234C interest if you have already missed one. Free, no signup.",
    keywords: ["advance tax calculator", "advance tax instalment dates", "234c interest calculator", "234b interest"],
  },
  "/tax": {
    title: "Income Tax Calculator — old regime vs new regime, side by side",
    description:
      "Compare the old and new regimes on the same income, with slabs, standard deduction, surcharge and cess applied, and see which leaves you better off. Free, no signup.",
    keywords: ["income tax calculator india", "old vs new regime", "income tax slabs", "surcharge cess calculator"],
  },
  "/depreciation": {
    title: "Depreciation Calculator — WDV and straight line, Companies Act and Income Tax",
    description:
      "Written-down value or straight line, with the block rates the Income Tax Act uses and the useful lives the Companies Act sets, plus a year-by-year schedule. Free, no signup.",
    keywords: ["depreciation calculator", "wdv depreciation", "companies act depreciation rates", "income tax block rates"],
  },

  /* ----------------------------------------------------------- payroll -- */
  "/gratuity": {
    title: "Gratuity Calculator — the 15/26 formula and the ₹20 lakh cap",
    description:
      "Enter last drawn salary and years of service and see the gratuity payable under the Payment of Gratuity Act, with the five-year rule and the statutory ceiling applied. Free, no signup.",
    keywords: ["gratuity calculator", "gratuity formula 15 26", "gratuity 5 years rule", "gratuity exemption limit"],
  },
  "/epf": {
    title: "EPF & ESI Calculator — employee and employer contributions",
    description:
      "Split a salary into EPF, EPS and ESI at the current rates and wage ceilings, showing what the employee contributes and what the employer adds on top. Free, no signup.",
    keywords: ["epf calculator", "esi calculator", "pf contribution employer employee", "eps 8.33 percent"],
  },
  "/rate-card": {
    title: "Billable Rate Calculator — what you must charge per hour to hit your target",
    description:
      "Work back from the income you want, your billable hours and your overheads to the hourly rate that actually gets you there. Free, no signup.",
    keywords: ["billable rate calculator", "hourly rate consultant india", "freelance rate calculator"],
  },

  /* ------------------------------------------------ profit and pricing -- */
  "/markup": {
    title: "Markup vs Margin Calculator — the two numbers people mix up",
    description:
      "Convert between markup and margin, and see the selling price, the profit and the percentage on both bases. A 50% markup is a 33% margin; this shows why. Free, no signup.",
    keywords: ["markup vs margin calculator", "margin calculator india", "selling price from cost", "gross margin percentage"],
  },
  "/breakeven": {
    title: "Break-even Calculator — units and revenue needed to cover your costs",
    description:
      "Enter fixed costs, variable cost per unit and price to find the break-even point, the contribution margin and what a price change does to it. Free, no signup.",
    keywords: ["break even calculator", "contribution margin calculator", "break even point units", "fixed variable costs"],
  },

  /* ----------------------------------------- cash and working capital -- */
  "/runway": {
    title: "Cash Runway Calculator — how many months you have left",
    description:
      "Enter your cash balance and monthly burn to see the months of runway remaining and the date it reaches zero. The number worth checking before anything else. Free, no signup.",
    keywords: ["cash runway calculator", "burn rate calculator", "months of runway", "startup runway india"],
  },
  "/ccc": {
    title: "Cash Conversion Cycle Calculator — DSO, DIO and DPO",
    description:
      "Work out how many days your cash is tied up between paying suppliers and being paid, from your receivable, inventory and payable days. Free, no signup.",
    keywords: ["cash conversion cycle calculator", "dso dio dpo", "working capital days", "ccc formula"],
  },
  "/networth": {
    title: "Net Worth & Balance Sheet Calculator — assets, liabilities and what is left",
    description:
      "List what the business owns and owes and see net worth, the current ratio and the debt-to-equity position. Free, no signup.",
    keywords: ["net worth calculator business", "balance sheet calculator", "current ratio", "debt to equity ratio"],
  },

  /* --------------------------------------- funding and investment ------- */
  "/roi": {
    title: "ROI & Payback Calculator — return and how long to get it back",
    description:
      "Enter what you spend and what it returns to see ROI, annualised return and the payback period in months. Free, no signup.",
    keywords: ["roi calculator", "payback period calculator", "return on investment india", "annualised return"],
  },
  "/amortization": {
    title: "Loan EMI & Amortisation Schedule — every instalment, interest and principal",
    description:
      "Enter loan amount, rate and tenure for the EMI, the total interest, and a month-by-month schedule showing how much of each payment is principal. Free, no signup.",
    keywords: ["emi calculator", "loan amortisation schedule", "business loan emi india", "principal interest breakup"],
  },
  "/debt": {
    title: "Debt Payoff Calculator — avalanche vs snowball, with the interest saved",
    description:
      "List your loans and see which order clears them fastest and which saves the most interest, and what an extra payment each month does. Free, no signup.",
    keywords: ["debt payoff calculator", "debt avalanche vs snowball", "loan prepayment calculator india"],
  },
  "/prepay": {
    title: "Prepay the Loan or Invest? — the comparison, with tax",
    description:
      "Compare prepaying a loan against investing the same money, allowing for the interest rate, the expected return and the tax on both sides. Free, no signup.",
    keywords: ["prepay loan or invest", "loan prepayment vs investment", "home loan prepayment calculator"],
  },
  "/sip": {
    title: "Investment Growth & SIP Calculator — what regular investing compounds to",
    description:
      "Project a lump sum or a monthly SIP forward at an assumed return, with the total invested and the gain shown separately. Free, no signup.",
    keywords: ["sip calculator", "compound interest calculator india", "investment growth calculator", "lumpsum vs sip"],
  },
  "/dscr": {
    title: "DSCR Calculator — will a lender fund this loan?",
    description:
      "Work out the debt service coverage ratio from your operating income and the proposed repayment, and see the loan size that keeps you above the ratio banks want. Free, no signup.",
    keywords: ["dscr calculator", "debt service coverage ratio", "business loan eligibility india", "dscr for bank loan"],
  },
  "/buyvslease": {
    title: "Buy vs Lease Calculator — equipment and vehicles, after tax",
    description:
      "Compare buying outright against leasing over the same period, including depreciation, interest and the tax treatment of each. Free, no signup.",
    keywords: ["buy vs lease calculator", "equipment lease vs buy india", "vehicle lease or purchase business"],
  },
  "/rentvsbuy": {
    title: "Rent vs Buy Calculator — premises, over the years you will hold them",
    description:
      "Compare renting against buying over your actual holding period, including the deposit, the loan, maintenance and what the rent would have grown to. Free, no signup.",
    keywords: ["rent vs buy calculator india", "commercial property rent or buy", "office space buy or lease"],
  },

  /* ------------------------------------------------------- intelligence -- */
  "/ltv": {
    title: "Customer Lifetime Value Calculator — LTV, CAC and the ratio between them",
    description:
      "Work out what a customer is worth over their life, what you spend to win one, and whether the ratio is the 3:1 investors ask about. Free, no signup.",
    keywords: ["ltv calculator", "customer lifetime value", "ltv cac ratio", "cac payback period"],
  },
  "/funnel": {
    title: "Marketing Funnel Calculator — where the drop-off actually is",
    description:
      "Enter the count at each stage to see the conversion rate between them, and which single step is costing you the most. Free, no signup.",
    keywords: ["marketing funnel calculator", "conversion rate by stage", "sales funnel drop off"],
  },
  "/adbudget": {
    title: "Ad Budget & ROAS Calculator — what the spend has to return",
    description:
      "Work back from a revenue target to the ad budget it needs at your conversion rate and order value, and the ROAS that makes it worth doing. Free, no signup.",
    keywords: ["roas calculator", "ad budget calculator", "cpa calculator india", "marketing budget planner"],
  },
  "/abtest": {
    title: "A/B Test Significance Calculator — is that result real?",
    description:
      "Enter visitors and conversions for both variants to get the lift, the confidence level, and whether you have enough data to call it. Free, no signup.",
    keywords: ["ab test calculator", "statistical significance calculator", "conversion rate test", "sample size ab test"],
  },
  "/inventory-turns": {
    title: "Inventory Turnover Calculator — turns, days of stock and what is trapped",
    description:
      "See how many times your stock turns a year, the days of inventory that implies, and how much cash is sitting on the shelf. Free, no signup.",
    keywords: ["inventory turnover calculator", "stock turnover ratio", "days inventory outstanding", "inventory days formula"],
  },
};

/** Every calculator route, for the sitemap. */
export const CALCULATOR_ROUTES = Object.keys(CALCULATOR_SEO);

/**
 * One line per calculator page.
 *
 * The canonical URL matters more here than anywhere else on the site: these
 * pages accept query strings from shared links, and without a canonical each
 * variation is a duplicate competing with the original.
 */
export function calcMetadata(route: string): Metadata {
  const seo = CALCULATOR_SEO[route];
  if (!seo) return {};
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: route },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: route,
      type: "website",
    },
  };
}
