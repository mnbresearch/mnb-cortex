import Link from "next/link";
import { ArrowUpRight, Download } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { PLAYBOOKS } from "@/lib/playbooks";
import { INDUSTRIES } from "@/lib/industries";
import { NAV } from "@/lib/nav";
import { agentCount } from "@/lib/agents/catalog";

export const metadata = {
  title: "Investors — MNB Cortex",
  description:
    "MNB Cortex is the execution layer between an Indian SME's books and its business. Position, wedge, why now, moat, model and what has to become true.",
};

/*
  THE INVESTOR PAGE IS HELD TO THE SAME STANDARD AS THE PRODUCT.

  This page previously carried a paragraph beginning "An Cortex, not another
  dashboard" (a sentence that had lost a word in an edit), a four-item KPI band
  whose numbers were all AbroBot's rather than Cortex's, and hardcoded counts
  that drift every time a module is added.

  Three rules now govern it, and they are the same rules the landing page and
  the product live under:

    1. EVERY COUNT IS COMPUTED, never typed. Published numbers in this repo
       have drifted from reality twice before, which is why
       scripts/test-claims.mjs exists.

    2. NO TRACTION NUMBER APPEARS UNTIL IT IS REAL. There is no revenue chart
       and no customer count on this page, because I cannot compute one from
       the repository and an investor who checks will find the gap. What is
       here instead is the product depth — which IS verifiable — and an honest
       statement of what is not yet measured.

    3. THE COUNTER-ARGUMENT IS ON THE PAGE. A partner will think of the
       incumbent risk within ninety seconds; saying it first is worth more than
       hoping they do not.

  The full argument, with the reasoning behind each choice, is in
  docs/positioning.md.
*/

const MOATS = [
  {
    n: "01",
    name: "Statutory logic as tested code, not prompts",
    claim:
      "The 45-day MSME window, per-deadline notice periods, IST date handling and a per-business statutory profile live in tested modules — not in a prompt. Ask a model for a tax date and it will eventually be wrong once, and one wrong date destroys the trust the rest of the product runs on. Unglamorous, and genuinely hard to shortcut.",
  },
  {
    n: "02",
    name: "The ingestion layer nobody wants to build",
    claim:
      "Tally, Vyapar and Busy exports plus arbitrary CSV, normalised into one schema with customer identity resolved across spellings. This is where a new entrant loses three months, and it is the difference between a demo and a product an Indian SME can actually use on Monday.",
  },
  {
    n: "03",
    name: "Closing the loop, with evidence",
    claim:
      "Reminders draft in the customer's own name, send from their address, stop the instant an invoice is marked paid, and leave a recovery ledger of what came back. A kill switch, a circuit breaker and a do-not-contact list exist because the loop is real. Generating a reminder is easy; running outbound messaging on someone else's behalf, safely, is an operational moat.",
  },
  {
    n: "04",
    name: "A workspace worth more in month twelve",
    claim:
      "Metric history, decisions and memory accumulate per workspace. A rival starts from zero for every customer they win. The slowest moat to build and the most durable once built.",
  },
  {
    n: "05",
    name: "Accountants as the channel",
    claim:
      "One firm brings dozens of SMEs who already trust it, and credit pooling across client workspaces makes the firm the account. B2B2B beats paid acquisition in a market where trust is local — and a firm is a channel, not a different product, which is precisely what the earlier positioning got wrong.",
  },
  {
    n: "06",
    name: "The honest counter-argument",
    claim:
      "Tally, Zoho or a bank could bolt a warning layer onto data they already hold, and they have the distribution. The defence is not that they cannot — it is that warn → draft → send → prove is a different discipline from record-keeping, and record-keeping companies are structurally poor at acting on a customer's behalf. That is a real risk and belongs in the room, not in a footnote.",
  },
];

const WHY_NOW = [
  {
    k: "A statutory clock that did not exist two years ago",
    d: "Since FY 2024-25, payment to an MSME-registered supplier beyond the statutory window is disallowed as a deduction until it is actually paid. Supplier-payment hygiene stopped being a cash-flow preference and became a tax event with a date — an inherently computational problem, and a recurring, government-created reason to look.",
  },
  {
    k: "SME data became machine-readable",
    d: "GST e-invoicing thresholds have walked down year by year, so a meaningful share of Indian SMEs now produce structured transaction data as a by-product of compliance. Before that, “read their numbers” meant OCR on a photograph of a ledger.",
  },
  {
    k: "Inference cost collapsed",
    d: "A daily per-workspace analysis, plus drafting, plus a weekly plan, has to cost single-digit rupees for a ₹799 plan to work. Two years ago the unit economics of this product were negative by construction.",
  },
  {
    k: "Discovery is moving to assistants",
    d: "SMEs are increasingly found — or not found — through AI answers rather than ten blue links. The AI Visibility module is a second wedge for D2C and services, where the owner can see the problem on one screen.",
  },
];

const COMPETITIVE: [string, string, string][] = [
  ["Tally · Zoho Books · Vyapar", "Record what happened, correctly", "Do not tell you what is about to happen, or act"],
  ["A BI dashboard", "Shows a chart when you open it", "Notices nothing while you are not looking"],
  ["ChatGPT and general assistants", "Answer questions well, about text", "Do not know your rows, your dates or your customers"],
  ["A consultant or your CA", "Judgement, monthly or yearly", "Not daily, and not at ₹799"],
];

/*
  WHAT HAS TO BECOME TRUE. This section exists because its absence is what
  makes a deck feel evasive. Each row names the metric, why that one, and
  where it stands — including the ones that are instrumented but not yet
  meaningful, which is the honest description of an early company with a deep
  product.
*/
const SCOREBOARD: [string, string, string][] = [
  ["Paying workspaces, and month-on-month growth", "The only proof the wedge converts", "Measured in cortex_payments; too early to publish"],
  ["Import → first genuine warning", "The core promise, timed", "Instrumented (funnel_events)"],
  ["Week-4 retention of the weekly plan", "Whether the loop becomes a habit", "Instrumented (weekly_plan_sends)"],
  ["Exposure surfaced per workspace, in rupees", "Value delivered in the customer's own units", "Computable today; not yet aggregated"],
  ["Recovered after a reminder, as a share", "The claim the collections module exists to make", "Recovery ledger shipped; needs volume"],
  ["Gross margin after AI cost", "Whether the pricing survives scale", "Modelled per mode in test-margins; needs real usage"],
  ["Firms live, and SMEs per firm", "Whether the channel compounds", "Console shipped; channel unproven"],
];

export default function Investors() {
  /* Computed, never typed. See rule 1 above. */
  const modules = NAV.length;
  const agents = agentCount();

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
          <Kinetic
            as="h1"
            text={"The execution layer between\nan SME's books and its business."}
            className="font-display display-1 tracking-tightest mt-5"
          />
          <p className="mt-6 text-lg text-muted-foreground max-w-3xl leading-8">
            India has 60 million-plus small businesses. They run on Tally, WhatsApp and memory, and they learn about a
            cash crunch, a missed statutory date or a customer who has stopped paying only once it has cost them.{" "}
            <span className="text-foreground font-medium">
              Cortex reads their own numbers every day, names the specific thing that is about to cost them money — the
              customer, the amount, the date — and then does something about it.
            </span>
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/investor-onepager.pdf"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium"
              data-cursor
            >
              <Download className="h-4 w-4" /> Download one-pager (PDF)
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors"
            >
              Talk to us <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-muted-foreground">
            <span>★ Shark Tank India featured</span>
            <span>◆ DPIIT-recognised startup</span>
            <span>◇ Live and self-serve at cortex.mnbresearch.com</span>
          </div>
        </div>
      </section>

      {/* The wedge */}
      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="01">The wedge</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">
            Not &ldquo;run your business better&rdquo;.<br />
            <span className="text-primary">Money that is already at risk.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-3xl leading-7">
            Three specific bleeds, in the order an Indian SME feels them. Each is quantified in rupees from the
            customer&rsquo;s own rows, each has a deadline we did not manufacture, and each is verifiable on day one —
            which is how trust gets established before anyone is asked for money.
          </p>
          <div className="mt-10 grid md:grid-cols-3 gap-px bg-border border rounded-2xl overflow-hidden">
            {[
              { k: "Receivables", d: "Earned, invoiced, not collected. The owner finds out when they need the cash." },
              { k: "Section 43B(h)", d: "Pay an MSME supplier late and the deduction is disallowed until you do. A tax event with a clock on it." },
              { k: "Statutory dates", d: "GST, TDS, advance tax, ROC, the audit report. Each one a penalty with a date, and the calendar differs by registration." },
            ].map((x) => (
              <div key={x.k} className="bg-card p-7">
                <div className="font-display text-2xl tracking-tightest">{x.k}</div>
                <p className="mt-2.5 text-sm text-muted-foreground leading-6">{x.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground max-w-3xl">
            The free 60-second Business Health Check is the top of this funnel — the product&rsquo;s first chapter, not a
            lead magnet.
          </p>
        </div>
      </section>

      {/* The product */}
      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="02">The product</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">
            {PLAYBOOKS.length} playbooks, running from the first import.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-3xl leading-7">
            {modules} modules and {agents} agents is the inventory, and the wrong thing to lead with. The unit that
            matters is the playbook: a specific condition in the customer&rsquo;s data, and the action attached to it.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {PLAYBOOKS.map((p) => (
              <span key={p.id} className="rounded-full border px-3.5 py-1.5 text-sm">
                {p.name}
              </span>
            ))}
          </div>
          <div className="mt-10 grid md:grid-cols-3 gap-px bg-border border rounded-2xl overflow-hidden">
            {[
              { k: "Rules decide", d: "Statutory windows, ageing, reorder points — tested arithmetic over real rows. A model asked to compute a tax date will eventually be wrong, and once is enough." },
              { k: "The model reads and writes", d: "Tool calls over the workspace's own rows, an explanation in the owner's language, and the draft they were going to have to write." },
              { k: "The product acts", d: "Draft, approve, send, and record what came back. A recommendation nobody executes is a PDF." },
            ].map((x) => (
              <div key={x.k} className="bg-card p-7">
                <div className="font-display text-xl tracking-tightest">{x.k}</div>
                <p className="mt-2.5 text-sm text-muted-foreground leading-6">{x.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground max-w-3xl">
            Tuned for {INDUSTRIES.length} Indian industries. The customer keeps their accounting software —
            rip-and-replace is how SME software deals die, so &ldquo;keep your Tally&rdquo; is a sales asset rather than a
            limitation.
          </p>
        </div>
      </section>

      {/* Why now */}
      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="03">Why now</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">
            Four forcing functions. None of them is &ldquo;AI is exciting&rdquo;.
          </h2>
          <div className="mt-10 grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden">
            {WHY_NOW.map((x) => (
              <Reveal key={x.k} className="bg-card">
                <div className="p-7 lg:p-8 h-full">
                  <div className="font-semibold text-lg">{x.k}</div>
                  <p className="mt-2 text-sm text-muted-foreground leading-6">{x.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* The moat */}
      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="04">The moat</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">
            Ranked by how hard each is to copy, <span className="text-primary">not by how good it sounds.</span>
          </h2>
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

      {/* Competitive frame */}
      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-5xl mx-auto">
          <SectionLabel n="05">Competitive frame</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 mb-8 max-w-2xl">
            Everyone in this list is real, and none of them does this.
          </h2>
          <div className="grid gap-px bg-border border rounded-2xl overflow-hidden">
            {COMPETITIVE.map(([who, does, doesnt]) => (
              <div key={who} className="bg-card p-6 grid md:grid-cols-[1fr_1fr_1fr] gap-3 md:gap-6">
                <div className="font-medium">{who}</div>
                <div className="text-sm text-muted-foreground">{does}</div>
                <div className="text-sm text-muted-foreground">{doesnt}</div>
              </div>
            ))}
            <div className="bg-primary/5 p-6 grid md:grid-cols-[1fr_2fr] gap-3 md:gap-6">
              <div className="font-medium text-primary">MNB Cortex</div>
              <div className="text-sm">
                Watches the rows daily, names the specific risk, drafts and sends the action, and proves what came back.
                Deliberately does not replace the accounting system.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Model */}
      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden">
          <div className="bg-card p-7 lg:p-9">
            <SectionLabel n="06">Business model</SectionLabel>
            <p className="mt-4 text-muted-foreground leading-7">
              Usage-priced credits from a ₹149 pack with no subscription, plans from ₹799 to ₹39,999 a month with a
              monthly allowance, and credit pooling so a firm can buy once and spend across client workspaces. Payments
              are live via Cashfree. The free health check needs no card.
            </p>
            <p className="mt-4 text-sm text-muted-foreground leading-6">
              Margin is enforced in code: the AI cost of each mode is modelled per credit so a plan cannot be priced
              below what it costs to serve. That check is how video generation was found to be loss-making at ₹270 a
              clip.
            </p>
          </div>
          <div className="bg-card p-7 lg:p-9">
            <SectionLabel n="07">Expansion</SectionLabel>
            <ol className="mt-4 space-y-3 text-muted-foreground leading-7 list-decimal pl-5">
              <li><span className="text-foreground font-medium">Warn</span> — the free check and the first import. Trust, in one screen.</li>
              <li><span className="text-foreground font-medium">Act</span> — collections, the weekly plan, the compliance calendar.</li>
              <li><span className="text-foreground font-medium">Become the record of decisions</span> — memory, the action board, the recovery ledger. Switching cost.</li>
              <li>
                <span className="text-foreground font-medium">Underwrite</span> — a business whose receivables, payables
                and statutory position are verified daily is a business a lender can price.{" "}
                <span className="text-foreground">Stated as a thesis with a prerequisite — thousands of workspaces with
                continuous data — not as a roadmap item with a date.</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* What has to become true */}
      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-5xl mx-auto">
          <SectionLabel n="08">What has to become true</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 max-w-3xl">
            The product is deep. The company is early. Both are worth saying out loud.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-3xl leading-7">
            There is no revenue chart on this page, because we will not publish a number the product cannot reproduce on
            demand. This repository runs a suite whose entire job is stopping published claims from drifting from the
            code; the same standard applies here. These are the metrics that decide whether this works, and where each
            one honestly stands.
          </p>
          <div className="mt-8 grid gap-px bg-border border rounded-2xl overflow-hidden">
            {SCOREBOARD.map(([metric, why, status]) => (
              <div key={metric} className="bg-card p-5 grid md:grid-cols-[1.2fr_1fr_1fr] gap-2 md:gap-6">
                <div className="font-medium text-sm">{metric}</div>
                <div className="text-sm text-muted-foreground">{why}</div>
                <div className="text-sm text-muted-foreground">{status}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="09">Team</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 max-w-3xl">
            Built by MNB Research — the team behind AbroBot.
          </h2>
          <p className="mt-6 text-muted-foreground max-w-3xl leading-7">
            MNB Research is an Indian business growth and consultancy firm, featured on Shark Tank India and
            DPIIT-recognised. Its first AI product, AbroBot, is a study-abroad platform built on the same pattern: a
            deep vertical, real operational data, and AI doing work rather than answering questions. Cortex applies that
            to a far larger market.
          </p>
          <p className="mt-4 text-sm text-muted-foreground max-w-3xl leading-6">
            AbroBot&rsquo;s own metrics are its own; they are evidence that this team ships and distributes an AI product
            in India, and they are not presented as Cortex traction.
          </p>
        </div>
      </section>

      {/* The ask */}
      <section className="px-5 lg:px-10 py-24 border-t text-center">
        <div className="max-w-3xl mx-auto">
          <SectionLabel n="10">The ask</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5">
            Fund the distribution, not the demo.
          </h2>
          <p className="mt-5 text-muted-foreground text-lg leading-8">
            The product is live, self-serve, and deeper than it needs to be for the wedge it sells. What it has not yet
            had is a go-to-market: firms signed as a channel, the health check put in front of owners at volume, and the
            outcome metrics above turned from instrumented into proven.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="/investor-onepager.pdf"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium"
              data-cursor
            >
              <Download className="h-4 w-4" /> Download one-pager
            </a>
            <a
              href="mailto:contact@mnbresearch.com"
              className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors"
            >
              contact@mnbresearch.com
            </a>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            MNB Research · operated by Abrobot Technologies (Pvt Ltd), Delhi, India · +91 97114 88481
          </p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
