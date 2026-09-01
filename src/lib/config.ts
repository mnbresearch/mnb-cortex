export const APP_VERSION = "6.40.0";
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919711488481";

// ADMIN_EMAIL and SUPER_ADMINS moved to src/lib/operators.ts, which is
// server-only. This file is imported by client components, so anything
// left here ships in the browser bundle.

/**
 * The businesses in your portfolio, with categorisation.
 * `publicKpis` are figures PUBLISHED on each company's own website — shown as
 * public/marketing figures, never presented as internal management accounts.
 */
export const MY_BUSINESSES = [
  {
    slug: "mnb-research",
    name: "MNB Research",
    legalName: "MNB Research",
    category: "Consulting & Growth",
    industry: "consulting",
    tagline: "Research-driven strategy, growth & digital transformation",
    services: ["Strategy consulting", "Financial modeling", "Market research", "Web development", "SEO", "AI tools", "Digital marketing"],
    sectorsServed: ["EdTech", "FMCG", "Manufacturing", "AI"],
    site: "https://www.mnbresearch.com",
    app: "",
    contact: "contact@mnbresearch.com",
    publicKpis: [
      { label: "Businesses impacted", value: "50+", note: "across EdTech, FMCG, Manufacturing, AI" },
      { label: "Positioning", value: "Growth & consultancy", note: "recognised as India's Best Business Growth & Consultancy Service Provider" },
    ],
  },
  {
    slug: "abrobot",
    name: "AbroBot",
    legalName: "Abrobot Technologies",
    category: "EdTech / AI SaaS",
    industry: "education",
    tagline: "India's AI-powered study abroad platform",
    services: ["AI Counsellor", "SOP Analyser", "ROI Predictor", "Scholarship Finder", "University matching", "Visa & compliance", "Test prep (IELTS/GRE/GMAT/TOEFL)", "Application & admission"],
    sectorsServed: ["Study abroad", "USA", "Canada", "UK", "Germany", "Australia"],
    site: "https://www.abrobot.ai",
    app: "https://app.abrobot.ai",
    contact: "contact@mnbresearch.com",
    publicKpis: [
      { label: "Student data points", value: "25 lakh+", note: "training data behind the AI" },
      { label: "Consultants trained", value: "4,000+", note: "expert insights" },
      { label: "Visa success rate", value: "88–92%", note: "across destinations (published)" },
      { label: "Scholarships facilitated", value: "₹55 Cr+", note: "2025–26 (published)" },
      { label: "AI tools live", value: "20+", note: "at app.abrobot.ai" },
      { label: "Press reach", value: "160+ outlets", note: "60M+ reach" },
    ],
  },
] as const;

export type Plan = {
  id: string; name: string; monthly: number; annual: number; tagline: string;
  usdMonthly?: number; usdAnnual?: number;
  highlight?: boolean; cta: string; features: string[];
};

// Display currencies for the marketing pricing page. Cashfree settles in INR;
// USD is shown for international prospects (who are routed to "Talk to sales").
export type CurrencyCode = "INR" | "USD";
export const CURRENCIES: Record<CurrencyCode, { symbol: string; label: string; locale: string }> = {
  INR: { symbol: "₹", label: "INR", locale: "en-IN" },
  USD: { symbol: "$", label: "USD", locale: "en-US" },
};
export function formatMoney(amount: number, cur: CurrencyCode): string {
  return CURRENCIES[cur].symbol + amount.toLocaleString(CURRENCIES[cur].locale);
}
/** Price for a plan in the chosen currency + billing cycle. Returns null for "custom". */
export function planPrice(p: Plan, cur: CurrencyCode, annual: boolean): number | null {
  if (p.monthly === 0 && (p.usdMonthly ?? 0) === 0) return null; // enterprise / custom
  if (cur === "USD") return annual ? (p.usdAnnual ?? 0) : (p.usdMonthly ?? 0);
  return annual ? p.annual : p.monthly;
}

// ---- AI credit metering ----------------------------------------------------
// What each AI action costs, in credits. Heavier generations cost more.
export const CREDIT_COSTS: Record<string, number> = {
  // 2 credits, not 1. The 1-credit price assumed gemini-2.5-flash at ₹0.22 a
  // call — but that model 404s on our key, so calls land on a model costing
  // ₹0.40-0.88. At 1 credit (₹0.90 at the floor) chat was running at roughly
  // break-even, and it is by far the highest-volume action. At 2 credits it
  // clears 4x against the realistic model and stays positive even against the
  // dearest one.
  chat: 2, pulse: 1, ask: 2,
  document: 5, meeting: 4, market: 5, strategy: 6,
  report: 10, forecast: 8, board: 10, investor: 6, brief: 3,
  marketing: 5, competitor: 5, negotiate: 4, hiring: 4,
  contract: 6, account: 5, critique: 3, playbook: 6,
  proposal: 6, valuation: 6, broadcast: 3, sop: 4, costs: 4, loan: 3, vendor: 3,
  deepdive: 12, visibility: 10, bankstatement: 8, gst: 8, act: 2,
  // Google Business Profile content: a short single-pass generation on the FAST
  // profile, so it costs us about what `brief` does and is priced to match.
  // Deliberately cheap — it is the reason a shop owner opens Cortex weekly, and
  // the habit is worth more than the three credits.
  gbp: 3,
  // Generation is where real money is spent. See COGS above: an image costs us
  // about ₹3.74 and an 8-second Veo Fast clip about ₹77, so these two are
  // priced for a ~4.7x margin at the ₹0.90 credit floor. Video was 40 credits
  // — roughly ₹36 of revenue against ₹306 of Veo Standard billing, a ₹270 loss
  // on every single clip, and up to ₹3.4 lakh a month from one Business
  // account. It is the one number in this file that could have bankrupted the
  // product, so it does not get changed without redoing the arithmetic.
  agent_image: 20, agent_video: 400,
};

// Weekly image-generation caps by state. Trial = a small taste; paid tiers get more.
export const IMAGE_WEEKLY: Record<string, number> = {
  // `payg` = no subscription, but a bought credit balance. The credits already
  // carry the margin (every action is priced at ~4x the floor), so the weekly
  // cap here is only a runaway guard, not a commercial lever.
  payg: 50,
  starter: 0, growth: 120, business: 500, aicoo: 2000, enterprise: -1,
  // legacy ids kept so an existing workspace never falls through to a default
  solo: 0, premium: 500, trial: 0,
};

/**
 * Videos per week. Video shares the image gate but needs its own ceiling:
 * an 8-second clip costs ~₹77 against ~₹3.74 for an image, so one number
 * cannot sensibly govern both.
 */
export const VIDEO_WEEKLY: Record<string, number> = {
  payg: 10,
  starter: 0, growth: 5, business: 20, aicoo: 60, enterprise: -1,
  solo: 0, premium: 20, trial: 0,
};

export const DEFAULT_CREDIT_COST = 2;
export function creditCost(mode: string): number {
  return CREDIT_COSTS[String(mode || "").toLowerCase()] ?? DEFAULT_CREDIT_COST;
}

// Monthly included allowance per plan. -1 means unlimited.
export const PLAN_CREDITS: Record<string, number> = {
  starter: 1000, growth: 5000, business: 20000, aicoo: 60000, enterprise: -1,
  // legacy ids — an old row must still resolve to something sane
  solo: 1000, premium: 20000,
};

/**
 * There is no free trial.
 *
 * Kept as 0 rather than deleted because TRIAL_DAYS is read in several places;
 * zero means a workspace is never granted a free window. Entry is either the
 * ₹149 credit pack (pay as you go, no subscription) or a plan. The free public
 * Business Health Check remains the top of funnel — it is rate-limited and
 * costs three Gemini calls, not an open-ended account.
 *
 * A three-day trial on a product whose first step is "connect Tally or upload a
 * bank statement" was converting badly anyway: the clock ran out before an
 * owner had their data in.
 */
export const TRIAL_DAYS = 0;

/** No free credits. A new workspace buys a pack or a plan. */
export const TRIAL_CREDITS = 0;

/**
 * Users allowed per plan — the caps the pricing page advertises ("1 user",
 * "up to 3 users", "Up to 75 users"). Nothing enforced them, so ₹799 and
 * ₹39,999 both bought unlimited seats. -1 means unlimited.
 */
export const PLAN_SEATS: Record<string, number> = {
  starter: 1, growth: 5, business: 20, aicoo: 75, enterprise: -1,
  solo: 1, premium: 20,
};
export function seatLimit(plan: string | null | undefined): number {
  return PLAN_SEATS[String(plan || "").toLowerCase()] ?? PLAN_SEATS.starter;
}

// Buyable top-up packs (one-time). Price in INR.
export type CreditPack = { id: string; label: string; credits: number; price: number; per: string };
export const CREDIT_PACKS: CreditPack[] = [
  // ₹0.90 is the FLOOR. Every credit cost above is sized for a ~4x margin at
  // that price, so discounting past it quietly deletes the margin everywhere.
  { id: "pack_100", label: "Taster", credits: 100, price: 149, per: "₹1.49 / credit" },
  { id: "pack_500", label: "Small", credits: 500, price: 599, per: "₹1.20 / credit" },
  { id: "pack_2k", label: "Standard", credits: 2000, price: 1999, per: "₹1.00 / credit" },
  { id: "pack_10k", label: "Bulk", credits: 10000, price: 8999, per: "₹0.90 / credit" },
];

export const PLANS: Plan[] = [
  // Four tiers, not six. The old ladder ran ₹799 → ₹2,499 → ₹6,999 → ₹17,999 →
  // ₹39,999; buyers couldn't tell Solo from Starter or Premium from Business,
  // and ₹799 could never repay any paid-acquisition cost. Each tier now maps to
  // a recognisable size of business and a distinct go-to-market motion.
  //
  // Every bullet below is something the product ACTUALLY does today. WhatsApp
  // execution appears only on AI COO because it needs Meta credentials the
  // customer supplies; "62 integrations" is not claimed anywhere, because only
  // four currently sync data.
  { id: "starter", name: "Starter", monthly: 1499, annual: 14990, usdMonthly: 19, usdAnnual: 189,
    tagline: "See your business clearly. One owner, one workspace.",
    cta: "Choose Starter",
    features: [
      "1 user · 1 workspace",
      "1,000 AI credits / month",
      "Business Health Dashboard + Cortex Score",
      "AI CEO Chat grounded in your data",
      "Bank statement & GST return reader",
      "90+ business calculators",
      "3 integrations · CSV / Excel import",
      "Email support",
    ] },
  { id: "growth", name: "Growth", monthly: 4999, annual: 49990, usdMonthly: 59, usdAnnual: 599,
    tagline: "The AI COO for a growing team.", highlight: true,
    cta: "Choose Growth",
    features: [
      "Up to 5 users",
      "5,000 AI credits / month",
      "All 7 agent departments + 26 industries",
      "Workflow automation + approvals",
      "Cortex Memory — permanent business context",
      "Scheduled reports & daily autopilot",
      "10 integrations",
      "120 images + 5 videos / week",
      "Priority email support",
    ] },
  { id: "business", name: "Business", monthly: 14999, annual: 149990, usdMonthly: 179, usdAnnual: 1799,
    tagline: "For companies that run on their numbers.",
    cta: "Choose Business",
    features: [
      "Up to 20 users",
      "20,000 AI credits / month",
      "Everything in Growth",
      "Public API + outbound webhooks",
      "Custom dashboards & auto-reports",
      "30 integrations",
      "500 images + 20 videos / week",
      "Guided onboarding · priority support",
    ] },
  { id: "aicoo", name: "AI COO", monthly: 39999, annual: 399990, usdMonthly: 469, usdAnnual: 4699,
    tagline: "Cortex runs the operation, not just the reporting.",
    cta: "Choose AI COO",
    features: [
      "Up to 75 users · multi-workspace",
      "60,000 AI credits / month",
      "Everything in Business",
      "WhatsApp execution (your Meta account)",
      "White-label & custom branding",
      "Unlimited integrations",
      "2,000 images + 60 videos / week",
      "Done-for-you onboarding · success manager",
    ] },
  { id: "enterprise", name: "Enterprise", monthly: 0, annual: 0,
    tagline: "For large groups, PE funds & family offices.",
    cta: "Contact us",
    features: [
      "Unlimited users & workspaces",
      "Unlimited AI credits, images & video",
      "SSO / SAML",
      "Custom integrations (Tally, ERP, Shopify)",
      "On-prem / private cloud option",
      "Custom SLA & security review",
    ] },
];
