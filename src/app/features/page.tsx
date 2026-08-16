import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Lock, KeyRound, Network, ScrollText } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { ProductPreview } from "@/components/product-preview";

export const metadata = {
  title: "Features — MNB Cortex",
  description: "Everything inside MNB Cortex: an AI workforce, a second brain, and 100+ tools across finance, strategy, sales, people, legal, comms and automation.",
};

const LOOP = [
  { k: "Monitor", d: "Reads sales, finance, inventory, production and HR in real time — one source of truth." },
  { k: "Predict", d: "Forecasts stockouts, churn, and cash crunches weeks before they happen." },
  { k: "Recommend", d: "Boardroom-grade advice, grounded in your live numbers and your history." },
  { k: "Remember", d: "A permanent second brain that makes every answer sharper over time." },
  { k: "Execute", d: "Drafts POs, invoices, reminders, emails, reports — you just approve." },
];

const DOMAINS: { n: string; name: string; blurb: string; tools: string[] }[] = [
  { n: "01", name: "Cortex Workforce", blurb: "A complete AI org chart you can actually run — like hiring a whole team on day one.",
    tools: ["7 departments, one brain", "290+ runnable agents", "Sales → Back Office coverage", "Industry packs (e.g. jewellery sketch → spec)", "Every agent uses your memory", "Audit engine marks a deploy-first roadmap", "Cortex builds custom agents for you", "Image agents via your Gemini key"] },
  { n: "02", name: "Cortex Memory", blurb: "A living, permanent memory of your business that grounds every answer.",
    tools: ["Long-term business memory", "Grounds every AI response", "Knowledge graph of people, customers & vendors", "A self-updating company profile", "Extract memories from any pasted text", "Teach Cortex from your real data", "Export your memory anytime (JSON / Markdown)"] },
  { n: "03", name: "Finance & Money", blurb: "A CFO-grade financial cockpit, tuned for Indian businesses.",
    tools: ["Business Health Dashboard", "P&L Builder", "13-Week Cash Flow", "Cash Runway & Burn", "Cash Conversion Cycle", "Receivables & Payables", "Unit Economics", "Funding, EMI & DSCR", "Net Worth & Balance Sheet", "GST Invoicing, ITC & TDS", "Payroll, CTC & Appraisals", "Financial Ratios & Depreciation"] },
  { n: "04", name: "Strategy & Advisory", blurb: "A McKinsey-in-your-pocket that knows your numbers.",
    tools: ["AI CEO Chat", "Strategy Consultant", "Forecasting & Scenarios", "Business Valuation", "AI Playbooks", "Decision Journal", "Board Deck Generator", "Investor Updates", "Industry Benchmarks", "Risk Radar"] },
  { n: "05", name: "Sales & Growth", blurb: "Fill the pipeline, price it right, keep customers longer.",
    tools: ["Deals Pipeline", "AI Lead Scoring", "Sales Targets", "Marketing Funnel", "Ad Budget & ROAS", "Churn Predictor", "Customer LTV & RFM", "Pricing Optimizer", "Competitor Intel", "Marketing Studio"] },
  { n: "06", name: "People & Operations", blurb: "Run the back half of the business without spreadsheets.",
    tools: ["HR Analytics", "Hiring Advisor", "Team Capacity", "Reorder Optimizer", "Vendor Scorecard", "SOP Builder", "Workflows", "Approvals", "Action Board", "KPI Alerts"] },
  { n: "07", name: "Legal & Compliance", blurb: "Stay compliant and catch risky clauses before you sign.",
    tools: ["GST & Compliance", "Compliance Calendar", "Contract Review", "Document Intelligence"] },
  { n: "08", name: "Communications", blurb: "Reach customers and your team, on autopilot.",
    tools: ["Email Campaigns + tracking", "WhatsApp Broadcast", "Daily CEO Brief", "Meeting Assistant", "Negotiation Coach"] },
  { n: "09", name: "Automation", blurb: "Set it once; Cortex keeps working while you sleep.",
    tools: ["AI Autopilot (daily)", "Scheduled reports", "Public API & Webhooks", "Data Explorer", "CSV / Sheets / PDF import"] },
  { n: "10", name: "Integrations", blurb: "Plugs into the tools you already run.",
    tools: ["Tally, Zoho, Odoo", "Razorpay, Cashfree, Stripe, Shopify", "HubSpot, Salesforce", "WhatsApp, Slack, SendGrid", "62 tools + Custom API keys"] },
];

const SECURITY = [
  { i: Lock, t: "Encrypted everywhere", d: "TLS in transit; sensitive keys encrypted with AES-256-GCM at rest." },
  { i: Network, t: "Workspace isolation", d: "Postgres row-level security means one workspace can never read another's data." },
  { i: KeyRound, t: "Role-based access", d: "Viewer → Analyst → Manager → Admin → Owner, enforced on every action." },
  { i: ScrollText, t: "Audit logs", d: "Every meaningful action is recorded; export your entire workspace anytime." },
];

export default function Features() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      {/* Hero */}
      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-14">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="00">Features</SectionLabel>
          <Kinetic as="h1" text={"Your whole company,\nin one brain."} className="font-display display-1 tracking-tightest mt-6" />
          <div className="mt-6 grid lg:grid-cols-[1.2fr_1fr] gap-8 items-end">
            <p className="text-lg text-muted-foreground max-w-2xl">
              Most tools give you a dashboard and leave the thinking to you. MNB Cortex is an AI operating system:
              a runnable workforce, a permanent memory, and 100+ tools that monitor, predict, recommend and act — together.
            </p>
            <div className="flex gap-3 lg:justify-end">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>Start free <ArrowUpRight className="h-4 w-4" /></Link>
              <Link href="/pricing" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">See pricing</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Product preview */}
      <section className="px-5 lg:px-10 pb-24">
        <div className="max-w-5xl mx-auto"><Reveal><ProductPreview /></Reveal></div>
      </section>

      {/* The loop */}
      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="01">The loop</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 mb-12 max-w-3xl">It runs the loop, continuously.</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-px bg-border border rounded-2xl overflow-hidden">
            {LOOP.map((x, i) => (
              <div key={x.k} className="bg-card p-6 hover:bg-accent/40 transition-colors">
                <div className="font-display text-4xl tracking-tightest text-primary">{String(i + 1).padStart(2, "0")}</div>
                <div className="mt-4 font-semibold text-lg">{x.k}</div>
                <p className="mt-2 text-sm text-muted-foreground">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Domains */}
      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="02">Everything inside</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 mb-14 max-w-3xl">Ten domains. One login.</h2>
          <div className="space-y-16">
            {DOMAINS.map((d) => (
              <Reveal key={d.n}>
                <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6 lg:gap-12 items-start">
                  <div>
                    <div className="flex items-baseline gap-4">
                      <span className="text-sm tabular-nums text-muted-foreground">{d.n}</span>
                      <h3 className="font-display text-3xl lg:text-5xl tracking-tightest">{d.name}</h3>
                    </div>
                    <p className="text-muted-foreground mt-4 max-w-md lg:pl-8">{d.blurb}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:pt-2">
                    {d.tools.map((t) => (
                      <span key={t} className="rounded-full border bg-card px-3.5 py-1.5 text-sm hover:bg-accent hover:border-primary/40 transition-colors">{t}</span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="px-5 lg:px-10 py-24 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="03">Security &amp; trust</SectionLabel>
          <div className="mt-5 flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h2 className="font-display display-3 tracking-tightest">Enterprise-grade by default.</h2>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border rounded-2xl overflow-hidden">
            {SECURITY.map((s) => (
              <div key={s.t} className="bg-card p-6">
                <s.i className="h-5 w-5 text-primary" />
                <div className="mt-3 font-semibold">{s.t}</div>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
