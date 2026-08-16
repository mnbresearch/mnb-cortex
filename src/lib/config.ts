export const APP_VERSION = "6.40.0";
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919711488481";
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "mnbgotyou@gmail.com";

/**
 * PLATFORM super-admins — a level ABOVE org "owner".
 * Org roles (viewer→analyst→manager→admin→owner) are scoped to a single workspace.
 * A super-admin operates the whole platform: sees every organization and grants access.
 * Override with SUPER_ADMIN_EMAILS="a@x.com,b@y.com".
 */
export const SUPER_ADMINS: string[] = (process.env.SUPER_ADMIN_EMAILS || "mridulnanda2004@gmail.com,mnbgotyou@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

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
  chat: 1, pulse: 1, ask: 1,
  document: 5, meeting: 4, market: 5, strategy: 6,
  report: 10, forecast: 8, board: 10, investor: 6, brief: 3,
  marketing: 5, competitor: 5, negotiate: 4, hiring: 4,
  contract: 6, account: 5, critique: 3, playbook: 6,
  proposal: 6, valuation: 6, broadcast: 3, sop: 4, costs: 4, loan: 3, vendor: 3,
  deepdive: 12, visibility: 10, bankstatement: 8, gst: 8, act: 2,
  agent_image: 15, agent_video: 40,
};

// Weekly image-generation caps by state. Trial = a small taste; paid tiers get more.
export const IMAGE_WEEKLY: Record<string, number> = {
  trial: 5, solo: 15, starter: 45, growth: 150, premium: 600, business: 2500, enterprise: -1,
};
export const DEFAULT_CREDIT_COST = 2;
export function creditCost(mode: string): number {
  return CREDIT_COSTS[String(mode || "").toLowerCase()] ?? DEFAULT_CREDIT_COST;
}

// Monthly included allowance per plan. -1 means unlimited.
export const PLAN_CREDITS: Record<string, number> = {
  solo: 300, starter: 900, growth: 4000, premium: 15000, business: 45000, enterprise: -1,
};

/**
 * Free-trial length in days. Single source of truth — billing.ts, workspace.ts
 * and the /billing copy all read this. The UI used to claim "14-day free trial"
 * while the code enforced 3.
 */
export const TRIAL_DAYS = 3;

// One-time credits for a free-trial workspace — a small taste, granted once (not monthly).
// Enough to try text agents + a couple of images, not enough for daily use.
export const TRIAL_CREDITS = 150;

/**
 * Users allowed per plan — the caps the pricing page advertises ("1 user",
 * "up to 3 users", "Up to 75 users"). Nothing enforced them, so ₹799 and
 * ₹39,999 both bought unlimited seats. -1 means unlimited.
 */
export const PLAN_SEATS: Record<string, number> = {
  solo: 1, starter: 3, growth: 10, premium: 25, business: 75, enterprise: -1,
};
export function seatLimit(plan: string | null | undefined): number {
  return PLAN_SEATS[String(plan || "").toLowerCase()] ?? PLAN_SEATS.solo;
}

// Buyable top-up packs (one-time). Price in INR.
export type CreditPack = { id: string; label: string; credits: number; price: number; per: string };
export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_1k", label: "Starter top-up", credits: 1000, price: 999, per: "₹1.00 / credit" },
  { id: "pack_5k", label: "Growth top-up", credits: 5000, price: 3999, per: "₹0.80 / credit" },
  { id: "pack_20k", label: "Scale top-up", credits: 20000, price: 12999, per: "₹0.65 / credit" },
];

export const PLANS: Plan[] = [
  { id: "solo", name: "Solo", monthly: 799, annual: 7670, usdMonthly: 12, usdAnnual: 115, tagline: "For a solo founder or freelancer trying AI.",
    cta: "Choose Solo",
    features: ["1 workspace · 1 user", "300 AI credits / month", "Business Health Dashboard", "AI CEO Chat + Cortex Memory", "50+ business calculators", "15 image generations / week", "Email support"] },
  { id: "starter", name: "Starter", monthly: 2499, annual: 23990, usdMonthly: 29, usdAnnual: 279, tagline: "For small teams getting started with AI.",
    cta: "Choose Starter",
    features: ["1 workspace · up to 3 users", "900 AI credits / month", "All calculators + AI agents", "Sales, Finance & HR modules", "CSV / Excel import & export", "45 image generations / week", "Email support"] },
  { id: "growth", name: "Growth", monthly: 6999, annual: 67190, usdMonthly: 85, usdAnnual: 815, tagline: "The full AI COO for growing SMEs.", highlight: true,
    cta: "Choose Growth",
    features: ["Up to 10 users", "4,000 AI credits / month", "All 7 agent departments + 26 industries", "Workflow automation + approvals", "Document & Meeting Intelligence", "150 image generations / week", "Priority email + chat support"] },
  { id: "premium", name: "Premium", monthly: 17999, annual: 172790, usdMonthly: 219, usdAnnual: 2099, tagline: "For scaling companies that run on AI.",
    cta: "Choose Premium",
    features: ["Up to 25 users", "15,000 AI credits / month", "Priority AI (faster, higher limits)", "Real email / WhatsApp automations", "Custom dashboards & auto-reports", "600 image generations / week", "Dedicated onboarding + SLA"] },
  { id: "business", name: "Business", monthly: 39999, annual: 383990, usdMonthly: 489, usdAnnual: 4699, tagline: "For multi-brand groups & agencies.",
    cta: "Choose Business",
    features: ["Up to 75 users · multi-workspace", "45,000 AI credits / month", "White-label & custom branding", "Public API + webhooks", "2,500 image generations / week", "Priority support + success manager"] },
  { id: "enterprise", name: "Enterprise", monthly: 0, annual: 0, tagline: "For large groups, PE funds & family offices.",
    cta: "Contact us",
    features: ["Unlimited users & workspaces", "Unlimited AI credits & images", "SSO / SAML", "Custom integrations (Tally, ERP, Shopify)", "On-prem / private cloud option", "Custom SLA & security review"] },
];
