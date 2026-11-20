import Link from "next/link";
import { ArrowUpRight, ArrowRight, ExternalLink, Check } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { AS_OF, NOT_STATED, CORTEX, COMPETITORS, ROW_LABELS, ROW_ORDER, TOPICS } from "@/lib/competitors";

export const metadata = {
  title: "MNB Cortex vs Model ML, Rogo, Hebbia & Microsoft Finance agents — AI agents for finance teams",
  description: "A sourced comparison of AI finance agents: MNB Cortex, Model ML, Rogo, Hebbia and Microsoft's Finance agents — who each is built for, what it works from, Indian GST/TDS/43B(h) support, custom agents, approvals and verification.",
  alternates: { canonical: "/compare" },
  keywords: ["AI finance agent", "AI agents for finance teams", "Model ML alternative", "Rogo alternative", "Hebbia alternative", "Copilot for Finance alternative", "AI CFO India", "AI month-end close", "GSTR-2B reconciliation", "43B(h) tracker", "AI for Tally"],
};

/*
  /compare — TWO comparisons, kept apart on purpose.

  1. NAMED: MNB Cortex against the AI finance agents a buyer will actually
     shortlist. Every cell about another company is sourced from its own site
     on AS_OF (lib/competitors.ts, scripts/test-compare.mjs); where its site
     says nothing the cell says so in words, and the page says that this is
     not the same as "no". Where another product is the better choice, the
     page says that too.
  2. CATEGORY: the original table against an ERP, a CRM, a chatbot and a
     consultant. Its notes are kept below because what they explain still
     applies.
*/

const DIFFERENT = [
  { t: "It runs the company, not the deal", d: "The AI finance agents built for banks and funds work on market data — PitchBook, FactSet, filings. Cortex works on your own books and your company's mail, chats and documents: who owes you, what you owe, what is due, what the board needs." },
  { t: "Indian statutory work is built in", d: "The statutory calendar for your registration, GSTR-2B input-tax-credit reconciliation, MSME 43B(h) exposure, TDS and advance tax — tools the agents call, not things they recall." },
  { t: "Agents you build, governed by default", d: "Agent Studio lets you build your own agents in plain words. Each gets a permission card: the exact tools it may use, actions only as proposals for approval, metered against a credit ceiling, every rupee checked by Veritas v1." },
  { t: "The price is on the page", d: "Plans are published in INR, with agent limits per plan. You can create a workspace yourself, or book a demo and start with a pilot on one workflow." },
];

const COLS = ["Cortex", "ERP", "CRM", "General chatbot", "Consultant"];
const ROWS: { f: string; v: string[] }[] = [
  /* Partial for Cortex too: it reads your exports (CSV/Tally/Vyapar/Busy) plus
     six live syncs — Zoho Books, Odoo, Shopify, Razorpay, Stripe, Google Sheets (lib/sync). */
  { f: "Reads all your business data", v: ["p", "p", "p", "n", "p"] },
  { f: "Diagnoses problems for you", v: ["y", "n", "n", "p", "y"] },
  { f: "Predicts what's coming", v: ["y", "n", "n", "n", "p"] },
  { f: "Recommends specific actions", v: ["y", "n", "n", "p", "y"] },
  { f: "Executes the busywork", v: ["y", "n", "n", "n", "n"] },
  { f: "Plain-language answers", v: ["y", "n", "n", "y", "y"] },
  { f: "Remembers your business", v: ["y", "p", "p", "n", "p"] },
  { f: "Re-reads your numbers without being asked", v: ["y", "n", "n", "n", "n"] },
  { f: "Autonomous FP&A, driver-based models & board packs", v: ["y", "p", "n", "n", "n"] },
  { f: "Autonomous month-end close & variance audit", v: ["y", "p", "n", "n", "p"] },
  { f: "P0–P3 Chief of Staff action triage & routines", v: ["y", "n", "n", "n", "p"] },
  { f: "Built for Indian SMEs", v: ["y", "p", "p", "n", "p"] },
];

const NARR = [
  { t: "vs an ERP", d: "An ERP is a system of record — it stores transactions beautifully but waits for you to ask questions and draw conclusions. Cortex sits on top of your data (including your ERP) and does the thinking: it tells you what changed, why it matters, and what to do." },
  { t: "vs a CRM", d: "A CRM tracks your pipeline; it doesn't tell you which deals to prioritise, which customers are about to churn, or how pricing is hurting margin. Cortex reads sales alongside finance and operations, so advice reflects the whole business, not one slice." },
  { t: "vs ChatGPT", d: "A general chatbot is brilliant and blank — it knows nothing about your numbers unless you paste them every time, and it forgets. Cortex is grounded in a permanent memory of your business and connected to your data, so answers are specific to you." },
  { t: "vs a consultant", d: "A consultant arrives, forms a view, and leaves — and the context goes with them. Cortex keeps reading the same numbers after the engagement would have ended, and it remembers every decision you've made. What it is not is a person who can sit in the room and argue with your co-founder; the two are not substitutes." },
];

const mark = (v: string) => {
  if (v === "y") return <span className="text-primary text-lg">●</span>;
  if (v === "p") return <span className="text-warning text-lg">◐</span>;
  if (v === "n") return <span className="text-muted-foreground/40 text-lg">○</span>;
  return <span className="text-sm">{v}</span>;
};

export default function Compare() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-14">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="00">Compare</SectionLabel>
          <Kinetic as="h1" text={"MNB Cortex vs the\nAI finance agents."} className="font-display display-2 tracking-tightest mt-6" />
          <p className="mt-6 text-lg text-muted-foreground max-w-3xl leading-8">
            Model ML, Rogo and Hebbia are built for investment professionals working on market data. Microsoft&rsquo;s Finance agents sit inside
            Excel and Outlook on top of Dynamics 365 or SAP. MNB Cortex is the AI agent workspace for enterprises and growing businesses running their own operations — on
            their own systems, their own mail and documents, and India&rsquo;s statutory calendar. Here is how they compare, sourced.
          </p>
        </div>
      </section>

      {/* ---------- 1. NAMED, SOURCED ---------- */}
      <section className="px-5 lg:px-10 pb-16 border-t" id="ai-finance-agents">
        <div className="max-w-7xl mx-auto pt-10 overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[1080px]">
            <caption className="sr-only">MNB Cortex compared with Model ML, Rogo, Hebbia and Microsoft Finance agents, as of {AS_OF}</caption>
            <thead>
              <tr className="border-b align-bottom">
                <th scope="col" className="text-left font-normal text-muted-foreground py-4 pr-4 w-44"></th>
                <th scope="col" className="text-left py-4 px-3 w-[22%]"><span className="font-semibold text-primary">MNB Cortex</span></th>
                {COMPETITORS.map((c) => (
                  <th key={c.slug} scope="col" className="text-left py-4 px-3 font-medium">
                    <Link href={`/compare/${c.slug}`} className="hover:text-primary link-sweep">{c.name}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROW_ORDER.map((k) => (
                <tr key={k} className="border-b border-border/60 align-top">
                  <th scope="row" className="text-left py-4 pr-4 font-medium">{ROW_LABELS[k]}</th>
                  <td className="py-4 px-3 bg-primary/5 leading-6">{CORTEX[k]}</td>
                  {COMPETITORS.map((c) => {
                    const v = c.cells[k];
                    return <td key={c.slug} className={`py-4 px-3 leading-6 ${v === NOT_STATED ? "text-muted-foreground/70 italic" : "text-muted-foreground"}`}>{v}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 grid lg:grid-cols-[1.4fr_1fr] gap-6 text-xs text-muted-foreground leading-6">
            <p>
              <span className="font-medium text-foreground">How this was made.</span> Every cell about another company is taken from that company&rsquo;s own
              website or documentation, read on {AS_OF}. &ldquo;{NOT_STATED}&rdquo; means exactly that — we did not find it there — and is not a claim that
              the product lacks it. The MNB Cortex column describes what Cortex does today and is what we will be held to. If anything here is wrong or
              out of date, write to <a href="mailto:contact@mnbresearch.com" className="underline">contact@mnbresearch.com</a> and we will correct it.
              Product names are trademarks of their owners; MNB Cortex is not affiliated with them.
            </p>
            <div>
              <p className="font-medium text-foreground">Sources</p>
              <ul className="mt-1 space-y-1">
                {COMPETITORS.flatMap((c) => c.sources).map((src) => (
                  <li key={src.url}><a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 underline">{src.label} <ExternalLink className="h-3 w-3" /></a></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- WHERE CORTEX IS DIFFERENT ---------- */}
      <section className="px-5 lg:px-10 py-20 border-t bg-secondary/20">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="01">Where Cortex is different</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 max-w-3xl">Built for the team that <span className="serif-em">runs</span> the company.</h2>
          <div className="mt-10 grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden">
            {DIFFERENT.map((x) => (
              <Reveal key={x.t} className="bg-card"><div className="p-7 h-full"><h3 className="font-display text-2xl tracking-tightest">{x.t}</h3><p className="text-muted-foreground mt-3 text-[15px] leading-7">{x.d}</p></div></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- WHEN TO CHOOSE THEM ---------- */}
      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="02">An honest shortlist</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 max-w-3xl">When another tool is the better choice.</h2>
          <div className="mt-10 grid md:grid-cols-2 gap-4">
            {COMPETITORS.map((c) => (
              <Link key={c.slug} href={`/compare/${c.slug}`} className="group rounded-2xl border bg-card p-6 hover:bg-accent/40 transition-colors">
                <p className="eyebrow">MNB Cortex vs {c.name}</p>
                <p className="mt-3 text-sm leading-6"><span className="font-medium">Choose {c.name} if</span> <span className="text-muted-foreground">{c.chooseThem.charAt(0).toLowerCase() + c.chooseThem.slice(1)}</span></p>
                <p className="mt-2 text-sm leading-6"><span className="font-medium">Choose MNB Cortex if</span> <span className="text-muted-foreground">{c.chooseCortex.charAt(0).toLowerCase() + c.chooseCortex.slice(1)}</span></p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">Full comparison <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 2. CATEGORY ---------- */}
      <section className="px-5 lg:px-10 py-20 border-t" id="categories">
        <div className="max-w-5xl mx-auto">
          <SectionLabel n="03">Store, chat, or act?</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 max-w-3xl">Compared with the tools you already have.</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl">
            ERPs and CRMs store your data. Chatbots make conversation, then forget. MNB Cortex reads your Tally, Busy, Vyapar or Excel exports — plus Zoho Books, Odoo, Shopify, Razorpay, Stripe and Google Sheets — and tells you what changed.
          </p>
          <div className="pt-10 overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-normal text-muted-foreground py-4 pr-3"></th>
                  {COLS.map((c, i) => (
                    <th key={c} className={`py-4 px-3 text-center ${i === 0 ? "font-semibold text-primary" : "font-normal text-muted-foreground"}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.f} className="border-b border-border/60">
                    <td className="py-4 pr-3 font-medium">{r.f}</td>
                    {r.v.map((v, j) => <td key={j} className="py-4 px-3 text-center">{mark(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 text-xs text-muted-foreground flex gap-4">
              <span><span className="text-primary">●</span> Yes</span>
              <span><span className="text-warning">◐</span> Partial</span>
              <span><span className="text-muted-foreground/40">○</span> No</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Cortex reads your Tally, Vyapar, Busy and spreadsheet exports, plus six live syncs: Zoho Books, Odoo, Shopify, Razorpay, Stripe and Google Sheets.</p>
            <p className="mt-3 text-xs text-muted-foreground max-w-3xl">
              The Cortex column describes what this product does today and is what we will be held to.
              The other four describe categories of tool, not any particular vendor, and are our
              characterisation — worth checking against whatever you are actually comparing us with.
              No price comparison is made: pricing for the other four varies far too widely for a
              row of rupee symbols to mean anything. <Link href="/pricing" className="text-primary link-sweep">Ours is here</Link>.
            </p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-14 grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden">
          {NARR.map((n) => (
            <Reveal key={n.t} className="bg-card">
              <div className="p-7 h-full">
                <h3 className="font-display text-2xl tracking-tightest">{n.t}</h3>
                <p className="text-muted-foreground mt-3 text-[15px] leading-7">{n.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- WHAT TEAMS SEARCH FOR ---------- */}
      <section className="px-5 lg:px-10 py-20 border-t" id="topics">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="04">What teams look for</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 max-w-3xl">The jobs Cortex is chosen for.</h2>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TOPICS.map((t) => (
              <Link key={t.q} href={t.href} className="group rounded-2xl border bg-card p-6 hover:bg-accent/40 transition-colors">
                <h3 className="font-medium flex items-start gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-1" aria-hidden />{t.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-6">{t.a}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-display display-3 tracking-tightest max-w-xl">See the difference on your own numbers.</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/demo" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>Book a demo <ArrowUpRight className="h-4 w-4" /></Link>
            <Link href="/health-check" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">Free health check</Link>
            <Link href="/login?mode=signup" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">Create account</Link>
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
