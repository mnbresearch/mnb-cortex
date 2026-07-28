import Link from "next/link";
import {
  ArrowRight, Eye, TrendingUp, Brain, Zap, CheckCircle2, Sparkles, ShieldCheck,
  Wallet, Users, Scale, Mail, Workflow, Plug, Star, Lock, Rocket, BrainCircuit
} from "lucide-react";
import { RoiCalculator } from "@/components/roi-calculator";
import { Logo } from "@/components/logo";
import { Reveal, CountUp, RotatingWord } from "@/components/landing-extras";

const STATS = [
  { to: 100, suffix: "+", label: "modules & tools" },
  { to: 31, suffix: "", label: "AI reasoning modes" },
  { to: 62, suffix: "", label: "integrations" },
  { to: 24, suffix: "/7", label: "live monitoring" },
];

const PILLARS = [
  { i: Eye, t: "Monitors", d: "Reads sales, finance, inventory, production & HR in real time." },
  { i: TrendingUp, t: "Predicts", d: "Forecasts stockouts, churn and cash crunches before they hit." },
  { i: Brain, t: "Recommends", d: "McKinsey-grade advice, grounded in your live numbers." },
  { i: BrainCircuit, t: "Remembers", d: "A permanent memory of your business that sharpens every answer over time." },
  { i: Zap, t: "Executes", d: "Drafts POs, invoices, reminders, emails and reports for you." },
];

const CATEGORIES = [
  { icon: BrainCircuit, name: "Cortex Memory", items: ["Long-term business memory", "Grounds every AI answer", "Knowledge graph of people & customers", "Living company profile", "Extract memories from any text", "Teach Cortex from your data", "Export your memory anytime"] },
  { icon: Wallet, name: "Finance & Money", items: ["Business Health Dashboard", "P&L Builder", "13-Week Cash Flow", "Cash Runway & Burn", "Cash Conversion Cycle", "Receivables & Payables", "Unit Economics", "Funding, EMI & DSCR", "Net Worth & Balance Sheet", "GST Invoicing, ITC & TDS", "Payroll, CTC & Appraisals", "Financial Ratios & Depreciation"] },
  { icon: Brain, name: "Strategy & Advisory", items: ["AI CEO Chat", "Strategy Consultant", "Forecasting & Scenarios", "Business Valuation", "AI Playbooks", "Decision Journal", "Board Deck Generator", "Investor Updates", "Benchmarks", "Risk Radar"] },
  { icon: TrendingUp, name: "Sales & Growth", items: ["Deals Pipeline", "AI Lead Scoring", "Sales Targets", "Marketing Funnel", "Ad Budget & ROAS", "Churn Predictor", "Customer LTV & RFM", "Pricing Optimizer", "Competitor Intel", "Marketing Studio"] },
  { icon: Users, name: "People & Operations", items: ["HR Analytics", "Hiring Advisor", "Team Capacity", "Reorder Optimizer", "Vendor Scorecard", "SOP Builder", "Workflows", "Approvals", "Action Board", "KPI Alerts"] },
  { icon: Scale, name: "Legal & Compliance", items: ["GST & Compliance", "Compliance Calendar", "Contract Review", "Document Intelligence"] },
  { icon: Mail, name: "Communications", items: ["Email Campaigns + tracking", "WhatsApp Broadcast", "Daily CEO Brief", "Meeting Assistant", "Negotiation Coach"] },
  { icon: Workflow, name: "Automation", items: ["AI Autopilot (daily)", "Scheduled reports", "Public API & Webhooks", "Data Explorer", "CSV / Sheets / PDF import"] },
  { icon: Plug, name: "Integrations", items: ["Tally, Zoho, Odoo", "Razorpay, Stripe, Shopify", "HubSpot, Salesforce", "WhatsApp, Slack, SendGrid", "62 tools + Custom API keys"] },
];

const AUDIENCE = [
  { t: "Manufacturers", d: "Stock-outs, margins, production and receivables — watched daily." },
  { t: "D2C & retail", d: "Funnels, CAC, inventory and pricing in one place." },
  { t: "Services & agencies", d: "Project profitability, capacity and proposals." },
  { t: "Founders & CXOs", d: "A COO-grade brain for every decision, at a fraction of the cost." },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 glass flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <div className="flex items-center gap-2.5"><Logo size={34} /><span className="font-semibold tracking-tight">MNB Cortex</span></div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="#features" className="hidden sm:inline text-muted-foreground hover:text-foreground">Features</Link>
          <Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
          <Link href="/login" className="rounded-lg brand-gradient text-white px-4 py-2 font-medium shadow-sm hover:opacity-90 transition-opacity">Sign in</Link>
        </div>
      </header>

      {/* Positioning + hero */}
      <section className="relative px-6 lg:px-12 pt-16 pb-16 lg:pt-24 overflow-hidden">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="aurora" aria-hidden />
        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full border bg-card/70 px-3 py-1 text-muted-foreground mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> The AI Operating System for Indian SMEs · by MNB Research
          </span>
          <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight leading-[1.04]">
            Your business, run by an <RotatingWord words={["AI COO.", "AI CFO.", "AI strategist.", "AI analyst."]} />
            <br className="hidden sm:block" /> Not another dashboard.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            MNB Cortex reads all your data, spots problems early, predicts what's coming, tells you exactly what to do — and does the busywork for you. Ask <span className="text-foreground font-medium">"How is my business?"</span> and get a real answer.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="rounded-lg brand-gradient text-white px-6 h-12 inline-flex items-center gap-2 font-medium shadow-md hover:opacity-90 transition-opacity">Start free — 14 days <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/dashboard" className="rounded-lg border px-6 h-12 inline-flex items-center gap-2 font-medium hover:bg-accent transition-colors"><Rocket className="h-4 w-4" /> View live demo</Link>
          </div>

          {/* Animated stats */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl border bg-card/60 p-4 glow-ring">
                <div className="text-3xl font-extrabold gradient-text tabular-nums"><CountUp to={s.to} suffix={s.suffix} /></div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-warning" /> Shark Tank India featured</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-success" /> DPIIT-recognised startup</span>
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-primary" /> 10,000+ businesses served</span>
          </div>
        </div>
      </section>

      {/* Integrations marquee */}
      <section className="pb-14 overflow-hidden">
        <p className="text-xs uppercase tracking-wider text-muted-foreground text-center mb-4">Connects with your stack</p>
        <div className="relative">
          <div className="flex gap-8 w-max marquee text-sm font-medium text-muted-foreground px-8">
            {[..."Tally Zoho Odoo Razorpay Stripe Shopify HubSpot Salesforce WhatsApp Slack SendGrid QuickBooks Google Sheets Cashfree Freshdesk Calendly".split(" "), ..."Tally Zoho Odoo Razorpay Stripe Shopify HubSpot Salesforce WhatsApp Slack SendGrid QuickBooks Google Sheets Cashfree Freshdesk Calendly".split(" ")].map((n, i) => (
              <span key={i} className="whitespace-nowrap">{n}</span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 lg:px-12 pb-16 max-w-5xl mx-auto">
        <Reveal><h2 className="text-2xl lg:text-3xl font-bold text-center mb-2">It doesn't just report. It runs the loop.</h2>
        <p className="text-center text-muted-foreground mb-10">Monitor → Predict → Recommend → Remember → Execute, continuously.</p></Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {PILLARS.map((x, i) => (
            <Reveal key={x.t} delay={i * 90}>
              <div className="hover-lift rounded-xl border p-5 bg-card h-full">
                <div className="h-11 w-11 rounded-xl brand-gradient grid place-items-center text-white animate-float"><x.i className="h-5 w-5" /></div>
                <h3 className="mt-3 font-semibold">{x.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{x.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Everything inside — full feature list */}
      <section id="features" className="px-6 lg:px-12 py-16 bg-secondary/30 border-y">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-10">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full border bg-card px-3 py-1 text-primary mb-3"><Sparkles className="h-3.5 w-3.5" /> Everything inside</span>
              <h2 className="text-2xl lg:text-3xl font-bold">One login. Your whole company.</h2>
              <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">100+ tools across memory, finance, strategy, sales, people, legal and operations — each one AI-native, grounded in a permanent memory of your business, and built for Indian SMEs.</p>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CATEGORIES.map((c, i) => (
              <Reveal key={c.name} delay={(i % 4) * 80}>
                <div className="hover-lift rounded-xl border bg-card p-5 h-full">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg brand-gradient grid place-items-center text-white"><c.icon className="h-4 w-4" /></div>
                    <h3 className="font-semibold text-sm">{c.name}</h3>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {c.items.map((it) => (
                      <li key={it} className="text-sm text-muted-foreground flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" /> {it}</li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="px-6 lg:px-12 py-16 max-w-5xl mx-auto">
        <Reveal><h2 className="text-2xl lg:text-3xl font-bold text-center mb-10">Built for how you actually run a business</h2></Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AUDIENCE.map((a, i) => (
            <Reveal key={a.t} delay={i * 80}>
              <div className="rounded-xl border bg-card p-5 h-full hover-lift">
                <div className="font-semibold">{a.t}</div>
                <p className="text-sm text-muted-foreground mt-1">{a.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="px-6 lg:px-12 pb-16 max-w-4xl mx-auto">
        <Reveal>
          <h2 className="text-2xl lg:text-3xl font-bold text-center mb-2">Why not just an ERP, CRM or ChatGPT?</h2>
          <p className="text-center text-muted-foreground mb-8">Those store or chat. MNB Cortex is an AI COO — it acts on your data.</p>
          <div className="overflow-x-auto rounded-xl border bg-card glow-ring">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="p-3"></th><th className="p-3 text-primary font-semibold">MNB Cortex</th><th className="p-3 text-muted-foreground">ERP</th><th className="p-3 text-muted-foreground">CRM</th><th className="p-3 text-muted-foreground">ChatGPT</th></tr></thead>
              <tbody>
                {[["Reads all your business data", "yes", "part", "part", "no"], ["Diagnoses problems", "yes", "no", "no", "part"], ["Predicts outcomes", "yes", "no", "no", "no"], ["Recommends actions", "yes", "no", "no", "part"], ["Executes tasks for you", "yes", "no", "no", "no"], ["Plain-language answers", "yes", "no", "no", "yes"]].map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="p-3 font-medium">{r[0]}</td>
                    {r.slice(1).map((c, j) => (<td key={j} className="p-3">{c === "yes" ? <span className="text-success">✓</span> : c === "part" ? <span className="text-warning">~</span> : <span className="text-muted-foreground">✕</span>}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>

      {/* ROI calculator */}
      <section className="px-6 lg:px-12 pb-16"><Reveal><RoiCalculator /></Reveal></section>

      {/* Testimonials */}
      <section className="px-6 lg:px-12 pb-16 max-w-5xl mx-auto">
        <Reveal><h2 className="text-2xl lg:text-3xl font-bold text-center mb-8">Owners who stopped living in spreadsheets</h2></Reveal>
        <div className="grid sm:grid-cols-3 gap-4">
          {[{ q: "I finally stopped living in spreadsheets. I just ask.", n: "Manufacturing owner" }, { q: "It caught a stockout 9 days early and drafted the PO.", n: "Distributor" }, { q: "Feels like having a COO I can actually afford.", n: "D2C founder" }].map((t, i) => (
            <Reveal key={i} delay={i * 90}>
              <div className="rounded-xl border p-5 bg-card h-full hover-lift">
                <div className="flex gap-0.5">{Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-4 w-4 text-warning fill-warning" />)}</div>
                <p className="mt-3 text-sm">“{t.q}”</p><p className="mt-2 text-xs text-muted-foreground">— {t.n}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 lg:px-12 pb-20">
        <div className="relative max-w-4xl mx-auto rounded-2xl border overflow-hidden text-center p-10 lg:p-14">
          <div className="aurora" aria-hidden />
          <div className="relative z-10">
            <h2 className="text-2xl lg:text-4xl font-extrabold">Run your company by asking.</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">Set up in minutes. Load a demo dataset or connect your tools. Your AI COO is ready today.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" className="rounded-lg brand-gradient text-white px-6 h-12 inline-flex items-center gap-2 font-medium shadow-md hover:opacity-90 transition-opacity">Start free — 14 days <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/pricing" className="rounded-lg border px-6 h-12 inline-flex items-center font-medium hover:bg-accent transition-colors">See pricing</Link>
            </div>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Encrypted · RLS-isolated · no card required to start</div>
          </div>
        </div>
      </section>

      <footer className="px-6 lg:px-12 py-8 border-t text-sm text-muted-foreground flex flex-wrap gap-4 justify-center">
        <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
        <Link href="/status" className="hover:text-foreground">System status</Link>
        <Link href="/changelog" className="hover:text-foreground">Changelog</Link>
        <Link href="/help" className="hover:text-foreground">Help</Link>
        <Link href="/login" className="hover:text-foreground">Sign in</Link>
        <span>© 2026 MNB Cortex · a brand of Abrobot Technologies Pvt Ltd</span>
      </footer>
    </main>
  );
}
