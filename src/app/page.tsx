import Link from "next/link";
import {
  ArrowUpRight, ArrowRight, LayoutDashboard, Landmark, ReceiptText, CalendarClock, Database, Gauge,
  MessageSquare, Telescope, LineChart, Brain, FileBarChart, Calculator,
  Megaphone, Sparkles, Bot, Workflow, Radio, Cpu,
  Radar, KanbanSquare, UserMinus, BadgeIndianRupee, Target, Gem,
  BrainCircuit, Receipt, Banknote, ScrollText, Plug, ShieldCheck,
} from "lucide-react";
import { RoiCalculator } from "@/components/roi-calculator";
import { Reveal, CountUp, RotatingWord } from "@/components/landing-extras";
import { SmoothScroll, Cursor, Kinetic, SectionLabel, Marquee, Magnetic, Faq } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { ProductPreview } from "@/components/product-preview";
import { AskCortexDemo } from "@/components/demo";
import { IndustryPicker } from "@/components/industry-picker";

const FAQS = [
  { q: "How is this different from an ERP or CRM?", a: "ERPs and CRMs store data. MNB Cortex reads across all of it, diagnoses problems, predicts what's coming, recommends actions, and executes the busywork — like a COO, not a filing cabinet." },
  { q: "Is my data safe?", a: "Yes. Every workspace is isolated with Postgres row-level security, traffic is encrypted with TLS, sensitive keys use AES-256-GCM, and you can export or delete your data anytime." },
  { q: "Do I need to be technical?", a: "No. You ask questions in plain language (English or Hinglish), load a demo dataset or connect your tools, and Cortex does the analysis and drafting for you." },
  { q: "Which businesses is it built for?", a: "Indian SMEs — manufacturers, D2C and retail brands, services and agencies, and founders who want a COO-grade brain without a COO-grade salary." },
  { q: "How does billing work?", a: "Start with a free 3-day trial (no card). Then pick a plan from ₹799/mo, billed securely via Cashfree. Prices are shown in INR and USD; international customers are onboarded by our team." },
];

const STATS = [
  { to: 130, suffix: "+", label: "modules & tools" },
  { to: 300, suffix: "+", label: "runnable AI agents" },
  { to: 62, suffix: "", label: "integrations" },
  { to: 24, suffix: "/7", label: "live monitoring" },
];

// Problem-specific: the day-to-day reality of running an SME, and how Cortex changes it.
const OLD_NEW = [
  { old: "You find out about a cash crunch when the bank balance drops.", now: "Cortex forecasts the crunch weeks ahead and tells you exactly what to fix." },
  { old: "Your numbers live in Tally, spreadsheets, WhatsApp and your head.", now: "One brain reads all of it and answers in plain language — instantly." },
  { old: "You react to stockouts, overdue invoices and churn after they cost you.", now: "It predicts them early and drafts the PO, the reminder or the save-play." },
  { old: "Consultants are slow and pricey; ChatGPT doesn't know your business.", now: "A COO-grade brain that knows your real numbers, on tap, 24/7." },
  { old: "You're too busy running the business to actually analyse it.", now: "Autopilot watches your data daily and briefs you every morning." },
  { old: "Nobody finds you when buyers ask ChatGPT for a recommendation.", now: "AI Visibility gets your business named by ChatGPT, Gemini & Perplexity." },
];

// The whole platform, grouped by the job it does for you.
const FEATURES: { label: string; items: { icon: any; name: string; d: string }[] }[] = [
  {
    label: "Understand your business",
    items: [
      { icon: LayoutDashboard, name: "Business Health Dashboard", d: "Every KPI on one page, with a live Cortex Score." },
      { icon: Landmark, name: "Bank Statement Intelligence", d: "Upload a statement → real cashflow, trends, recurring spend, runway." },
      { icon: ReceiptText, name: "GST Return Reader", d: "Turnover, tax split, ITC utilisation & net payable in seconds." },
      { icon: CalendarClock, name: "13-week Cash Flow", d: "Rolling runway with an out-of-cash early warning." },
      { icon: Database, name: "Import & Data Explorer", d: "CSV, Excel or Google Sheets — then query it all." },
      { icon: Gauge, name: "Benchmarks & Risk Radar", d: "See where you stand and what threatens you." },
    ],
  },
  {
    label: "Think & decide",
    items: [
      { icon: MessageSquare, name: "AI CEO Chat", d: "Ask anything in English or Hinglish, grounded in your data." },
      { icon: Telescope, name: "Cortex Deep Dive", d: "Diagnose → decide → draft the first action, in three passes." },
      { icon: LineChart, name: "Forecasting & Scenarios", d: "90-day forecast with interactive what-ifs." },
      { icon: Brain, name: "Strategy Consultant", d: "SWOT, growth levers and a prioritised plan." },
      { icon: FileBarChart, name: "Executive Reports", d: "Board-ready reviews, exportable to PDF." },
      { icon: Calculator, name: "50+ Business Calculators", d: "Margins, GST, payroll, valuation, ratios & more." },
    ],
  },
  {
    label: "Act & automate",
    items: [
      { icon: Megaphone, name: "AI Outreach", d: "Drafts reminders & follow-ups; you approve, it sends." },
      { icon: Sparkles, name: "Marketing Studio", d: "Full campaign kits — copy, posts and emails in one click." },
      { icon: Bot, name: "380+ AI Agents", d: "A 7-department AI workforce across 25 Indian industries." },
      { icon: Workflow, name: "Workflows & Approvals", d: "Automate the busywork with a human in the loop." },
      { icon: Radio, name: "WhatsApp Broadcast", d: "Personalised broadcasts, ready to send." },
      { icon: Cpu, name: "AI Autopilot", d: "Runs a daily analysis and briefs you each morning." },
    ],
  },
  {
    label: "Grow & get found",
    items: [
      { icon: Radar, name: "AI Visibility (AEO)", d: "See if ChatGPT & Gemini recommend you — and fix it." },
      { icon: KanbanSquare, name: "Pipeline + Lead Scoring", d: "An AI-ranked pipeline that tells you who to chase." },
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
      { icon: Plug, name: "62 Integrations + API", d: "Tally, Zoho, Razorpay, Shopify and more." },
      { icon: ShieldCheck, name: "Security & RLS", d: "Row-level isolation, encryption, export anytime." },
    ],
  },
];

const CAPS = [
  { n: "01", name: "Cortex Workforce", blurb: "A 7-department AI org chart — 290+ runnable agents." },
  { n: "02", name: "Cortex Memory", blurb: "A permanent second brain that grounds every answer." },
  { n: "03", name: "Finance & Money", blurb: "Dashboards, cash flow, GST, payroll, ratios." },
  { n: "04", name: "Strategy & Advisory", blurb: "AI CEO chat, forecasts, board decks, playbooks." },
  { n: "05", name: "Sales & Growth", blurb: "Pipeline, lead scoring, churn, pricing, LTV." },
  { n: "06", name: "People & Operations", blurb: "Hiring, capacity, reorder, SOPs, approvals." },
  { n: "07", name: "Legal & Compliance", blurb: "GST, contracts, compliance calendar, documents." },
  { n: "08", name: "Communications", blurb: "Email, WhatsApp, daily brief, meeting notes." },
  { n: "09", name: "Automation", blurb: "Autopilot, scheduled reports, API & webhooks." },
  { n: "10", name: "Integrations", blurb: "Tally, Zoho, Razorpay, Shopify + 62 tools." },
];

const LOOP = [
  { k: "Monitors", d: "Reads sales, finance, inventory, production & HR in real time." },
  { k: "Predicts", d: "Forecasts stockouts, churn and cash crunches before they hit." },
  { k: "Recommends", d: "Boardroom-grade advice, grounded in your live numbers." },
  { k: "Remembers", d: "A permanent memory that sharpens every answer over time." },
  { k: "Executes", d: "Drafts POs, invoices, reminders, emails and reports for you." },
];

const AUDIENCE = [
  { t: "Manufacturers", d: "Stock-outs, margins, production and receivables — watched daily." },
  { t: "D2C & retail", d: "Funnels, CAC, inventory and pricing in one place." },
  { t: "Services & agencies", d: "Project profitability, capacity and proposals." },
  { t: "Founders & CXOs", d: "A COO-grade brain for every decision, at a fraction of the cost." },
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

const TESTI = [
  { q: "I finally stopped living in spreadsheets. I just ask.", n: "Manufacturing owner" },
  { q: "It caught a stockout nine days early and drafted the PO.", n: "Distributor" },
  { q: "Feels like having a COO I can actually afford.", n: "D2C founder" },
];

const MOATS = [
  { n: "01", name: "A memory that compounds", claim: "Every workspace builds its own permanent brain — decisions, numbers, context, preferences — that gets sharper every single day. A rival starting today starts from zero for each customer; your Cortex only deepens. The data moat is private, per-customer, and grows on its own." },
  { n: "02", name: "One brain, not 130 point tools", claim: "Finance, sales, ops and 380+ agents all reason over the same memory and your live data, so the whole company thinks together. You can bolt a chatbot onto a dashboard — you can't retrofit a unified operating brain." },
  { n: "03", name: "It acts, not just answers", claim: "Cortex reads your real bank statements and GST returns, drafts the reminder, PO or plan, and — with one approval — sends it. Advice is a commodity. A system that closes the loop across every function is not." },
  { n: "04", name: "Vertical depth × the AI-search era", claim: "Tuned to 25 Indian industries and built to get you recommended by ChatGPT, Gemini and Perplexity. Generic tools can't match the depth, and latecomers can't catch a head start that compounds." },
];

const mark = (v: string) =>
  v === "y" ? <span className="text-primary">●</span> : v === "~" ? <span className="text-warning">◐</span> : <span className="text-muted-foreground/40">○</span>;

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      {/* ---------- HERO ---------- */}
      <section className="relative px-5 lg:px-10 pt-32 lg:pt-44 pb-20 overflow-hidden">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="aurora opacity-60" aria-hidden />
        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="eyebrow flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            The AI operating brain for your business — by MNB Research
          </div>
          <Kinetic
            as="h1"
            text={"Your business now has\na brain of its own."}
            className="font-display display-1 tracking-tightest mt-6"
          />
          <div className="mt-6 grid lg:grid-cols-[1.3fr_1fr] gap-8 items-end">
            <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl">
              Your numbers are scattered across Tally, spreadsheets and WhatsApp — and the things that matter, you spot too late.
              MNB Cortex is <span className="text-foreground font-medium">one AI brain</span> that reads all of it, remembers every decision,
              predicts what&rsquo;s coming and does the busywork. Ask <span className="text-foreground font-medium">&ldquo;How is my business?&rdquo;</span> and it already knows.
            </p>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <Magnetic>
                <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>
                  Start free — 3-day trial <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Magnetic>
              <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">
                View live demo <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span>One brain, working as your <RotatingWord words={["AI COO.", "AI CFO.", "AI CMO.", "AI analyst."]} /></span>
            <Link href="/health-check" className="inline-flex items-center gap-1.5 text-foreground font-medium link-sweep">Take the free 60-second health check <ArrowUpRight className="h-4 w-4" /></Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-muted-foreground">
            <span>★ Shark Tank India featured</span>
            <span>◆ DPIIT-recognised startup</span>
            <span>◇ 10,000+ businesses served</span>
          </div>
        </div>
      </section>

      {/* ---------- LIVE DEMO + PRODUCT PREVIEW ---------- */}
      <section className="px-5 lg:px-10 pb-16 -mt-4">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-5 items-stretch">
          <Reveal><AskCortexDemo /></Reveal>
          <Reveal delay={120}><ProductPreview /></Reveal>
        </div>
      </section>

      {/* ---------- MARQUEE ---------- */}
      <section className="py-6 border-y bg-secondary/30 font-display text-2xl lg:text-3xl tracking-tightest">
        <Marquee items={["Tally", "Zoho", "Odoo", "Razorpay", "Stripe", "Shopify", "HubSpot", "Salesforce", "WhatsApp", "Slack", "SendGrid", "QuickBooks", "Google Sheets", "Cashfree", "Freshdesk", "Calendly"]} />
      </section>

      {/* ---------- THE PROBLEM ---------- */}
      <section className="px-5 lg:px-10 py-24 lg:py-32">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="01">The problem</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">Running an SME shouldn&rsquo;t mean flying blind.</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl">You&rsquo;re the CEO, CFO, head of sales and firefighter — all at once. Cortex takes the analysis and the busywork off your plate.</p>
          <div className="mt-12 grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden">
            {OLD_NEW.map((r, i) => (
              <div key={i} className="contents">
                <div className="bg-card p-6 flex gap-3">
                  <span className="text-danger mt-0.5 shrink-0" aria-hidden>✕</span>
                  <div><div className="eyebrow">Today</div><p className="mt-1 text-sm lg:text-base">{r.old}</p></div>
                </div>
                <div className="bg-primary/[0.04] p-6 flex gap-3">
                  <span className="text-primary mt-0.5 shrink-0" aria-hidden>✓</span>
                  <div><div className="eyebrow text-primary">With Cortex</div><p className="mt-1 text-sm lg:text-base">{r.now}</p></div>
                </div>
              </div>
            ))}
          </div>

          {/* Industry-specific: pick your industry → your pains + the tools that fix them */}
          <div className="mt-16">
            <h3 className="font-display text-2xl lg:text-4xl tracking-tightest max-w-2xl">Now see it for <span className="text-primary">your</span> industry.</h3>
            <p className="mt-3 text-muted-foreground max-w-2xl">Cortex speaks your business — not generic dashboards. Pick yours and see the exact problems it watches and the tools it uses to fix them.</p>
            <div className="mt-8"><IndustryPicker /></div>
          </div>
        </div>
      </section>

      {/* ---------- STATEMENT ---------- */}
      <section className="px-5 lg:px-10 pb-24 lg:pb-32 border-t pt-24 lg:pt-32">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="02">What it is</SectionLabel>
          <Reveal>
            <p className="font-display display-3 tracking-tightest mt-8 max-w-5xl leading-[1.15]">
              Dashboards store numbers. Chatbots forget you. <span className="text-primary">MNB Cortex remembers — and acts.</span> One operating
              brain that monitors, predicts, recommends and executes across your whole company — and gets sharper every week you use it.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---------- THE MOAT ---------- */}
      <section className="px-5 lg:px-10 py-24 lg:py-32 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="◆">The moat</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">Anyone can wrap an AI. <span className="text-primary">This can&rsquo;t be copied.</span></h2>
          <p className="mt-4 text-muted-foreground max-w-2xl">The advantage compounds with every day you use it — and can&rsquo;t be bolted on after the fact.</p>
          <div className="mt-12 grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden">
            {MOATS.map((m) => (
              <div key={m.n} className="bg-card p-7 lg:p-8 hover:bg-accent/30 transition-colors">
                <div className="font-display text-4xl tracking-tightest text-primary">{m.n}</div>
                <div className="mt-3 font-semibold text-lg">{m.name}</div>
                <p className="mt-2 text-sm text-muted-foreground leading-6">{m.claim}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- PROOF ---------- */}
      <section className="px-5 lg:px-10 pb-8">
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border rounded-2xl overflow-hidden">
          {[
            { k: "Built by", v: "MNB Research", d: "India's business growth & consultancy specialists" },
            { k: "Featured on", v: "Shark Tank India", d: "and 160+ press outlets, 60M+ reach" },
            { k: "Recognised", v: "DPIIT startup", d: "Government of India recognised" },
            { k: "From the makers of", v: "AbroBot", d: "India's AI study-abroad platform" },
          ].map((p) => (
            <div key={p.v} className="bg-card p-6">
              <div className="eyebrow">{p.k}</div>
              <div className="font-display text-2xl tracking-tightest mt-2">{p.v}</div>
              <p className="text-xs text-muted-foreground mt-1.5">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- STATS ---------- */}
      <section className="px-5 lg:px-10 pb-24">
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 80}>
              <div className={`py-8 lg:py-10 px-2 ${i !== 0 ? "lg:border-l" : ""} border-border`}>
                <div className="font-display text-5xl lg:text-7xl tracking-tightest tabular-nums"><CountUp to={s.to} suffix={s.suffix} /></div>
                <div className="text-sm text-muted-foreground mt-3">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- EVERYTHING YOU GET (full feature showcase) ---------- */}
      <section id="features" className="px-5 lg:px-10 py-24 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="03">Everything you get</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">Not one AI trick.<br />An operating system for your business.</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl">120+ modules, 380+ agents and a permanent memory — organised into the jobs you actually need done. Here&rsquo;s the whole thing.</p>

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

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/features" className="inline-flex items-center gap-1.5 text-sm font-medium link-sweep">See the full feature list <ArrowUpRight className="h-4 w-4" /></Link>
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary link-sweep">Try it free <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      {/* ---------- CAPABILITIES (hover-reveal list) ---------- */}
      <section id="capabilities" className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
            <div>
              <SectionLabel n="04">Ten domains, one login</SectionLabel>
              <h2 className="font-display display-2 tracking-tightest mt-5 max-w-2xl">One login.<br />Your whole company.</h2>
            </div>
            <div className="max-w-sm">
              <p className="text-muted-foreground">Every domain is grounded in a permanent memory of your business, and built for Indian SMEs.</p>
              <Link href="/features" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium link-sweep">See the full feature list <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </div>

          <div>
            {CAPS.map((c) => (
              <Link key={c.n} href="/login" className="reveal-row block" data-cursor>
                <span className="fill" aria-hidden />
                <div className="row-inner flex items-baseline gap-4 lg:gap-8 py-6 lg:py-8">
                  <span className="row-meta text-sm tabular-nums text-muted-foreground w-8 shrink-0">{c.n}</span>
                  <span className="font-display text-3xl lg:text-6xl tracking-tightest flex-1 min-w-0">{c.name}</span>
                  <span className="row-meta hidden md:block text-sm text-muted-foreground max-w-xs text-right">{c.blurb}</span>
                  <ArrowUpRight className="row-arrow h-6 w-6 lg:h-8 lg:w-8 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- THE LOOP ---------- */}
      <section className="px-5 lg:px-10 py-24 lg:py-32">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="05">How it works</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 mb-14 max-w-3xl">It doesn&rsquo;t just report. It runs the loop.</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-px bg-border rounded-2xl overflow-hidden border">
            {LOOP.map((x, i) => (
              <Reveal key={x.k} delay={i * 70} className="bg-card">
                <div className="p-6 h-full hover:bg-accent/40 transition-colors">
                  <div className="font-display text-4xl tracking-tightest text-primary">{String(i + 1).padStart(2, "0")}</div>
                  <div className="mt-4 font-semibold text-lg">{x.k}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{x.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- AUDIENCE ---------- */}
      <section className="px-5 lg:px-10 pb-24">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="06">Who it&rsquo;s for</SectionLabel>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border rounded-2xl overflow-hidden">
            {AUDIENCE.map((a) => (
              <div key={a.t} className="bg-card p-7 hover:bg-accent/40 transition-colors">
                <div className="font-display text-2xl tracking-tightest">{a.t}</div>
                <p className="text-sm text-muted-foreground mt-3">{a.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- COMPARISON ---------- */}
      <section className="px-5 lg:px-10 py-24 border-t">
        <div className="max-w-5xl mx-auto">
          <SectionLabel n="07">Why not an ERP, CRM or ChatGPT?</SectionLabel>
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

      {/* ---------- ROI ---------- */}
      <section className="px-5 lg:px-10 py-24">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="08">The math</SectionLabel>
          <div className="mt-8"><Reveal><RoiCalculator /></Reveal></div>
        </div>
      </section>

      {/* ---------- TESTIMONIALS ---------- */}
      <section className="px-5 lg:px-10 py-24 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="09">In the field</SectionLabel>
          <div className="mt-12 grid md:grid-cols-3 gap-10">
            {TESTI.map((t, i) => (
              <Reveal key={i} delay={i * 90}>
                <figure>
                  <blockquote className="font-display text-2xl lg:text-3xl tracking-tightest leading-tight">&ldquo;{t.q}&rdquo;</blockquote>
                  <figcaption className="mt-5 text-sm text-muted-foreground">— {t.n}</figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="px-5 lg:px-10 py-24 border-t">
        <div className="max-w-3xl mx-auto">
          <SectionLabel n="10">Questions</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 mb-10">Good to know.</h2>
          <Faq items={FAQS} />
        </div>
      </section>

      {/* ---------- FINAL CTA ---------- */}
      <section className="px-5 lg:px-10 py-28 border-t text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display display-2 tracking-tightest">Give your business a brain.</h2>
          <p className="mt-5 text-muted-foreground text-lg">Start free in under a minute — no card. Load a demo dataset or connect your own, and ask Cortex how your business is really doing.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Magnetic>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>
                Start free — 3-day trial <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Magnetic>
            <Link href="/pricing" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">
              See pricing <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
