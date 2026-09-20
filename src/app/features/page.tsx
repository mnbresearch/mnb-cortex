import Link from "next/link";
import {
  ArrowUpRight, ShieldCheck, Lock, KeyRound, Network, ScrollText,
  LayoutDashboard, Landmark, ReceiptText, CalendarClock, Database, Gauge,
  MessageSquare, Telescope, LineChart, Brain, FileBarChart, Calculator,
  Megaphone, Sparkles, Bot, Workflow, Radio, Cpu,
  Radar, KanbanSquare, UserMinus, BadgeIndianRupee, Target, Gem,
  BrainCircuit, Receipt, Banknote, Plug,
} from "lucide-react";
import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { ProductPreview } from "@/components/product-preview";

/*
  THE DEPTH MOVED HERE FROM THE HOMEPAGE, and this is the right home for it.

  The landing page carried all of this — a thirty-card feature grid, an
  eight-card audience grid and a seven-row comparison table — on top of
  everything else, and ran to eighteen sections. Nobody reaches section
  fifteen. Worse, to a first-time reader already wondering how much work this
  product will be, a wall of 128 capabilities reads as 128 things to learn.

  None of it is deleted. It is moved to the page whose entire job is answering
  "yes, but what is actually in it?", which is a question asked by a reader who
  has already decided to take the product seriously — and who will happily read
  a long page to get the answer.
*/

export const metadata = {
  title: "Features — MNB Cortex",
  description: "Everything inside MNB Cortex: an AI workforce, a second brain, and 100+ tools across finance, strategy, sales, people, legal, comms and automation.",
};

const LOOP = [
  /* "in real time" contradicted the daily-cron architecture. */
  { k: "Monitor", d: "Reads sales, finance, inventory, production and HR every day — one source of truth." },
  { k: "Predict", d: "Forecasts stockouts, churn, and cash crunches weeks before they happen." },
  { k: "Recommend", d: "Boardroom-grade advice, grounded in your live numbers and your history." },
  { k: "Remember", d: "A permanent second brain that makes every answer sharper over time." },
  { k: "Execute", d: "Drafts POs, invoices, reminders, emails, reports — you just approve." },
];

const DOMAINS: { n: string; name: string; blurb: string; tools: string[] }[] = [
  { n: "01", name: "Cortex Workforce", blurb: "A complete AI org chart you can actually run — like hiring a whole team on day one.",
    tools: ["7 departments, one brain", "326 runnable text agents", "Sales → Back Office coverage", "Industry packs (e.g. jewellery sketch → spec)", "Ask Cortex and Deep Dive use your memory", "Audit engine marks a deploy-first roadmap", "Cortex builds custom agents for you", "Image agents via your Gemini key"] },
  { n: "02", name: "Cortex Memory", blurb: "A living, permanent memory of your business that grounds every answer.",
    tools: ["Long-term business memory", "Grounds every AI response", "Knowledge graph of people, customers & vendors", "A self-updating company profile", "Extract memories from any pasted text", "Teach Cortex from your real data", "Export your memory anytime (JSON / Markdown)"] },
  { n: "03", name: "Finance & Money", blurb: "A CFO-grade financial cockpit, tuned for Indian businesses.",
    tools: ["Business Health Dashboard", "P&L Builder", "13-Week Cash Flow", "Cash Runway & Burn", "Cash Conversion Cycle", "Receivables & Payables", "Unit Economics", "Funding, EMI & DSCR", "Net Worth & Balance Sheet", "GST Invoicing, ITC & TDS", "Payroll, CTC & Appraisals", "Financial Ratios & Depreciation"] },
  { n: "04", name: "Strategy & Advisory", blurb: "A McKinsey-in-your-pocket that knows your numbers.",
    tools: ["Ask Cortex", "Strategy Consultant", "Forecasting & Scenarios", "Business Valuation", "AI Playbooks", "Decision Journal", "Board Deck Generator", "Investor Updates", "Industry Benchmarks", "Risk Radar"] },
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
  /*
    WAS: "Tally, Zoho, Odoo" / "HubSpot, Salesforce" / "WhatsApp, Slack,
    SendGrid" / "62 tools", in a list headed "Plugs into the tools you already
    run", with the four that genuinely sync buried in the middle of it.

    Four providers sync — Shopify, Razorpay, Stripe and Google Sheets
    (lib/sync/index.ts CONNECTORS). Zoho, Odoo, HubSpot, Salesforce, Slack,
    SendGrid and QuickBooks pull and push nothing. Listing them beside Razorpay
    made the whole list read as uniform, which is exactly how a reader is
    misled without a single false word being written.

    The split below is the honest shape of the thing, and it is still a good
    offer: four live syncs, the file formats Indian SMEs actually export, a
    working Tally bridge over the API, and a credential vault for the rest.
  */
  { n: "10", name: "Integrations", blurb: "Four live syncs, plus the files your accountant already sends you.",
    tools: ["Syncs: Shopify, Razorpay, Stripe, Google Sheets", "File import: Tally, Vyapar, Busy, any CSV", "Tally bridge via the public API", "Your own WhatsApp Business account", "Credential vault for 60+ other tools"] },
];

// The whole platform, grouped by the job it does for you. Moved from page.tsx.
const FEATURES: { label: string; items: { icon: any; name: string; d: string }[] }[] = [
  {
    label: "Understand your business",
    items: [
      { icon: LayoutDashboard, name: "Business Health Dashboard", d: "Every KPI on one page, with a live Cortex Score." },
      { icon: Landmark, name: "Bank Statement Intelligence", d: "Upload a statement → real cashflow, trends, recurring spend, runway." },
      { icon: ReceiptText, name: "GST Return Reader", d: "Turnover, tax split, ITC utilisation & net payable in seconds." },
      { icon: CalendarClock, name: "13-week Cash Flow", d: "Rolling runway you can model, seeded from your ledger." },
      { icon: Database, name: "Import & Data Explorer", d: "CSV or a shared Google Sheet — then query it all." },
      { icon: Gauge, name: "Benchmarks & Risk Radar", d: "See where you stand and what threatens you." },
    ],
  },
  {
    label: "Think & decide",
    items: [
      { icon: MessageSquare, name: "Ask Cortex", d: "Ask about your own rows — it looks them up, in English or Hinglish." },
      { icon: Telescope, name: "Cortex Deep Dive", d: "Diagnose → decide → draft the first action, in three passes." },
      { icon: LineChart, name: "Forecasting & Scenarios", d: "90-day forecast with interactive what-ifs." },
      { icon: Brain, name: "Strategy Consultant", d: "SWOT, growth levers and a prioritised plan." },
      { icon: FileBarChart, name: "Executive Reports", d: "Board-ready reviews you can print or save as PDF." },
      { icon: Calculator, name: "28 Business Calculators", d: "Margins, GST, payroll, valuation, ratios & more." },
    ],
  },
  {
    label: "Act & automate",
    items: [
      { icon: Megaphone, name: "AI Outreach", d: "Drafts reminders & follow-ups; you approve, it sends." },
      { icon: Sparkles, name: "Marketing Studio", d: "Full campaign kits — copy, posts and emails in one click." },
      { icon: Bot, name: "438 AI Agents", d: "A 7-department AI workforce across 27 Indian industries." },
      { icon: Workflow, name: "Workflows & Approvals", d: "Automate the busywork with a human in the loop." },
      { icon: Radio, name: "WhatsApp Broadcast", d: "Personalised messages, ready for you to send." },
      /*
        "briefs you each morning" is true today and becomes false as this
        succeeds: the nightly sweep analyses ANALYSIS_CAP = 20 workspaces,
        rotated, so at 100 paying workspaces "daily" is every fifth day. The
        cron already computes nights_for_full_cycle and nothing acts on it.
        Worded so it stays true either way.
      */
      { icon: Cpu, name: "AI Autopilot", d: "Runs a nightly sweep and writes up what changed." },
    ],
  },
  {
    label: "Grow & get found",
    items: [
      { icon: Radar, name: "AI Visibility (AEO)", d: "See whether Gemini recommends you — and fix it." },
      { icon: KanbanSquare, name: "Pipeline + Lead Scoring", d: "A scored pipeline that tells you who to chase." },
      { icon: UserMinus, name: "Churn Predictor", d: "Spot at-risk customers before they leave." },
      { icon: BadgeIndianRupee, name: "Pricing Optimizer", d: "Find the price your market will bear." },
      { icon: Target, name: "Sales Targets & Funnel", d: "Plan targets and fix the leaky funnel." },
      { icon: Gem, name: "LTV & Segments", d: "Know your best customers and their lifetime value." },
    ],
  },
  {
    label: "Remember & run the back office",
    items: [
      { icon: BrainCircuit, name: "Cortex Memory", d: "A permanent second brain that sharpens every answer." },
      { icon: Receipt, name: "GST & Compliance", d: "Filing calendar, ITC set-off and GST invoicing." },
      { icon: Banknote, name: "Payroll & CTC", d: "Take-home, EPF/ESI, gratuity and appraisals." },
      { icon: ScrollText, name: "Contract Review", d: "AI reads a contract and flags the real risks." },
      { icon: Plug, name: "Public API + 4 live syncs", d: "Shopify, Razorpay, Stripe, Sheets — plus Tally & Vyapar file imports." },
      { icon: ShieldCheck, name: "Security & RLS", d: "Row-level isolation, encryption, export anytime." },
    ],
  },
];

/*
  EIGHT, NOT FOUR — and the last one is a channel, not a vertical.

  The old list was four generic buckets ending in "Founders & CXOs", which is
  not an industry and tells a distributor nothing. A clinic has receivables and
  a statutory calendar and no reorder point; a distributor has all three.
  Saying so is more convincing than saying "any business".
*/
const AUDIENCE = [
  { t: "Manufacturers", d: "Receivables, the MSME clock on supplier bills, stock cover and margin per line." },
  { t: "D2C & retail", d: "Reorder before the shelf empties, who is drifting away, and what discounting is costing." },
  { t: "Distribution & wholesale", d: "Ageing debtors across hundreds of accounts, ranked by who to call first." },
  { t: "Services & agencies", d: "Project profitability, the invoices nobody chased, and the Monday plan." },
  { t: "Clinics & healthcare", d: "Collections without awkward phone calls, and every statutory date that applies." },
  { t: "Construction & contracting", d: "Retention and running bills that age quietly, plus the 45-day MSME exposure." },
  { t: "SaaS & subscriptions", d: "Churn signals, renewals, and revenue that leaks a month before you notice." },
  { t: "CA & consulting firms", d: "One console across every client workspace, ranked by who needs you this week. A firm is a channel to its clients, not a different product." },
];

const COMPARE: [string, string, string, string, string][] = [
  ["Reads all your business data", "y", "~", "~", "n"],
  ["Diagnoses problems", "y", "n", "n", "~"],
  ["Predicts outcomes", "y", "n", "n", "n"],
  ["Recommends actions", "y", "n", "n", "~"],
  ["Executes tasks for you", "y", "n", "n", "n"],
  ["Remembers your business", "y", "~", "~", "n"],
  ["Plain-language answers", "y", "n", "n", "y"],
];

const mark = (v: string) =>
  /*
    A glyph with no text alternative is nothing to a screen reader — this table
    is the competitive-positioning grid a procurement reviewer lands on, and it
    read as rows of empty cells. The sr-only word carries the meaning; the glyph
    stays for everyone else. WCAG 1.1.1, 1.4.1.
  */
  v === "y" ? <span className="text-primary"><span className="sr-only">Yes</span><span aria-hidden="true">●</span></span>
    : v === "~" ? <span className="text-warning"><span className="sr-only">Partly</span><span aria-hidden="true">◐</span></span>
    : <span className="text-muted-foreground"><span className="sr-only">No</span><span aria-hidden="true">○</span></span>;

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
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>Get started <ArrowUpRight className="h-4 w-4" /></Link>
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

      {/* Everything you get — the thirty-card grid, moved off the homepage. */}
      <section id="everything" className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="03">Everything you get</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 max-w-3xl">You&rsquo;ll use five of these. The rest are there when you need them.</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl leading-7">
            Nothing here needs setting up and nothing needs learning — they read the same numbers you already
            sent. Most owners live in three or four screens and never open the rest.
          </p>
          <div className="mt-14 space-y-14">
            {FEATURES.map((g) => (
              <div key={g.label}>
                <h3 className="font-display text-xl lg:text-2xl tracking-tightest mb-5 flex items-center gap-3"><span className="h-px w-8 bg-primary" />{g.label}</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border rounded-2xl overflow-hidden">
                  {g.items.map((f) => {
                    const Icon = f.icon;
                    return (
                      <div key={f.name} className="bg-card p-6 hover:bg-accent/40 transition-colors">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center"><Icon className="h-5 w-5 text-primary" /></div>
                        <div className="mt-3 font-semibold">{f.name}</div>
                        <p className="text-sm text-muted-foreground mt-1.5">{f.d}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for — moved off the homepage. */}
      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="04">Who it&rsquo;s for</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 mb-10 max-w-3xl">The same engine, pointed at a different problem.</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border rounded-2xl overflow-hidden">
            {AUDIENCE.map((a) => (
              <div key={a.t} className="bg-card p-7 hover:bg-accent/40 transition-colors">
                <div className="font-display text-2xl tracking-tightest">{a.t}</div>
                <p className="text-sm text-muted-foreground mt-3">{a.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why not an ERP, CRM or ChatGPT — moved off the homepage. */}
      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-5xl mx-auto">
          <SectionLabel n="05">Why not an ERP, CRM or ChatGPT?</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 mb-10 max-w-2xl">Those store or chat. Cortex acts on your data.</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-normal text-muted-foreground py-4"></th>
                  <th className="py-4 px-3 font-semibold text-primary">Cortex</th>
                  <th className="py-4 px-3 font-normal text-muted-foreground">ERP</th>
                  <th className="py-4 px-3 font-normal text-muted-foreground">CRM</th>
                  <th className="py-4 px-3 font-normal text-muted-foreground">ChatGPT</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r[0]} className="border-b border-border/60">
                    <td className="py-4 pr-3 font-medium">{r[0]}</td>
                    {r.slice(1).map((cell, j) => <td key={j} className="py-4 px-3 text-center text-lg">{mark(cell)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="px-5 lg:px-10 py-24 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="06">Security &amp; trust</SectionLabel>
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
