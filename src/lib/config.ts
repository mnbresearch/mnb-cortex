export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919711488481";
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "mnbgotyou@gmail.com";

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
