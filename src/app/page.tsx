import Link from "next/link";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { RoiCalculator } from "@/components/roi-calculator";
import { Reveal, CountUp, RotatingWord } from "@/components/landing-extras";
import { SmoothScroll, Cursor, Kinetic, SectionLabel, Marquee, Magnetic } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";

const STATS = [
  { to: 100, suffix: "+", label: "modules & tools" },
  { to: 300, suffix: "+", label: "runnable AI agents" },
  { to: 62, suffix: "", label: "integrations" },
  { to: 24, suffix: "/7", label: "live monitoring" },
];

const CAPS = [
  { n: "01", name: "Cortex Workforce", blurb: "A 7-department AI org chart — 250+ runnable agents." },
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
  ["Plain-language answers", "y", "n", "n", "y"],
];

const TESTI = [
  { q: "I finally stopped living in spreadsheets. I just ask.", n: "Manufacturing owner" },
  { q: "It caught a stockout nine days early and drafted the PO.", n: "Distributor" },
  { q: "Feels like having a COO I can actually afford.", n: "D2C founder" },
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
            The AI Operating System for Indian SMEs — by MNB Research
          </div>
          <Kinetic
            as="h1"
            text={"Your business,\nrun by an AI COO."}
            className="font-display display-1 tracking-tightest mt-6"
          />
          <div className="mt-6 grid lg:grid-cols-[1.3fr_1fr] gap-8 items-end">
            <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl">
              Not another dashboard. MNB Cortex reads all your data, spots problems early, predicts what&rsquo;s coming,
              tells you exactly what to do — and does the busywork. Ask{" "}
              <span className="text-foreground font-medium">&ldquo;How is my business?&rdquo;</span> and get a real answer.
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

          <div className="mt-10 text-sm text-muted-foreground">
            Works as an <RotatingWord words={["AI COO.", "AI CFO.", "AI strategist.", "AI analyst."]} />
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-muted-foreground">
            <span>★ Shark Tank India featured</span>
            <span>◆ DPIIT-recognised startup</span>
            <span>◇ 10,000+ businesses served</span>
          </div>
        </div>
      </section>

      {/* ---------- MARQUEE ---------- */}
      <section className="py-6 border-y bg-secondary/30 font-display text-2xl lg:text-3xl tracking-tightest">
        <Marquee items={["Tally", "Zoho", "Odoo", "Razorpay", "Stripe", "Shopify", "HubSpot", "Salesforce", "WhatsApp", "Slack", "SendGrid", "QuickBooks", "Google Sheets", "Cashfree", "Freshdesk", "Calendly"]} />
      </section>

      {/* ---------- STATEMENT ---------- */}
      <section className="px-5 lg:px-10 py-24 lg:py-36">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="01">What it is</SectionLabel>
          <Reveal>
            <p className="font-display display-3 tracking-tightest mt-8 max-w-5xl leading-[1.15]">
              Dashboards store numbers. Chatbots make small talk. <span className="text-primary">MNB Cortex acts.</span> It&rsquo;s a
              full AI operating system that runs the loop — monitor, predict, recommend, remember, execute — across your entire company.
            </p>
          </Reveal>
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

      {/* ---------- CAPABILITIES (hover-reveal list) ---------- */}
      <section id="capabilities" className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
            <div>
              <SectionLabel n="02">Capabilities</SectionLabel>
              <h2 className="font-display display-2 tracking-tightest mt-5 max-w-2xl">One login.<br />Your whole company.</h2>
            </div>
            <p className="text-muted-foreground max-w-sm">100+ AI-native tools across ten domains — each grounded in a permanent memory of your business, built for Indian SMEs.</p>
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
          <SectionLabel n="03">How it works</SectionLabel>
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
          <SectionLabel n="04">Who it&rsquo;s for</SectionLabel>
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
                    {r.slice(1).map((c, j) => <td key={j} className="py-4 px-3 text-center text-lg">{mark(c)}</td>)}
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
          <SectionLabel n="06">The math</SectionLabel>
          <div className="mt-8"><Reveal><RoiCalculator /></Reveal></div>
        </div>
      </section>

      {/* ---------- TESTIMONIALS ---------- */}
      <section className="px-5 lg:px-10 py-24 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="07">In the field</SectionLabel>
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

      <PublicFooter />
    </main>
  );
}
