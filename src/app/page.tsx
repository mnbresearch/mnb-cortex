import Link from "next/link";
import { ArrowUpRight, ArrowRight, Check } from "lucide-react";
import { AgentFloor } from "@/components/agent-floor";
import { Track } from "@/components/track";
import { ENTRY_PRICE_LABEL, PLANS, PLAN_AGENT_LIMITS, formatMoney } from "@/lib/config";
import { Reveal } from "@/components/landing-extras";
import { SmoothScroll, Cursor, Kinetic, SectionLabel, Marquee, Magnetic, Faq } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { ProductPreview } from "@/components/product-preview";
import { SOLUTIONS } from "@/lib/solutions";
import { KnowledgeSection, EnterpriseSection } from "@/components/landing-knowledge";
import { HeroFilm } from "@/components/home/hero-film";
import { PlatformShowcase } from "@/components/home/platform-showcase";
import { StudioDemo } from "@/components/home/studio-demo";
import { UnrivaledMoat } from "@/components/unrivaled-moat";

/*
  THE HOMEPAGE, REBUILT FOR MNB CORTEX (November 2026).

  Who it speaks to now: finance and operations teams at companies — the buyer
  who books a demo, brings IT in to pair Microsoft 365 or Google Workspace and
  asks about security before price. The owner-run business this page used to
  speak to has its own page, /business, with everything that was here (the
  free health check, the three steps, the playbooks, the objections) intact.

  The shape follows the enterprise AI pages that set the bar in this category
  — one promise, the product shown working, proof, the platform, the flagship,
  security, a way to start — in nine sections instead of thirteen.

  Rules this page keeps from the old one, because they are about honesty
  rather than layout:
    - No invented testimonials, logos or customer metrics (see the TESTI note
      on /business). The proof strip carries only what MNB Research can show.
    - Every mock-up and the film are labelled illustrative.
    - No "start free" / "free trial": both trial constants are 0. The free
      thing is the health check, and it is linked as such.
    - Every capability named exists in the code it points at (solutions.ts,
      landing-knowledge.tsx, platform-showcase.tsx carry the map).
*/

const PROOF = [
  { k: "Built by", v: "MNB Research", d: "AI agents, automation and analytics for Indian businesses" },
  { k: "Our team, featured on", v: "Shark Tank India", d: "for AbroBot — and 160+ press outlets, 60M+ reach" },
  { k: "Recognised", v: "DPIIT startup", d: "Government of India recognised" },
  { k: "Works with", v: "Your stack", d: "Tally, Zoho Books, Microsoft 365, Google Workspace and MCP" },
];

const PILOT = [
  { n: "01", t: "Scope one workflow", d: "On the demo call we pick where agents start: month-end close, collections or compliance — whichever costs your team the most hours." },
  { n: "02", t: "Connect what it reads", d: "Your books export and documents on day one. Your IT admin pairs Microsoft 365 or Google Workspace from Settings, read-only." },
  { n: "03", t: "Let the agents run it", d: "Agents take the workflow in the background. Everything they propose waits in Approvals; every answer names its source." },
  { n: "04", t: "Widen when you trust it", d: "Add Autopilot rules with limits, schedules, more teams and more entities once you have seen the work." },
];

const FAQS = [
  { q: "What is MNB Cortex?", a: "An agent workspace for finance and operations teams. You hand Cortex an outcome — close the month, chase what is overdue, prepare the board pack — and a lead agent plans it, specialist agents do the steps in the background, and the result comes back with its sources, waiting for your approval." },
  { q: "Does it replace our ERP or accounting software?", a: "No. Cortex reads exports from Tally, Zoho Books, Vyapar, Busy or your spreadsheets, and your company's mail, chats and documents. It never writes to your books. It does the work those systems were never built to do, on top of them." },
  { q: "What can the agents do without us?", a: "Nothing that leaves the workspace. Agents propose; reminders, status changes and exports wait in Approvals until someone says yes. The only exception is an Autopilot rule your admin writes, with limits such as an amount cap and a daily maximum." },
  { q: "How do we connect Microsoft 365 or Google Workspace?", a: "A workspace admin pairs them in Settings, step by step, in about ten minutes. Microsoft can use Cortex's app with one organisation-wide approval, or your own app in your own tenant; Google uses an Internal app in your own Workspace. Every permission is read-only. Available on Command and Enterprise." },
  { q: "How do we know an answer is right?", a: "Every answer names the email, chat, document or rows it came from, so you can open it. Veritas v1 then traces each rupee figure back to what the agents actually read and flags any figure it cannot find. Percentages and day counts are reported as not checked, never as verified." },
  { q: "Where does our data live, and who can see it?", a: "Each workspace is isolated at the database level with row-level security. Traffic is encrypted in transit; sign-in tokens and app secrets are encrypted at rest with AES-256-GCM; names and IDs are masked before anything reaches an AI model. Admins decide what is connected, and you can export every table in your workspace as JSON, or delete it, at any time." },
  { q: "How is it priced?", a: `Plans start at ${ENTRY_PRICE_LABEL} a month, and each plan sets how many agent tasks run at once and how many schedules you can keep. Usage runs on credits. Enterprise is quoted for groups that need more entities, SSO or a dedicated environment.` },
  { q: "How is Cortex different from Model ML, Rogo or Hebbia?", a: "Those are built for investment professionals working on market data — pitch books, diligence, research. Cortex is built for the team that runs a company's own finance and operations: its books, its mail and documents, GST, TDS and 43B(h), with agents you can build yourself and actions that wait for approval. The comparison page sets it out cell by cell, with sources." },
  { q: "How does Cortex help with statutory audits and CARO 2020?", a: "Cortex runs a continuous Big-4 pre-flight audit sentinel over your live ledger. It scores statutory readiness (0–100, Grade A+ to D), defends Section 43B(h) MSME terms, catches GSTR-2B vs 3B ITC mismatches, and scans for forensic invoice anomalies (duplicates, round-sum disbursement spikes). The Forensic Audit Agent (fin.audit) prepares audit working papers in one click so you are never surprised by qualification remarks." },
  { q: "Can we build our own agents?", a: "Yes, in Agent Studio. Describe the job, Cortex drafts the agent, and you choose exactly which tools it may use. Its permission card shows what it may read and propose; anything it wants done waits in Approvals, and every rupee figure it states is checked by Veritas v1. Each plan includes a number of Agent Studio agents." },
  { q: "We're an owner-run business. Is this for us?", a: "Yes — Cortex started there. The page for growing businesses has the free 2-minute health check (no card, no account), the three-step start and the playbooks that run from day one." },
];

const TEASER = ["watch", "watchpro", "command"] as const;

export default function Home() {
  const finance = SOLUTIONS.find((s) => s.slug === "finance")!;
  const others = SOLUTIONS.filter((s) => s.slug !== "finance");
  const plans = TEASER.map((id) => PLANS.find((p) => p.id === id)!).filter(Boolean);

  return (
    <main className="min-h-screen overflow-x-hidden">
      <Track event="landing_view" />
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      {/* ---------- 1. HERO: the promise, two doors, the film ---------- */}
      <section className="relative px-5 lg:px-10 pt-32 lg:pt-40 pb-20 overflow-hidden noise">
        <div className="absolute inset-0 grid-fade" aria-hidden />
        <div className="aurora opacity-50" aria-hidden />
        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <Link href="/#platform" className="pill-label hover:text-foreground transition-colors">
            <span className="h-1.5 w-1.5 rounded-full bg-primary cx-pulse" />
            Cortex 7 · The agent workspace
          </Link>
          <h1 className="font-display display-xl tracking-tightest mt-8 text-balance">
            Agents that run the work.<br />You make the <span className="serif-em pr-1">calls.</span>
          </h1>
          <p className="mt-7 text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto leading-8 text-pretty">
            MNB Cortex is the agent workspace for <span className="text-foreground font-medium">finance and operations teams</span>.
            Agents read your books and your company&rsquo;s mail, chats and documents, do the work end to end, and bring you
            the decisions — every answer cited, every rupee checked, nothing sent without your approval.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Magnetic>
              <Link href="/demo" className="flex sm:inline-flex items-center justify-center gap-2 rounded-full btn-ink px-7 h-12 text-sm font-medium" data-cursor>
                Book a demo <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Magnetic>
            <Link href="/login?mode=signup" className="flex sm:inline-flex items-center justify-center gap-2 rounded-full border px-7 h-12 text-sm font-medium hover:bg-accent transition-colors">
              Create account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            Running a growing business? <Link href="/business" className="text-foreground font-medium underline underline-offset-4 hover:text-primary">Start with the free 2-minute check</Link>.
            <span className="hidden sm:inline"> · </span><br className="sm:hidden" />
            Already have an account? <Link href="/login" className="text-foreground font-medium underline underline-offset-4 hover:text-primary">Sign in</Link>.
          </p>
        </div>
        <div className="relative z-10 max-w-6xl mx-auto mt-16 lg:mt-20">
          <Reveal><HeroFilm /></Reveal>
        </div>
      </section>

      {/* ---------- 2. PROOF: only what can be shown ---------- */}
      <section className="px-5 lg:px-10 pb-10">
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border rounded-2xl overflow-hidden hairline">
          {PROOF.map((p) => (
            <div key={p.v} className="bg-card p-6">
              <div className="eyebrow">{p.k}</div>
              <div className="font-display text-2xl tracking-tightest mt-2">{p.v}</div>
              <p className="text-xs text-muted-foreground mt-1.5">{p.d}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="py-6 border-y bg-secondary/30 font-display text-2xl lg:text-3xl tracking-tightest" aria-label="Works with">
        <Marquee items={["Tally", "Zoho Books", "Outlook", "Microsoft Teams", "SharePoint", "Gmail", "Google Drive", "MCP servers", "Vyapar", "Busy", "Shopify", "Razorpay", "Stripe", "Excel & CSV"]} />
      </section>

      {/* ---------- 3. PLATFORM: shown working ---------- */}
      <section id="platform" className="px-5 lg:px-10 py-24 lg:py-32 scroll-mt-16">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="01">Platform</SectionLabel>
          <div className="mt-5 grid lg:grid-cols-[1.3fr_1fr] gap-6 items-end">
            <Kinetic as="h2" text={"One workspace.\nA team of agents that does the work."} className="font-display display-2 tracking-tightest" />
            <p className="text-muted-foreground leading-7 lg:pb-3">
              Delegate an outcome, not a prompt. Cortex plans it, runs it in the background, answers from your books and your
              company&rsquo;s knowledge, checks its own figures and waits for your yes.
            </p>
          </div>
          <div className="mt-14"><PlatformShowcase /></div>
        </div>
      </section>

      {/* ---------- 3b. AGENT STUDIO: build your own, governed ----------
        The capability no finance agent we compared states publicly in this
        combination: agents a company builds itself, each with a permission
        card — chosen tools, actions only as proposals, a credit ceiling, and
        Veritas on every rupee. Real: lib/agents/studio.ts, components/
        agent-studio.tsx, test-agent-studio.mjs. */}
      <section id="studio" className="px-5 lg:px-10 py-24 lg:py-32 border-t scroll-mt-16">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[1fr_1.15fr] gap-12 lg:gap-16 items-center">
          <div>
            <SectionLabel n="02">Agent Studio</SectionLabel>
            <h2 className="font-display display-2 tracking-tightest mt-5">Build your own agent. <span className="serif-em">Govern</span> it like a hire.</h2>
            <p className="mt-5 text-muted-foreground leading-7 max-w-xl">
              Every company has work no off-the-shelf agent knows about. Describe the job in a sentence; Cortex drafts the agent; you decide
              exactly what it may read and propose. Then it joins its team — the lead agent plans it in, and it works under the same
              approvals, credit limits and Veritas checks as every built-in agent.
            </p>
            <ol className="mt-8 space-y-4">
              {[
                ["Describe the job", "In plain words: what to look at, for whom, how often, what to hand back."],
                ["Read its permission card", "The exact tools it may use, what it may propose, and what it can never do — in words an auditor can sign off."],
                ["It joins the team", "Routed to by its own words, planned in by the lead, paused or removed in one click."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="font-display text-2xl tracking-tightest text-primary w-8 shrink-0">0{i + 1}</span>
                  <div><p className="font-medium">{t}</p><p className="text-sm text-muted-foreground leading-6 mt-0.5">{d}</p></div>
                </li>
              ))}
            </ol>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/demo" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-11 text-sm font-medium">See Agent Studio <ArrowUpRight className="h-4 w-4" /></Link>
              <Link href="/compare" className="inline-flex items-center gap-2 text-sm font-medium link-sweep">How Cortex compares with Model ML, Rogo and Hebbia <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
          <Reveal className="min-w-0"><StudioDemo /></Reveal>
        </div>
      </section>

      {/* ---------- 3. PROPRIETARY MOAT ---------- */}
      <section id="moat" className="px-5 lg:px-10 py-24 lg:py-28 border-y bg-secondary/10">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="03">Proprietary Moat</SectionLabel>
          <div className="mt-5 grid lg:grid-cols-[1fr_auto] gap-6 items-end mb-10">
            <div>
              <p className="eyebrow">Beyond simple chat wrappers</p>
              <h2 className="font-display display-2 tracking-tightest mt-3">
                Features that exist <span className="serif-em">nowhere else</span> in the market.
              </h2>
              <p className="mt-4 text-muted-foreground leading-7 max-w-2xl">
                Traditional ERPs and generic AI copilots summarize what already happened. Cortex gives you live financial stress-testing, continuous Big-4 pre-flight audit defense, 0% fee UPI payment acceleration, and autonomous boardroom intelligence.
              </p>
            </div>
            <Link href="/audit" className="inline-flex items-center gap-2 text-sm font-medium link-sweep">
              Explore Audit Sentinel <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <UnrivaledMoat />
        </div>
      </section>

      {/* ---------- 4. FLAGSHIP: Cortex for Finance ---------- */}
      <section id="finance" className="px-5 lg:px-10 py-24 lg:py-32 bg-secondary/20 border-b">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="04">Flagship</SectionLabel>
          <div className="mt-5 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <p className="eyebrow">{finance.name}</p>
              <h2 className="font-display display-2 tracking-tightest mt-4">The finance team&rsquo;s <span className="serif-em">agent</span> workspace.</h2>
              <p className="mt-5 text-muted-foreground leading-7 max-w-xl">{finance.sub}</p>
              <div className="mt-8 grid sm:grid-cols-2 gap-x-8 gap-y-6">
                {finance.groups.slice(0, 4).map((g) => (
                  <div key={g.name}>
                    <div className="font-medium">{g.name}</div>
                    <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                      {g.items.slice(0, 3).map((it) => (
                        <li key={it.title} className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />{it.title}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/solutions/finance" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-11 text-sm font-medium">Explore Cortex for Finance <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/demo" className="inline-flex items-center gap-2 rounded-full border px-6 h-11 text-sm font-medium hover:bg-accent transition-colors">See it on your numbers</Link>
              </div>
            </div>
            <Reveal className="min-w-0"><ProductPreview /></Reveal>
          </div>
        </div>
      </section>

      {/* ---------- 5. SOLUTIONS ---------- */}
      <section id="solutions" className="px-5 lg:px-10 py-24 lg:py-28">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="05">Solutions</SectionLabel>
          <div className="mt-5 grid lg:grid-cols-[1fr_auto] gap-6 items-end">
            <h2 className="font-display display-2 tracking-tightest max-w-3xl">One platform. <span className="serif-em">Four</span> agent teams.</h2>
            <Link href="/solutions" className="inline-flex items-center gap-2 text-sm font-medium link-sweep">All solutions <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="mt-12 grid md:grid-cols-3 gap-4">
            {others.map((sol) => (
              <Link key={sol.slug} href={`/solutions/${sol.slug}`} className="group rounded-2xl border bg-card p-7 flex flex-col transition-colors hover:bg-accent/50">
                <span className="eyebrow">{sol.eyebrow}</span>
                <div className="font-display text-2xl tracking-tightest mt-3">{sol.name}</div>
                <p className="mt-2 text-sm text-muted-foreground leading-6 flex-1">{sol.short}</p>
                <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium">Explore <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Tuned for 27 industries, from manufacturing to clinics. <Link href="/industries" className="underline underline-offset-4 hover:text-foreground">Find yours</Link>.</p>
        </div>
      </section>

      {/* ---------- 6. THE TEAM AT WORK (the animated floor) ---------- */}
      <section className="px-5 lg:px-10 pb-24 lg:pb-28">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="06">Watch the team work</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 max-w-3xl">One night in a business, desk to desk. Each agent picks up where the last left off — and the last desk is always yours.</h2>
          <div className="mt-10"><AgentFloor /></div>
        </div>
      </section>

      {/* ---------- 7. COMPANY KNOWLEDGE ---------- */}
      <KnowledgeSection label={<SectionLabel n="07">Company Knowledge</SectionLabel>} />

      {/* ---------- 8. SECURITY ---------- */}
      <div id="security" className="scroll-mt-16">
        <EnterpriseSection label={<SectionLabel n="08">Security &amp; control</SectionLabel>} />
      </div>

      {/* ---------- 9. HOW A PILOT RUNS ---------- */}
      <section className="px-5 lg:px-10 py-24 lg:py-28">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="09">Getting started</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">Start with one workflow. <span className="serif-em">Widen</span> from there.</h2>
          <ol className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-border border rounded-2xl overflow-hidden hairline">
            {PILOT.map((p) => (
              <li key={p.n} className="bg-card p-7">
                <div className="font-display text-4xl tracking-tightest text-primary">{p.n}</div>
                <div className="mt-4 font-medium text-lg">{p.t}</div>
                <p className="mt-2 text-sm text-muted-foreground leading-6">{p.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- 10. PRICING TEASER ---------- */}
      <section id="pricing" className="px-5 lg:px-10 pb-24 lg:pb-28">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="10">Pricing</SectionLabel>
          <div className="mt-5 grid lg:grid-cols-[1fr_auto] gap-6 items-end">
            <h2 className="font-display display-3 tracking-tightest max-w-2xl">Priced by the size of your agent team. Plans from {ENTRY_PRICE_LABEL} a month.</h2>
            <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-medium link-sweep">Compare every plan <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((p) => {
              const lim = PLAN_AGENT_LIMITS[p.id];
              return (
                <div key={p.id} className={`rounded-2xl border p-6 flex flex-col ${p.highlight ? "bg-card border-primary/40" : "bg-card"}`}>
                  <div className="flex items-center justify-between"><span className="font-medium">{p.name}</span>{p.highlight && <span className="text-[11px] text-primary font-medium">Most chosen</span>}</div>
                  <div className="mt-3 font-display text-3xl tracking-tightest">{formatMoney(p.monthly, "INR")}<span className="text-sm font-normal text-muted-foreground tracking-normal"> /mo</span></div>
                  <p className="mt-2 text-sm text-muted-foreground leading-6 flex-1">{p.tagline}</p>
                  <ul className="mt-4 space-y-1.5 text-sm">
                    <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />{lim.activeTasks} agent tasks at once</li>
                    <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />{lim.schedules} scheduled runs</li>
                    <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />{lim.studioAgents} Agent Studio agents</li>
                  </ul>
                  <Link href="/login?mode=signup" className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-full border h-10 text-sm font-medium hover:bg-accent transition-colors">Create account</Link>
                </div>
              );
            })}
            <div className="rounded-2xl border bg-foreground text-background p-6 flex flex-col">
              <span className="font-medium">Enterprise</span>
              <div className="mt-3 font-display text-3xl tracking-tightest">Let&rsquo;s talk</div>
              <p className="mt-2 text-sm text-background/70 leading-6 flex-1">For groups, PE funds and family offices: more entities, {PLAN_AGENT_LIMITS.enterprise.activeTasks} agent tasks at once, SSO and a dedicated environment on request.</p>
              <Link href="/demo" className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-background text-foreground h-10 text-sm font-medium hover:opacity-90">Book a demo <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 11. FOR GROWING BUSINESSES ---------- */}
      <section className="px-5 lg:px-10 pb-24">
        <div className="max-w-7xl mx-auto rounded-[22px] border bg-card p-8 lg:p-12 grid lg:grid-cols-[1fr_auto] gap-8 items-center relative overflow-hidden">
          <div className="absolute inset-0 aura opacity-70 pointer-events-none" aria-hidden />
          <div className="relative">
            <p className="eyebrow">For owner-run businesses</p>
            <h2 className="font-display display-3 tracking-tightest mt-3 max-w-2xl">Running a growing business on Tally or a spreadsheet?</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl leading-7">Send Cortex the file you already have and read the one thing that matters — in minutes, with no setup project. Or take the free 2-minute health check first: no card, no account.</p>
          </div>
          <div className="relative flex flex-wrap gap-3">
            <Link href="/business" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium">Cortex for growing businesses <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/health-check" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">Free health check</Link>
          </div>
        </div>
      </section>

      {/* ---------- 12. QUESTIONS ---------- */}
      <section className="px-5 lg:px-10 pb-28">
        <div className="max-w-3xl mx-auto">
          <SectionLabel n="11">Questions</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 mb-10">What teams ask before they start.</h2>
          <Faq items={FAQS} />
          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Link href="/demo" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-11 text-sm font-medium">Book a demo <ArrowUpRight className="h-4 w-4" /></Link>
            <Link href="/login?mode=signup" className="inline-flex items-center gap-2 rounded-full border px-6 h-11 text-sm font-medium hover:bg-accent transition-colors">Create account</Link>
            <span className="text-sm text-muted-foreground">or ask us anything on <a href="https://wa.me/919711488480" className="underline underline-offset-4 hover:text-foreground">WhatsApp</a>.</span>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
