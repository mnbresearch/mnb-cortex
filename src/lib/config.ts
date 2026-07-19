export const APP_VERSION = "1.6.0";
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

/** The businesses in your portfolio, with categorisation. */
export const MY_BUSINESSES = [
  {
    slug: "mnb-research",
    name: "MNB Research",
    category: "Consulting & Growth",
    industry: "consulting",
    tagline: "Research-driven strategy, growth & digital transformation",
    services: ["Strategy consulting", "Financial modeling", "Market research", "Web development", "SEO", "AI tools", "Digital marketing"],
    sectorsServed: ["EdTech", "FMCG", "Manufacturing", "AI"],
    site: "https://www.mnbresearch.com",
  },
  {
    slug: "approbot",
    name: "Approbot",
    category: "EdTech / AI Product",
    industry: "education",
    tagline: "AI-powered abroad-education advisory",
    services: ["AI advisory bot", "Student counselling", "University matching", "Consultant network"],
    sectorsServed: ["Study abroad", "Student counselling"],
    site: "https://www.mnbresearch.com",
  },
] as const;

export type Plan = {
  id: string; name: string; monthly: number; annual: number; tagline: string;
  highlight?: boolean; cta: string; features: string[];
};

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
