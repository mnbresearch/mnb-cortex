import Link from "next/link";
import { ArrowUpRight, Download } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";

export const metadata = {
  title: "Investors — MNB Cortex",
  description: "MNB Cortex — the AI operating brain for Indian SMEs. Positioning, the moat, why now, business model and team, by MNB Research (Shark Tank India, DPIIT).",
};

const MOATS = [
  { n: "1", name: "A memory that compounds", claim: "Each workspace builds a private, permanent brain that sharpens daily. A rival starts from zero for every customer; Cortex only deepens. A per‑customer data moat with rising switching cost." },
  { n: "2", name: "One brain, not 130 point tools", claim: "Finance, sales, ops and 300+ agents reason over the same memory and live data. You can bolt a chatbot onto a dashboard — you can’t retrofit a unified operating brain." },
  { n: "3", name: "It acts, not just answers", claim: "Reads real bank statements and GST returns, drafts the action, and — with one approval — sends it. Advice is a commodity; closing the loop across every function is not." },
  { n: "4", name: "Vertical depth × the AI‑search era", claim: "Deep tuning for 25 Indian industries, plus getting you recommended by ChatGPT, Gemini & Perplexity. Generalists can’t match the depth; latecomers can’t catch the head start." },
];

const KPIS = [
  { v: "25 lakh+", l: "student data points (AbroBot)" },
  { v: "88–92%", l: "visa success rate (published)" },
  { v: "₹55 Cr+", l: "scholarships facilitated" },
  { v: "160+ outlets", l: "press reach · 60M+" },
];

export default function Investors() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      {/* Hero */}
      <section className="relative px-5 lg:px-10 pt-32 lg:pt-40 pb-14">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="aurora opacity-50" aria-hidden />
        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="eyebrow">Investors</div>
          <Kinetic as="h1" text={"The operating brain\nevery Indian SME will run on."} className="font-display display-1 tracking-tightest mt-5" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            MNB Cortex reads a business’s real numbers, remembers every decision, tells the owner exactly what to do next — and does the busywork. An <span className="text-foreground font-medium">AI COO</span>, not another dashboard.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/investor-onepager.pdf" target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>
              <Download className="h-4 w-4" /> Download one‑pager (PDF)
            </a>
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">Talk to us <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-muted-foreground">
            <span>★ Shark Tank India featured</span><span>◆ DPIIT‑recognised startup</span><span>◇ Live &amp; self‑serve at cortex.mnbresearch.com</span>
          </div>
        </div>
      </section>

      {/* Problem + Product */}
      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden">
          <div className="bg-card p-7 lg:p-9">
            <SectionLabel n="01">The problem</SectionLabel>
            <p className="mt-4 text-muted-foreground leading-7">India’s 60M+ SMEs run on Tally, spreadsheets, WhatsApp and gut feel. They learn about cash crunches, stock‑outs and churn only after it costs them. Consultants are slow and expensive; generic AI chatbots don’t know their business, numbers or context.</p>
          </div>
          <div className="bg-card p-7 lg:p-9">
            <SectionLabel n="02">The product</SectionLabel>
            <p className="mt-4">One brain across the whole company that runs the loop:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Monitors", "Predicts", "Recommends", "Acts", "Remembers"].map((s) => (
                <span key={s} className="rounded-lg bg-primary/10 text-primary px-2.5 py-1 text-sm font-medium">{s}</span>
              ))}
            </div>
            <p className="mt-4 text-muted-foreground leading-7">130+ tools, 300+ AI agents, tuned to 25 industries — all grounded in <span className="text-foreground font-medium">Cortex Memory</span>. Reads bank statements &amp; GST returns; drafts &amp; sends reminders / POs / plans on approval; a weekly plan; and AI Visibility so buyers’ AI assistants recommend you.</p>
          </div>
        </div>
      </section>

      {/* The moat */}
      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="03">The moat</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">Anyone can wrap an AI. <span className="text-primary">This can’t be copied.</span></h2>
          <div className="mt-10 grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden">
            {MOATS.map((m) => (
              <Reveal key={m.n} className="bg-card">
                <div className="p-7 lg:p-8 h-full">
                  <div className="font-display text-4xl tracking-tightest text-primary">{m.n}</div>
                  <div className="mt-3 font-semibold text-lg">{m.name}</div>
                  <p className="mt-2 text-sm text-muted-foreground leading-6">{m.claim}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Why now + model */}
      <section className="px-5 lg:px-10 pb-16">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden">
          <div className="bg-card p-7 lg:p-9">
            <SectionLabel n="04">Why now</SectionLabel>
            <ul className="mt-4 space-y-2 text-muted-foreground list-disc pl-5">
              <li>AI finally makes a COO‑grade brain affordable at SaaS prices.</li>
              <li>India’s SME digitisation + GST/UPI data rails create clean, structured inputs.</li>
              <li>The shift to AI‑search (AEO) is a one‑time land‑grab for discovery.</li>
            </ul>
          </div>
          <div className="bg-card p-7 lg:p-9">
            <SectionLabel n="05">Business model</SectionLabel>
            <p className="mt-4 text-muted-foreground leading-7">Self‑serve SaaS. Plans ₹799 → ₹39,999/mo (+ Enterprise), USD for international. Live payments via Cashfree. Credit‑metered AI with per‑plan allowances; white‑label &amp; multi‑brand tiers for agencies and groups. 3‑day trial, no card.</p>
          </div>
        </div>
      </section>

      {/* Team & track record */}
      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="06">Team &amp; track record</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 max-w-3xl">Built by MNB Research — the team behind AbroBot.</h2>
          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border rounded-2xl overflow-hidden">
            {KPIS.map((k) => (
              <div key={k.l} className="bg-card p-6">
                <div className="font-display text-3xl tracking-tightest text-primary">{k.v}</div>
                <div className="text-xs text-muted-foreground mt-1.5">{k.l}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-muted-foreground max-w-3xl leading-7">MNB Research is India’s business growth &amp; consultancy specialist (Shark Tank India featured, DPIIT‑recognised). Its first AI product, AbroBot, is India’s AI study‑abroad platform with 20+ live AI tools and 4,000+ consultants’ insights. MNB Cortex applies that same AI‑product playbook to the far larger SME operating‑system market.</p>
        </div>
      </section>

      {/* The ask */}
      <section className="px-5 lg:px-10 py-24 border-t text-center">
        <div className="max-w-3xl mx-auto">
          <SectionLabel n="07">The ask</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5">Let’s build the SME operating system for India.</h2>
          <p className="mt-5 text-muted-foreground text-lg">Live at cortex.mnbresearch.com — self‑serve signup, 3‑day trial, real payments, industry‑tailored onboarding. In conversation with investors &amp; partners to scale go‑to‑market and deepen the data moat.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="/investor-onepager.pdf" target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor><Download className="h-4 w-4" /> Download one‑pager</a>
            <a href="mailto:contact@mnbresearch.com" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">contact@mnbresearch.com</a>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">MNB Research · operated by Abrobot Technologies (Pvt Ltd), Delhi, India · +91 97114 88481</p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
