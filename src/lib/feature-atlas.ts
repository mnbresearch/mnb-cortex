/*
  THE FEATURE ATLAS — everything Cortex does, by the job it does for you.

  Cortex has well over a hundred screens, and the honest problem is that
  owners never find most of them. A long sidebar is an index, not an
  introduction. This is the introduction: each entry says, in one line, what
  you get, where it lives, and which plan includes it — grouped by the job an
  owner is trying to get done, not by our module names.

  Rules this file keeps (scripts/test-feature-atlas.mjs enforces them):
    · every `route` is a real page in lib/nav.ts
    · every `modes` entry is a real metered mode in config.ts CREDIT_COSTS —
      those are what the "you have used this" badge reads, so the badge can
      only ever be true
    · plan gating comes from config.ts (planIncludes / IMAGE_WEEKLY), never
      typed here, so a reprice cannot leave this page lying
    · outcomes say what the feature does, not what it might achieve

  Pure: no React, no server imports. Rendered by components/feature-atlas.tsx
  on /discover (with the workspace's own usage) and /features (public).
*/
import { planIncludes, lowestPlanWith, IMAGE_WEEKLY, PLANS, type Capability } from "./config.ts";

export type JobId = "paid" | "compliant" | "cash" | "sell" | "operate" | "decide" | "automate" | "create" | "connect";

export const JOBS: { id: JobId; label: string; blurb: string; emoji: string }[] = [
  { id: "paid",      label: "Get paid",            blurb: "Know who owes you and chase it without the awkward calls.", emoji: "💰" },
  { id: "compliant", label: "Stay compliant",      blurb: "Never miss a date or lose a deduction.",                    emoji: "🧾" },
  { id: "cash",      label: "Manage cash",         blurb: "See the runway, the gaps and the payables before they bite.", emoji: "🏦" },
  { id: "sell",      label: "Sell more",           blurb: "Pipeline, quotes, leads and customers worth keeping.",      emoji: "📈" },
  { id: "operate",   label: "Run operations",      blurb: "Stock, suppliers, team and the day-to-day.",                emoji: "⚙️" },
  { id: "decide",    label: "Decide with numbers", blurb: "Ask questions of your own data and get a straight answer.", emoji: "🧭" },
  { id: "automate",  label: "Put it on autopilot", blurb: "Rules, workflows and approvals that run without you.",       emoji: "🤖" },
  { id: "create",    label: "Create content",      blurb: "Agents that write, design and make video for your business.", emoji: "🎨" },
  { id: "connect",   label: "Connect your systems", blurb: "Bring data in and push results out.",                       emoji: "🔌" },
];

export type Gate =
  | { kind: "all" }
  | { kind: "cap"; cap: Capability }
  | { kind: "images" }
  | { kind: "practice" };

export type Feature = {
  id: string;
  job: JobId;
  title: string;
  /** One line: what you get. */
  outcome: string;
  route: string;
  gate: Gate;
  /** Metered modes that mean "this workspace has used it". Empty = no usage signal. */
  modes: string[];
  keywords: string;
};

const all: Gate = { kind: "all" };

export const FEATURES: Feature[] = [
  // ---- Get paid
  { id: "receivables", job: "paid", title: "Receivables & DSO", outcome: "Every overdue invoice, ranked by how much it is costing you, with the customer named.", route: "/receivables", gate: all, modes: [], keywords: "overdue debtors ageing dso outstanding" },
  { id: "collections", job: "paid", title: "Collections", outcome: "Drafts polite reminders in your tone, sends after you approve, and stops when they pay.", route: "/collections", gate: all, modes: [], keywords: "chase reminder whatsapp email follow up" },
  { id: "approvals", job: "paid", title: "Approvals", outcome: "One queue of everything Cortex wants to do — approve, edit or reject in a tap.", route: "/approvals", gate: all, modes: [], keywords: "approve ledger signed actions" },
  { id: "customers", job: "paid", title: "Customer 360", outcome: "One page per customer: what they owe, buy, and how they pay.", route: "/customers", gate: all, modes: [], keywords: "customer history profile" },
  // ---- Stay compliant
  { id: "msme", job: "compliant", title: "MSME 45-day (43B(h))", outcome: "The supplier bills that lose your tax deduction if paid late — and which to clear first.", route: "/msme", gate: all, modes: [], keywords: "43b msme udyam supplier deduction" },
  { id: "compliance", job: "compliant", title: "Compliance calendar", outcome: "Your GST, TDS, PF/ESI, advance-tax and ROC dates — only the ones that apply to you.", route: "/compliance", gate: all, modes: [], keywords: "gst tds pf esi deadline due date roc" },
  { id: "gst-reader", job: "compliant", title: "GST return reader", outcome: "Upload a GSTR and get the mismatches and what to do about them.", route: "/gst-reader", gate: all, modes: ["gst"], keywords: "gstr 2b 3b itc reconciliation" },
  { id: "contracts", job: "compliant", title: "Contract review", outcome: "The clauses that could hurt you, in plain English, before you sign.", route: "/contracts", gate: all, modes: ["contract"], keywords: "agreement legal clause risk" },
  // ---- Manage cash
  { id: "cashflow", job: "cash", title: "Cash flow & runway", outcome: "When the cash runs out at today's pace, and what moves the date.", route: "/cashflow", gate: all, modes: [], keywords: "runway burn forecast liquidity" },
  { id: "bank", job: "cash", title: "Bank statement reader", outcome: "Upload a statement; get categorised spend, leaks and recurring charges.", route: "/bank", gate: all, modes: ["bankstatement"], keywords: "bank pdf statement spend categorise" },
  { id: "payables", job: "cash", title: "Payables & DPO", outcome: "What you owe, to whom and when — so you pay in the right order.", route: "/payables", gate: all, modes: [], keywords: "creditors suppliers bills dpo" },
  { id: "funding", job: "cash", title: "Funding & loans", outcome: "Which loan fits, what it costs, and whether your numbers support it.", route: "/funding", gate: all, modes: ["loan"], keywords: "loan credit msme scheme dscr" },
  // ---- Sell more
  { id: "pipeline", job: "sell", title: "Deals pipeline", outcome: "Weighted forecast by stage, and the deals going cold.", route: "/pipeline", gate: all, modes: [], keywords: "deals crm stage forecast" },
  { id: "leads", job: "sell", title: "Leads", outcome: "Every enquiry scored by a clear rule, hottest first, one click to customer.", route: "/leads", gate: all, modes: [], keywords: "enquiry lead score inbox" },
  { id: "quote", job: "sell", title: "Quotation builder", outcome: "GST-correct quotes, flagged when they go unanswered, converted to invoices in one click.", route: "/quote", gate: all, modes: [], keywords: "quote estimate proposal" },
  { id: "rfm", job: "sell", title: "Customer segments", outcome: "Who your best customers are, who is slipping, and who to win back.", route: "/rfm", gate: all, modes: [], keywords: "rfm segment loyal churn" },
  { id: "churn", job: "sell", title: "Churn predictor", outcome: "Customers going quiet, before they are gone.", route: "/churn", gate: all, modes: [], keywords: "churn retention lapsed" },
  { id: "visibility", job: "sell", title: "AI visibility", outcome: "Whether AI assistants recommend you when buyers ask — and who they recommend instead.", route: "/visibility", gate: all, modes: ["visibility"], keywords: "seo ai search gemini chatgpt brand" },
  { id: "gbp", job: "sell", title: "Google Business Profile", outcome: "Posts, replies and fixes for your Google listing.", route: "/gbp", gate: all, modes: ["gbp"], keywords: "google maps reviews listing local" },
  // ---- Run operations
  { id: "inventory", job: "operate", title: "Inventory & reorder", outcome: "Items at or below reorder level, with the supplier named.", route: "/inventory", gate: all, modes: [], keywords: "stock reorder warehouse sku" },
  { id: "vendors", job: "operate", title: "Vendor scorecard", outcome: "Describe a supplier's terms and Cortex scores them — with a negotiation angle.", route: "/vendors", gate: all, modes: ["vendor"], keywords: "supplier vendor rating" },
  { id: "sops", job: "operate", title: "SOP builder", outcome: "Turn how you do things into a written procedure your team can follow.", route: "/sops", gate: all, modes: ["sop"], keywords: "process procedure checklist" },
  { id: "hiring", job: "operate", title: "Hiring advisor", outcome: "Job descriptions, interview plans and offer maths.", route: "/hiring", gate: all, modes: ["hiring"], keywords: "recruit jd interview salary" },
  // ---- Decide with numbers
  { id: "chat", job: "decide", title: "Ask Cortex", outcome: "Ask anything about your own invoices and orders — in English or Hinglish — and get the rows behind the answer.", route: "/chat", gate: all, modes: ["chat"], keywords: "ask question chat ai assistant" },
  { id: "dashboard", job: "decide", title: "Business health", outcome: "Your KPIs and what changed, every morning.", route: "/dashboard", gate: all, modes: [], keywords: "kpi dashboard health score" },
  { id: "plan", job: "decide", title: "My plan (Monday brief)", outcome: "The three things worth your attention this week, by email.", route: "/plan", gate: all, modes: [], keywords: "weekly plan brief monday email" },
  { id: "deepdive", job: "decide", title: "Deep dive", outcome: "A long-form analysis of one question about your business.", route: "/deepdive", gate: all, modes: ["deepdive"], keywords: "analysis report research" },
  { id: "forecast", job: "decide", title: "Forecasting", outcome: "Next quarter from your own history, with the drivers you can change.", route: "/forecast", gate: all, modes: ["forecast", "scenario"], keywords: "forecast scenario projection" },
  { id: "boardroom", job: "decide", title: "Board deck & investor update", outcome: "A deck or update drafted from your actual numbers.", route: "/boardroom", gate: all, modes: ["board"], keywords: "board investor deck update" },
  // ---- Automate
  { id: "workflows", job: "automate", title: "Workflows", outcome: "Describe an automation in a sentence; Cortex builds the steps and runs them on schedule.", route: "/workflows", gate: { kind: "cap", cap: "workflows" }, modes: ["automation_plan"], keywords: "automation schedule workflow zapier" },
  { id: "alerts", job: "automate", title: "KPI alert rules", outcome: "Your own thresholds, checked nightly — crossings arrive in one daily email digest.", route: "/alerts", gate: { kind: "cap", cap: "alert_rules" }, modes: [], keywords: "alert threshold notify" },
  { id: "autopilot", job: "automate", title: "Autopilot rules", outcome: "Let reminders and other actions run on their own within limits you set.", route: "/approvals", gate: { kind: "cap", cap: "autonomy" }, modes: [], keywords: "autopilot autonomous auto rules" },
  { id: "memory", job: "automate", title: "Cortex Memory", outcome: "Cortex remembers your business — customers, terms, preferences — across every answer.", route: "/memory", gate: { kind: "cap", cap: "memory" }, modes: [], keywords: "memory context remember" },
  { id: "workforce", job: "automate", title: "AI agents & workforce", outcome: "Ready-made agents for every team, on your own numbers.", route: "/workforce", gate: all, modes: [], keywords: "agents team workforce" },
  // ---- Create
  { id: "marketing", job: "create", title: "Marketing studio", outcome: "Campaigns, posts and copy in your brand's voice.", route: "/marketing", gate: all, modes: ["marketing"], keywords: "marketing post copy campaign social" },
  { id: "agent-images", job: "create", title: "Images & video", outcome: "Product shots, ads and short videos from a photo or a sentence.", route: "/agents", gate: { kind: "images" }, modes: ["agent_image", "agent_video"], keywords: "image video ad reel ugc photo" },
  { id: "broadcast", job: "create", title: "WhatsApp broadcast", outcome: "One message to a segment of your customers, written for you.", route: "/broadcast", gate: all, modes: ["broadcast"], keywords: "whatsapp broadcast message" },
  { id: "proposals", job: "create", title: "Proposals", outcome: "A client-ready proposal from a few lines of brief.", route: "/proposals", gate: all, modes: ["proposal"], keywords: "proposal pitch document" },
  // ---- Connect
  { id: "import", job: "connect", title: "Import from Tally, Vyapar, Busy, Excel", outcome: "Drop an export; Cortex maps the columns and starts watching the same day.", route: "/import", gate: all, modes: [], keywords: "import tally vyapar busy excel csv" },
  { id: "integrations", job: "connect", title: "Integrations", outcome: "Shopify, Razorpay, Stripe, Google Sheets and more, synced in.", route: "/integrations", gate: all, modes: [], keywords: "shopify razorpay stripe sheets sync" },
  { id: "developers", job: "connect", title: "API & webhooks", outcome: "Scoped, expiring API keys and signed webhooks for your own systems.", route: "/developers", gate: { kind: "cap", cap: "api" }, modes: [], keywords: "api key webhook developer" },
  { id: "practice", job: "connect", title: "Practice console", outcome: "For CA firms: every client workspace on one screen, ranked by who needs you.", route: "/practice", gate: { kind: "practice" }, modes: [], keywords: "ca firm practice clients accountant" },
];

/** Which features are worth suggesting: included in the plan, has a usage signal, not used yet. */
export function suggestFor(opts: { included: (f: Feature) => boolean; usedModes: Set<string>; limit?: number }): Feature[] {
  const out: Feature[] = [];
  for (const f of FEATURES) {
    if (!f.modes.length || !opts.included(f)) continue;
    if (f.modes.some((m) => opts.usedModes.has(m))) continue;
    out.push(f);
    if (out.length >= (opts.limit ?? 3)) break;
  }
  return out;
}

/** Plain search over title, outcome and keywords. */
export function matches(f: Feature, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return `${f.title} ${f.outcome} ${f.keywords}`.toLowerCase().split(/\s+/).some((w) => w.includes(s)) || `${f.title} ${f.outcome} ${f.keywords}`.toLowerCase().includes(s);
}

/**
 * Is this feature in the given plan, and if not, which plan has it? Derived
 * from config.ts so the answer moves with the price list. `plan` null = a
 * visitor (public page): everything reads as "on <lowest plan>".
 */
export function gateInfo(f: Feature, plan: string | null): { included: boolean; label: string } {
  const p = plan ? String(plan).toLowerCase() : "";
  const g = f.gate;
  if (g.kind === "all") return { included: !!p, label: "Every plan" };
  if (g.kind === "cap") return { included: !!p && planIncludes(p, g.cap), label: `${lowestPlanWith(g.cap)} and above` };
  if (g.kind === "images") {
    const lowest = PLANS.find((x) => (IMAGE_WEEKLY[x.id] ?? 0) > 0)?.name || "a higher plan";
    return { included: !!p && (IMAGE_WEEKLY[p] ?? 0) > 0, label: `${lowest} and above` };
  }
  return { included: p === "practice" || p === "enterprise", label: "Practice plan" };
}
