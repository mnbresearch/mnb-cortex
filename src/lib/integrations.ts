// Integration catalogue + plan gating. Safe to import from client components
// (contains no secrets — only metadata describing what each integration needs).

export type PlanId = "starter" | "growth" | "premium" | "enterprise";
export const PLAN_RANK: Record<PlanId, number> = { starter: 1, growth: 2, premium: 3, enterprise: 4 };

export type Field = {
  key: string;
  label: string;
  type: "password" | "text";
  placeholder?: string;
  required?: boolean;
  help?: string;
};

export type Integration = {
  id: string;
  name: string;
  category: "Accounting & Finance" | "Commerce & Payments" | "CRM & Sales" | "Communication" | "Productivity" | "Marketing & Analytics" | "Data & Automation";
  desc: string;
  minPlan: PlanId;
  fields: Field[];
  docs?: string;
  /** We can verify these credentials with a real API call. */
  testable?: boolean;
};

/** How many integrations each plan may connect. */
export const PLAN_INTEGRATION_LIMIT: Record<PlanId, number> = {
  starter: 2,
  growth: 6,
  premium: 20,
  enterprise: 999,
};

const KEY = (label = "API key", ph = "sk_live_…"): Field => ({ key: "api_key", label, type: "password", placeholder: ph, required: true });

export const INTEGRATIONS: Integration[] = [
  // ---- Accounting & Finance ----
  { id: "zoho_books", name: "Zoho Books", category: "Accounting & Finance", desc: "Invoices, expenses and ledger sync", minPlan: "growth", testable: true,
    docs: "https://www.zoho.com/books/api/v3/",
    fields: [KEY("OAuth token", "1000.xxxx"), { key: "organization_id", label: "Organization ID", type: "text", placeholder: "60xxxxxxx", required: true }] },
  { id: "tally", name: "Tally", category: "Accounting & Finance", desc: "Ledger, vouchers and stock from Tally Prime", minPlan: "growth",
    fields: [{ key: "endpoint", label: "Tally endpoint URL", type: "text", placeholder: "http://localhost:9000", required: true, help: "Enable ODBC/HTTP in Tally Prime" }] },
  { id: "quickbooks", name: "QuickBooks", category: "Accounting & Finance", desc: "Accounting and P&L sync", minPlan: "premium",
    fields: [KEY("Access token"), { key: "realm_id", label: "Realm ID", type: "text", required: true }] },
  { id: "razorpay", name: "Razorpay", category: "Commerce & Payments", desc: "Payments, settlements and payouts", minPlan: "growth", testable: true,
    docs: "https://razorpay.com/docs/api/",
    fields: [{ key: "key_id", label: "Key ID", type: "text", placeholder: "rzp_live_…", required: true }, { key: "key_secret", label: "Key secret", type: "password", required: true }] },
  { id: "stripe", name: "Stripe", category: "Commerce & Payments", desc: "Global payments and subscriptions", minPlan: "growth", testable: true,
    docs: "https://stripe.com/docs/api", fields: [KEY("Secret key", "sk_live_…")] },

  // ---- Commerce ----
  { id: "shopify", name: "Shopify", category: "Commerce & Payments", desc: "Orders, products and customers", minPlan: "growth", testable: true,
    docs: "https://shopify.dev/docs/api/admin-rest",
    fields: [{ key: "shop", label: "Shop domain", type: "text", placeholder: "my-store.myshopify.com", required: true }, KEY("Admin API access token", "shpat_…")] },
  { id: "woocommerce", name: "WooCommerce", category: "Commerce & Payments", desc: "WordPress store orders", minPlan: "premium",
    fields: [{ key: "site_url", label: "Store URL", type: "text", placeholder: "https://store.com", required: true }, { key: "consumer_key", label: "Consumer key", type: "password", required: true }, { key: "consumer_secret", label: "Consumer secret", type: "password", required: true }] },
  { id: "amazon_seller", name: "Amazon Seller", category: "Commerce & Payments", desc: "Marketplace orders and settlements", minPlan: "premium",
    fields: [KEY("LWA refresh token"), { key: "seller_id", label: "Seller ID", type: "text", required: true }] },

  // ---- CRM & Sales ----
  { id: "hubspot", name: "HubSpot", category: "CRM & Sales", desc: "Contacts, deals and pipeline", minPlan: "growth", testable: true,
    docs: "https://developers.hubspot.com/docs/api/overview", fields: [KEY("Private app token", "pat-na1-…")] },
  { id: "salesforce", name: "Salesforce", category: "CRM & Sales", desc: "Enterprise CRM sync", minPlan: "premium",
    fields: [KEY("Access token"), { key: "instance_url", label: "Instance URL", type: "text", placeholder: "https://xx.my.salesforce.com", required: true }] },
  { id: "zoho_crm", name: "Zoho CRM", category: "CRM & Sales", desc: "Leads, contacts and deals", minPlan: "growth",
    fields: [KEY("OAuth token"), { key: "domain", label: "Data centre", type: "text", placeholder: "www.zohoapis.in", required: true }] },
  { id: "pipedrive", name: "Pipedrive", category: "CRM & Sales", desc: "Sales pipeline and activities", minPlan: "growth", testable: true,
    docs: "https://developers.pipedrive.com/docs/api/v1", fields: [KEY("API token")] },

  // ---- Communication ----
  { id: "slack", name: "Slack", category: "Communication", desc: "Alerts and daily briefs to a channel", minPlan: "starter", testable: true,
    docs: "https://api.slack.com/messaging/webhooks",
    fields: [{ key: "webhook_url", label: "Incoming webhook URL", type: "password", placeholder: "https://hooks.slack.com/services/…", required: true }] },
  { id: "whatsapp", name: "WhatsApp Business", category: "Communication", desc: "Campaigns, reminders and broadcasts", minPlan: "growth",
    docs: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    fields: [KEY("Permanent access token"), { key: "phone_number_id", label: "Phone number ID", type: "text", required: true }] },
  { id: "resend", name: "Resend", category: "Communication", desc: "Transactional email delivery", minPlan: "starter", testable: true,
    docs: "https://resend.com/docs", fields: [KEY("API key", "re_…")] },
  { id: "twilio", name: "Twilio", category: "Communication", desc: "SMS and voice notifications", minPlan: "premium",
    fields: [{ key: "account_sid", label: "Account SID", type: "text", required: true }, { key: "auth_token", label: "Auth token", type: "password", required: true }] },
  { id: "telegram", name: "Telegram", category: "Communication", desc: "Bot alerts to a chat or group", minPlan: "starter", testable: true,
    docs: "https://core.telegram.org/bots/api",
    fields: [{ key: "bot_token", label: "Bot token", type: "password", required: true }, { key: "chat_id", label: "Chat ID", type: "text", required: true }] },

  // ---- Productivity ----
  { id: "google_sheets", name: "Google Sheets", category: "Productivity", desc: "Import from a published sheet", minPlan: "starter",
    fields: [{ key: "url", label: "Published sheet URL", type: "text", placeholder: "https://docs.google.com/spreadsheets/…", required: true, help: "File → Share → Publish to web (CSV)" }] },
  { id: "notion", name: "Notion", category: "Productivity", desc: "Databases, docs and wikis", minPlan: "growth", testable: true,
    docs: "https://developers.notion.com/", fields: [KEY("Internal integration secret", "secret_…")] },
  { id: "airtable", name: "Airtable", category: "Data & Automation", desc: "Bases and records", minPlan: "growth", testable: true,
    docs: "https://airtable.com/developers/web/api/introduction",
    fields: [KEY("Personal access token", "pat…"), { key: "base_id", label: "Base ID", type: "text", placeholder: "app…", required: true }] },
  { id: "gmail", name: "Gmail / Workspace", category: "Productivity", desc: "Email and calendar context", minPlan: "premium",
    fields: [KEY("OAuth refresh token")] },

  // ---- Marketing & Analytics ----
  { id: "google_analytics", name: "Google Analytics 4", category: "Marketing & Analytics", desc: "Traffic, conversions and funnels", minPlan: "growth",
    fields: [KEY("Service account JSON key"), { key: "property_id", label: "Property ID", type: "text", required: true }] },
  { id: "meta_ads", name: "Meta Ads", category: "Marketing & Analytics", desc: "Facebook & Instagram ad spend and ROAS", minPlan: "premium",
    fields: [KEY("Access token"), { key: "ad_account_id", label: "Ad account ID", type: "text", placeholder: "act_…", required: true }] },
  { id: "google_ads", name: "Google Ads", category: "Marketing & Analytics", desc: "Campaign spend and conversions", minPlan: "premium",
    fields: [KEY("Developer token"), { key: "customer_id", label: "Customer ID", type: "text", required: true }] },

  // ---- Data & Automation ----
  { id: "webhook", name: "Custom Webhook", category: "Data & Automation", desc: "Push Cortex events to any URL", minPlan: "growth",
    fields: [{ key: "url", label: "Destination URL", type: "text", placeholder: "https://your-app.com/hook", required: true }, { key: "secret", label: "Signing secret (optional)", type: "password" }] },
  { id: "zapier", name: "Zapier", category: "Data & Automation", desc: "Connect 6,000+ apps", minPlan: "growth",
    fields: [{ key: "webhook_url", label: "Zapier hook URL", type: "password", required: true }] },
  { id: "openai", name: "OpenAI", category: "Data & Automation", desc: "Use your own model key for AI features", minPlan: "premium", testable: true,
    docs: "https://platform.openai.com/docs/api-reference", fields: [KEY("API key", "sk-…")] },
  { id: "postgres", name: "External Postgres", category: "Data & Automation", desc: "Read from your own database", minPlan: "enterprise",
    fields: [{ key: "connection_string", label: "Connection string", type: "password", placeholder: "postgres://user:pass@host/db", required: true }] },
];

export const CATEGORIES = Array.from(new Set(INTEGRATIONS.map((i) => i.category)));

export function planAllows(plan: string | null | undefined, integration: Integration): boolean {
  const p = (plan || "starter").toLowerCase() as PlanId;
  const rank = PLAN_RANK[p] ?? 1;
  return rank >= PLAN_RANK[integration.minPlan];
}

export function integrationById(id: string): Integration | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}

export function limitForPlan(plan: string | null | undefined): number {
  const p = (plan || "starter").toLowerCase() as PlanId;
  return PLAN_INTEGRATION_LIMIT[p] ?? 2;
}
