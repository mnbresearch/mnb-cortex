export const APP_VERSION = "6.0.0";
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
  highlight?: boolean; cta: string; features: string[];
};

// ---- AI credit metering ----------------------------------------------------
// What each AI action costs, in credits. Heavier generations cost more.
export const CREDIT_COSTS: Record<string, number> = {
  chat: 1, pulse: 1, ask: 1,
  document: 5, meeting: 4, market: 5, strategy: 6,
  report: 10, forecast: 8, board: 10, investor: 6,
  marketing: 5, competitor: 5, negotiate: 4, hiring: 4,
  contract: 6, account: 5, critique: 3, playbook: 6,
  proposal: 6, valuation: 6, broadcast: 3, sop: 4, costs: 4, loan: 3, vendor: 3,
  agent_image: 15, agent_video: 40,
};

// Weekly image-generation caps by state. Trial = a small taste; paid tiers get more.
export const IMAGE_WEEKLY: Record<string, number> = {
  trial: 5, starter: 40, growth: 150, premium: 600, enterprise: -1,
};
export const DEFAULT_CREDIT_COST = 2;
export function creditCost(mode: string): number {
  return CREDIT_COSTS[String(mode || "").toLowerCase()] ?? DEFAULT_CREDIT_COST;
}

// Monthly included allowance per plan. -1 means unlimited.
export const PLAN_CREDITS: Record<string, number> = {
  starter: 500, growth: 3000, premium: 15000, enterprise: -1,
};

// One-time credits for a free-trial workspace — a small taste, granted once (not monthly).
// Enough to try text agents + a couple of images, not enough for daily use.
export const TRIAL_CREDITS = 150;

// Buyable top-up packs (one-time). Price in INR.
export type CreditPack = { id: string; label: string; credits: number; price: number; per: string };
export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_1k", label: "Starter top-up", credits: 1000, price: 999, per: "₹1.00 / credit" },
  { id: "pack_5k", label: "Growth top-up", credits: 5000, price: 3999, per: "₹0.80 / credit" },
  { id: "pack_20k", label: "Scale top-up", credits: 20000, price: 12999, per: "₹0.65 / credit" },
];

export const PLANS: Plan[] = [
  { id: "starter", name: "Starter", monthly: 2999, annual: 28790, tagline: "For small teams getting started with AI.",
    cta: "Start free trial",
    features: ["1 business workspace", "Up to 2 users", "Business Health Dashboard", "AI CEO Chat (Groq)", "Sales & Finance modules", "CSV import & CSV/Excel export", "Email support"] },
  { id: "growth", name: "Growth", monthly: 7999, annual: 76790, tagline: "For growing SMEs that want the full AI COO.",
    cta: "Start free trial",
    features: ["Everything in Starter", "Up to 10 users", "All 13 modules", "AI actions (POs, invoices, reminders)", "Workflow automation + approvals", "Document & Meeting Intelligence", "Market & Strategy AI", "Priority email + chat support"] },
  { id: "premium", name: "Premium", monthly: 19999, annual: 191990, tagline: "For scaling companies that run on AI.", highlight: true,
    cta: "Talk to sales",
    features: ["Everything in Growth", "Up to 25 users", "Priority AI (faster + higher limits)", "Real email/WhatsApp reminders", "Custom dashboards & reports", "PDF/MIS auto-reports", "Dedicated onboarding", "SLA-backed support"] },
  { id: "enterprise", name: "Enterprise", monthly: 0, annual: 0, tagline: "For groups, PE funds & family offices.",
    cta: "Contact us",
    features: ["Everything in Premium", "Unlimited users & workspaces", "SSO / SAML", "Custom integrations (Tally, ERP, Shopify)", "On-prem / private cloud option", "Dedicated success manager", "Custom SLA & security review"] },
];
