import Link from "next/link";
/* Two icons, down from thirty-two. The other thirty went to /features with the
   grid that used them — worth noticing as a proxy for how much of this page
   was inventory rather than argument. */
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { Reveal, CountUp, RotatingWord } from "@/components/landing-extras";
import { SmoothScroll, Cursor, Kinetic, SectionLabel, Marquee, Magnetic, Faq } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { ProductPreview } from "@/components/product-preview";
import { AskCortexDemo } from "@/components/demo";
import { IndustryPicker } from "@/components/industry-picker";
import { PLAYBOOKS } from "@/lib/playbooks";
import { INDUSTRIES } from "@/lib/industries";
import { HealthCheckClient } from "@/components/health-check-client";

/*
  ORDERED BY WHAT STOPS THE SALE, not by what is interesting to explain.

  This list used to open with "How is this different from an ERP or CRM?" — a
  category question, and one only a reader who has already decided to take the
  product seriously will ask. The questions that actually stand between an SME
  owner and signing up are all about effort and risk, and they were at
  positions three and five or missing entirely.

  So: setup time, then what they do daily, then whether it touches their books,
  then whether it can embarrass them in front of a customer. The positioning
  question comes after, for the reader still there.
*/
const FAQS = [
  { q: "How long does setup take?", a: "Minutes, not weeks. Create the workspace, drop in a CSV export from Tally, Vyapar, Busy or your spreadsheet, and the first finding appears on that same screen. There is no column mapping, no configuration and nobody to book a call with. If you'd rather not use your own file yet, load a sample dataset in one click." },
  { q: "What do I have to do every day?", a: "Nothing. Cortex re-reads your numbers overnight on its own. You get one planned email a week — the three things worth your attention — and beyond that it only writes to you when something has actually gone wrong. You don't have to log in to keep it working." },
  { q: "Do I have to stop using Tally or my accountant?", a: "No. Keep both. Cortex never becomes your books and never writes to them — it reads an export and sits on top. Your accountant carries on exactly as before, and most of them prefer a client who spots the 45-day MSME problem before year end." },
  { q: "Will it contact my customers on its own?", a: "Not unless you let it. Chasing ships switched off. When you turn it on, Cortex writes each message in your business's name and holds it for your approval — and stops the moment the invoice is marked paid. There is a setting to let it send unattended, off by default, and it's yours to decide." },
  { q: "Do I need to be technical?", a: "No. You ask questions in plain language — English or Hinglish — the way you'd ask your accountant, and Cortex looks up your actual invoices and orders to answer. Nothing to install, nothing to code." },
  { q: "How is this different from an ERP or CRM?", a: "Those record what already happened and wait for you to open them. Cortex reads across all of it every day, names the specific thing about to cost you money, and drafts the action. It doesn't replace them — it does the part they were never built to do." },
  { q: "Is my data safe?", a: "Yes. Every workspace is isolated with Postgres row-level security, traffic is encrypted with TLS, sensitive keys use AES-256-GCM, and you can export or delete your data anytime." },
  { q: "How does billing work?", a: "Cortex runs on credits. Buy a ₹149 pack and use it with no subscription, or pick a plan from ₹799/mo for a monthly allowance — billed securely via Cashfree. Your free Business Health Check needs no card at all. Prices are in INR; international customers are onboarded by our team." },
];

/*
  Stats now describe the WATCHING, not the inventory.

  "130+ modules" and "300+ agents" are true and were the wrong thing to lead
  with: breadth reads as a free-tools site and invites the question "do I need
  130 things?" A prospect deciding in five seconds needs to know what Cortex
  looks at on their behalf.
*/
/*
  EVERY NUMBER HERE HAS TO BE CHECKABLE AGAINST CODE, and two were not.

  "1 email a week — that's it" counted only the Monday plan. A workspace also
  receives alert digests (daily-capable, lib/alert-delivery), the weekly brief,
  renewal notices, lifecycle nudges and collections mail. "That's it" was
  therefore false, and falsifiable by the customer's own inbox in week two.
  What is true is the SCHEDULED volume: one planned email a week, and anything
  beyond it means something actually happened. That is the real promise anyway
  — nobody is reassured by a cap, they are reassured by not being spammed.

  "3 min to your first warning" was flatly unachievable when it was written.
  Alerts reach the customer through the 04:30 UTC cron with a 20-hour floor, so
  the first warning was up to a day away, and this sat next to an email stat
  which is what a reader would assume it meant. A prospect could disprove it
  with a stopwatch on day one.

  It is true NOW, for a different reason and only on a specific path: the
  import screen awaits the recompute and renders the worst finding in place
  (lib/import-outcome, components/csv-import). So the warning genuinely appears
  seconds after the file is read — and the label now says which path that is,
  rather than implying it of email.

  If the import ever stops awaiting recomputeAndReport, this number becomes a
  lie again. That is what scripts/test-claims.mjs is for.
*/
const STATS = [
  { to: 45, suffix: "-day", label: "MSME clock, watched" },
  { to: 19, suffix: "", label: "statutory deadlines tracked" },
  { to: 1, suffix: "", label: "planned email a week — the rest only when something breaks" },
  { to: 3, suffix: " min", label: "from your first import to your first warning" },
];

/*
  THREE STEPS — because the objection that loses this sale is not "I don't
  believe you", it is "this looks like work".

  An owner running a ₹4 crore distribution business has been sold software
  before. What they remember is the implementation: the consultant, the column
  mapping, the six weeks, the training, the thing they stopped using. Every
  capability listed further down this page reads, to that person, as more of
  that. So the effort has to be answered before the value, and it has to be
  answered in a number they can hold: three.

  EVERY LINE HERE IS A CLAIM ABOUT WORK THE USER DOES OR DOES NOT HAVE TO DO,
  and each one is checkable:

    no column mapping    lib/import-map.ts resolveHeaders() matches headers
                         against alias lists; csv-import.tsx renders the result
                         and offers no control to change it
    finding on the same  lib/actions.ts awaits recomputeAndReport() and returns
    screen               topWarning(insights) — see the guard in test-claims
    approval by default  lib/collections DEFAULT_POLICY is enabled:false and
                         auto_send:false; sendApproved() filters status
                         'approved'
    nothing daily        /api/cron/autopilot, 04:30 UTC, sweeps without the
                         owner touching anything

  The `did` field is deliberately phrased as what the OWNER does. "AI analyses
  your data" is a sentence about the software; "you do nothing" is a sentence
  about them, and it is the one being bought.
*/
const HOW = [
  {
    n: "01",
    t: "Send it the file you already have",
    d: "Export from Tally, Vyapar, Busy or your spreadsheet and drop the CSV in. Cortex reads your column names itself — there is no mapping screen, nothing to configure, nothing to type in again.",
    you: "Two minutes. Or load a sample and skip even that.",
    /* UI chrome, not business data — the words this screen genuinely prints.
       No rupee figures: an invented number in a mockup is still an invented
       number, which is why three testimonials and a "₹8.4L" line are gone from
       this file. */
    chip: ["invoices.csv", "Tally export recognised", "Matched 6 of 7 columns"],
  },
  {
    n: "02",
    t: "Read the one thing that matters",
    d: "Before you go anywhere else, the same screen names the worst thing in what you just sent — which customer, how much, how late — and links straight to it.",
    you: "You read one sentence.",
    chip: ["The first thing to look at", "→ Open it"],
  },
  {
    n: "03",
    t: "Say yes",
    d: "Cortex writes the chasing email in your business's name and shows it to you. You approve it, it sends, and it stops the moment that invoice is marked paid.",
    /* Kept to one line at card width so the three chip rows sit level. */
    you: "One click — and it ships switched off.",
    chip: ["Draft", "Approve", "Sent"],
  },
];

// Problem-specific: the day-to-day reality of running an SME, and how Cortex changes it.
const OLD_NEW = [
  { old: "You find out a customer hasn't paid when you need the cash.", now: "Cortex emails you the day an invoice crosses its due date — with the name and the number." },
  { old: "You pay a small supplier late and lose the deduction at year end.", now: "It watches the MSME 45-day clock (43B(h)) and tells you which bills to clear first." },
  { old: "A GST or TDS date passes and you find out from a notice.", now: "Every statutory deadline that applies to you, warned before — not after." },
  { old: "Your numbers live in Tally, spreadsheets and WhatsApp.", now: "Upload the export. Cortex reads Tally, Vyapar and Busy files as they come." },
  { old: "You're too busy running the business to sit and analyse it.", now: "One email on Monday: the three things worth your attention this week." },
  /*
    WAS a line about a CA opening thirty files. True, and it made a
    cross-industry system read as accounting software — which is the single
    biggest thing wrong with how this product was being described. Firms are a
    CHANNEL (see the audience section, and docs/positioning.md §4); they are
    not the frame. What replaces it is the problem every industry here shares.
  */
  { old: "Every tool shows you a different version of the truth.", now: "One workspace reads all of it together — orders, invoices, stock, ledger — and answers from your own rows." },
];







/*
  EMPTY, DELIBERATELY.

  This held three quotes — including "It caught a stockout nine days early and
  drafted the PO", a specific performance claim — attributed to "Distributor",
  "Manufacturing owner" and "D2C founder". There is no CMS, no table and no
  source file behind them: they were written, not collected.

  An invented testimonial is an unfair trade practice under the Consumer
  Protection Act 2019, and the ASCI guidelines require testimonials to be
  genuine and substantiable. It is also the single easiest thing for a
  competitor to report.

  Put real ones here when there are real ones — name, business, and something
  they actually said. Until then the section does not render, which is a
  smaller loss than it looks: nobody believes anonymous praise anyway.
*/
const TESTI: { q: string; n: string }[] = [];

/*
  THE OBJECTIONS, ANSWERED IN THE OWNER'S WORDS — this replaced "The moat".

  That section ran four cards headed "Anyone can wrap an AI. This can't be
  copied", arguing compounding data advantage, unified architecture and
  defensibility against latecomers. Every word of it is aimed at somebody
  deciding whether to INVEST in this company. An owner deciding whether to
  spend ₹799 does not care whether we can be copied; a competitive moat is, if
  anything, a reason to worry about lock-in.

  The argument itself is good and is not lost — it lives in full on /investors
  and in docs/positioning.md §4, which is where the reader it was written for
  actually is.

  What belongs in this slot on a page selling to a buyer is the thing standing
  between them and signing up, and it is never "is this defensible". It is "how
  much of my time is this going to eat, and what happens if it goes wrong".
  Each answer below is a fact about the code, noted where it is not obvious.
*/
const OBJECTIONS = [
  {
    q: "Do I have to move off Tally?",
    a: "No, and you shouldn't. Keep invoicing and filing exactly where you do it now. Cortex reads the export — it never asks to become your books, and nothing you do here changes them.",
  },
  {
    q: "Do I have to learn something?",
    a: "There is nothing to learn. Ask it a question in English or Hinglish the way you'd ask your accountant, and it looks up your actual rows to answer. If you can read the answer, you can use the product.",
  },
  {
    /* The honest version. DEFAULT_POLICY is enabled:false, auto_send:false —
       so the guarantee is real, and it is a default rather than a law. Saying
       "never without you" flatly is what the collections screen used to do,
       and the setting that contradicts it is one checkbox away. */
    q: "Will it email my customers behind my back?",
    a: "It can't, until you switch chasing on — it ships off. Once on, it writes each message and waits for you to approve it. There is a setting to let it send unattended, and it is yours to turn on, not ours.",
  },
  {
    q: "My data is a mess. Will it cope?",
    a: "It matches your column headings however you've spelled them, recognises Tally, Vyapar and Busy exports on sight, and tells you plainly which columns it couldn't find rather than quietly importing blanks.",
  },
  {
    /*
      A real, checkable offer, and a better one than the "free trial" this page
      used to advertise and does not have (TRIAL_DAYS = 0). PAYWALL_ALLOW lets
      an unpaid workspace reach /onboarding, /import, /receivables and
      /dashboard, so importing your own file and seeing your own overdue list
      genuinely costs nothing.
    */
    q: "Do I have to pay to find out if it works?",
    a: "No. The 60-second health check needs no account at all. And after you sign up you can import your own file and see your own dashboard and overdue list before you buy anything — it's your numbers that should convince you, not ours.",
  },
  {
    q: "What if I want out?",
    a: "Export everything and delete the workspace whenever you like. Your accounting system is untouched, because it was never involved. There is nothing to migrate back.",
  },
];


export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      {/* ---------- HERO ----------
        CENTRED, AND DOWN TO FOUR ELEMENTS.

        The old hero had eight: an eyebrow, a two-line headline, a paragraph, two
        buttons, a rotating phrase, a link and a three-item badge row, arranged
        left-aligned in a two-column grid. Every one of them was defensible on
        its own and together they gave the eye nowhere to land. A first screen
        has one job — say what this is and offer one thing to do about it — and
        eight competing elements is how a reader ends up doing none of them.

        What is left: what it is, one sentence, one action. The rotating phrase
        and the trust badges were not deleted, they moved below the fold where
        they are read rather than skimmed past.

        Centred because it is a stronger, simpler composition for a short
        headline, and because the product screenshot underneath then sits
        symmetrically beneath it instead of fighting a left-aligned column.
      */}
      <section className="relative px-5 lg:px-10 pt-32 lg:pt-40 pb-16 overflow-hidden noise">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="aurora opacity-60" aria-hidden />
        {/* The horizon. A perspective floor behind the fold gives the page a
            depth cue that a flat gradient cannot, and it is masked to nothing
            long before it reaches any text. */}
        <div className="deck absolute inset-x-0 bottom-0 h-72 opacity-70" aria-hidden />

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2.5 rounded-full glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            The early-warning system for Indian businesses
          </div>

          <Kinetic
            as="h1"
            text={"Your books tell you what happened.\nCortex tells you what's about to."}
            className="font-display display-hero tracking-tightest mt-7 text-balance"
          />

          <p className="mt-7 text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto leading-8">
            Send it one export from Tally, Vyapar or your spreadsheet. It watches your numbers every day and
            tells you <span className="text-foreground font-medium">who hasn&rsquo;t paid</span>,{" "}
            <span className="text-foreground font-medium">what&rsquo;s due</span> and{" "}
            <span className="text-foreground font-medium">what&rsquo;s about to run out</span>.
          </p>

          {/* Full-bleed on a phone, side by side from sm up. A centred pill
              button at 200px wide on a 390px screen is a small target floating
              in a lot of nothing, and this is the only thing the hero asks for. */}
          <div className="mt-9 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center sm:justify-center gap-3">
            <Magnetic>
              <Link href="/login" className="flex sm:inline-flex items-center justify-center gap-2 rounded-full btn-ink px-7 h-12 text-sm font-medium" data-cursor>
                Start with one file <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Magnetic>
            <Link href="/health-check" className="flex sm:inline-flex items-center justify-center gap-2 rounded-full border px-7 h-12 text-sm font-medium hover:bg-accent transition-colors">
              Free 60-second check <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="mt-5 text-sm text-muted-foreground">No card. Keep your accounting software.</p>
        </div>
      </section>

      {/* ---------- SEE IT WORK ----------
        The one screen where the product itself is the argument, so it gets the
        whole width and nothing next to it competing for attention. */}
      <section className="relative px-5 lg:px-10 pb-20">
        {/*
          min-w-0 ON THE GRID CHILDREN, because without it this section was
          431px wide inside a 390px phone.

          A CSS grid item defaults to `min-width: auto`, which means it refuses
          to shrink below the widest thing inside it — here the chat bubbles and
          the fake input row of the demo card. The track therefore grew past the
          viewport, `overflow-x-hidden` on <main> silently clipped the right
          edge, and the first thing a phone visitor saw was a product screenshot
          with its side cut off. Invisible on a laptop, which is why it survived.
        */}
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-5 items-stretch">
          <Reveal className="min-w-0"><AskCortexDemo /></Reveal>
          <Reveal delay={120} className="min-w-0"><ProductPreview /></Reveal>
        </div>

        {/*
          The rotating watch-list and the credentials, moved down out of the
          hero. Same content, read properly instead of skimmed.

          The rotating phrase replaced "This week it caught ₹8.4L of deductions
          at risk" — present tense, a rupee figure, above the fold, and entirely
          invented: no query, no telemetry, nothing that could substantiate it.
          An unsubstantiated performance claim is an unfair trade practice under
          the Consumer Protection Act 2019 and ASCI requires substantiation on
          demand. What is here instead says what Cortex LOOKS FOR, each item
          checkable against code: lib/msme.ts, lib/receivables, lib/statutory.ts
          and lib/reorder.
        */}
        <div className="max-w-6xl mx-auto mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground text-center">
          <span>It watches for <RotatingWord words={["deductions at risk under 43B(h).", "invoices past their due date.", "the next statutory deadline.", "stock about to run out."]} /></span>
        </div>
        <div className="max-w-6xl mx-auto mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-muted-foreground">
          <span>★ Shark Tank India featured</span>
          <span>◆ DPIIT-recognised startup</span>
          {/*
            WAS "10,000+ businesses served", against MNB Research's own published
            figure of 50+ in config.ts — a 200x overstatement shipping in the same
            repo as the number it contradicts.
          */}
          <span>◇ Built for Indian SMEs · GST, TDS and 43B(h) native</span>
        </div>
      </section>

      {/* ---------- THREE STEPS ----------
        PLACED HERE ON PURPOSE, before the problem section and long before the
        feature list.

        The reader has just seen the hero and a live demo, and the next thought
        is not "what else does it do" — it is "what would this cost me in time".
        Everything below this point is easier to read once that is settled, and
        the feature inventory further down actively damages the page if it is
        the first answer they get.

        See the note on HOW above for what each claim rests on.
      */}
      <hr className="rule-glow max-w-7xl mx-auto" />
      <section id="how" className="px-5 lg:px-10 py-20 lg:py-24">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="01">How it works</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">
            Three steps.<br /><span className="text-primary">Then you stop doing anything.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl leading-7">
            No setup project. No consultant. No columns to map, no rules to write, no dashboard to build.
            If you can email a file, you can run this.
          </p>

          <div className="mt-12 grid md:grid-cols-3 gap-px bg-border border rounded-2xl overflow-hidden hairline">
            {HOW.map((s) => (
              <div key={s.n} className="bg-card p-7 lg:p-8 flex flex-col">
                <div className="font-display text-4xl tracking-tightest text-primary">{s.n}</div>
                <div className="mt-4 font-display text-2xl tracking-tightest">{s.t}</div>
                <p className="mt-3 text-sm text-muted-foreground leading-6 flex-1">{s.d}</p>

                {/* The shape of the screen, not a claim about anyone's numbers.
                    aria-hidden because it is decorative: the sentence above
                    already carries the whole meaning for a screen reader. */}
                <div className="mt-6 rounded-lg border bg-background p-3 flex flex-wrap gap-1.5" aria-hidden="true">
                  {s.chip.map((c) => (
                    <span key={c} className="rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{c}</span>
                  ))}
                </div>

                <div className="mt-4 text-sm font-medium text-foreground">{s.you}</div>
              </div>
            ))}
          </div>

          {/*
            THE FOURTH BEAT, and the one that actually sells it.

            Three steps is the onboarding. What an owner is buying is the day
            after: that this keeps happening without them. The cron is real
            (vercel.json, 04:30 UTC) and the cadence is deliberately stated as
            the SCHEDULED volume — one planned email a week — because the
            alternative phrasing, "one email a week", is disprovable by the
            customer's own inbox the first time something actually breaks.
          */}
          <div className="mt-10 rounded-2xl border bg-secondary/30 p-7 lg:p-9">
            <div className="font-display text-2xl lg:text-4xl tracking-tightest max-w-3xl leading-[1.15]">
              After that, the honest answer to &ldquo;what do I do every day?&rdquo; is{" "}
              <span className="text-primary">nothing.</span>
            </div>
            <p className="mt-4 text-muted-foreground max-w-2xl leading-7">
              Cortex re-reads your numbers overnight. One planned email a week — the three things worth your
              attention — and beyond that it only writes to you when something has actually gone wrong.
              You don&rsquo;t log in to keep it running. You log in because it told you to.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- MARQUEE ----------
        A LOGO WALL IS AN INTEGRATION CLAIM, whatever the surrounding words say.

        This scrolled sixteen names — Odoo, HubSpot, Salesforce, Slack,
        SendGrid, QuickBooks, Freshdesk, Calendly — of which four sync. Nobody
        reads a marquee as "tools whose API keys we can store"; it reads as
        "works with these", which is the conventional meaning and is what makes
        it a claim rather than decoration.

        Now it names only what Cortex genuinely reads: the four live syncs, the
        export formats the importer actually parses (lib/import-map), and
        WhatsApp, which works through the customer's own Meta account. Shorter,
        and every item survives being asked "show me".
      */}
      <section className="py-6 border-y bg-secondary/30 font-display text-2xl lg:text-3xl tracking-tightest">
        <Marquee items={["Tally exports", "Vyapar exports", "Busy exports", "Shopify", "Razorpay", "Stripe", "Google Sheets", "WhatsApp Business", "CSV"]} />
      </section>

      {/* ---------- THE PROBLEM ---------- */}
      <section className="px-5 lg:px-10 py-24 lg:py-32">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="02">The problem</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">Running an SME shouldn&rsquo;t mean flying blind.</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl">You&rsquo;re the CEO, CFO, head of sales and firefighter — all at once. Cortex takes the analysis and the busywork off your plate.</p>
          <div className="mt-12 grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden hairline">
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

      {/*
        ---------- FREE BUSINESS HEALTH CHECK (lead magnet) ----------

        Placed here on purpose. The section directly above has just walked the
        reader through the problems Cortex watches for; this is the moment they
        are wondering how bad their own numbers are. Asking them to score
        themselves at that point converts far better than a link in a footer.

        This check already existed at /health-check and was reachable only from
        a text link most visitors never scrolled to. Six questions, a score, and
        a named list of their weak areas — the score is computed in the browser
        so the visitor sees a real answer before being asked for anything.

        The form then captures name, phone and email and posts to /api/inquiry,
        which stores the lead and emails the operator with the score and the
        specific weak areas attached, so the first call can open on their actual
        problem instead of a pitch.
      */}
      <hr className="rule-glow max-w-7xl mx-auto" />
      <section id="health-check" className="px-5 lg:px-10 py-24 lg:py-28 bg-secondary/20">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-16 items-start">
          <div>
            <SectionLabel n="03">Free · 60 seconds</SectionLabel>
            <h2 className="font-display display-3 tracking-tightest mt-6 leading-[1.1]">
              How healthy is <span className="text-primary">your</span> business, really?
            </h2>
            <p className="mt-5 text-muted-foreground leading-7 max-w-lg">
              {/*
                WAS "no sales call unless you ask for one" — beside a form
                whose phone field is `required` and whose own helper text says
                "We use your number to walk you through the report", and which
                emails the lead straight to the operator.

                The contradiction lived inside one flow, two screens apart.
                Keeping the phone is the right call — this is the warmest lead
                in the funnel and the whole point of the health check — so the
                promise changes to match the behaviour rather than the other
                way round.
              */}
              Six questions. No signup, no card. We&rsquo;ll call once to walk you through it — tell us not to and we won&rsquo;t. You get a Business Health
              Score out of 100, the specific areas putting you at risk, and exactly what to do about each one.
            </p>
            <ul className="mt-7 space-y-3 text-sm">
              {[
                "Your score and risk band, instantly",
                "The weak areas named, not hinted at",
                "A fix plan mapped to the tools that solve it",
                "The full report emailed to you",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span className="text-muted-foreground">{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-7 text-xs text-muted-foreground">
              Used by owners across manufacturing, retail, distribution and services.
            </p>
          </div>
          <HealthCheckClient />
        </div>
      </section>

      {/* ---------- STATEMENT ---------- */}
      <hr className="rule-glow max-w-7xl mx-auto" />
      {/* The one section that is pure statement — so it gets the sheen, and it
          is the only thing on the page that does. Ambient motion works by being
          scarce; two of these and neither is special. */}
      <section className="relative px-5 lg:px-10 pb-24 lg:pb-32 pt-24 lg:pt-32 sheen">
        <div className="relative z-10 max-w-7xl mx-auto">
          <SectionLabel n="04">What it is</SectionLabel>
          <Reveal>
            {/*
              THE POSITION, IN ONE PARAGRAPH. See docs/positioning.md §1.

              The old version said "monitors, predicts, recommends and
              executes … and gets sharper every week", which is four verbs and
              a promise. What a buyer needs is the specific shape of the thing:
              it reads THEIR numbers, names a SPECIFIC risk, and DOES something
              — and it does not replace what they already run, which is a sales
              asset rather than a limitation.
            */}
            <p className="font-display display-3 tracking-tightest mt-8 max-w-5xl leading-[1.15]">
              Your accounting software records what happened. A dashboard waits for you to open it.{" "}
              <span className="text-primary">Cortex reads your own numbers every day, names the thing that is about to cost you money — the customer, the amount, the date — and then does something about it.</span>
            </p>
            <p className="mt-6 text-muted-foreground max-w-3xl leading-7">
              It is the layer between your books and your business. You keep Tally, Vyapar or your spreadsheets;
              Cortex is the part they were never built to do.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---------- PLAYBOOKS ----------
        THE UNIT THE BUYER ACTUALLY WANTS.

        128 modules is a true number and a bad opening line: breadth reads as a
        free-tools site, and an owner deciding in five seconds is not asking
        "how much is there?" — they are asking "what will this do for me on
        Tuesday?". A playbook answers that in their own language: what it
        watches, what it does about it.

        Every card is generated from lib/playbooks.ts, and every entry there
        names the module that implements it. scripts/test-claims.mjs fails if
        one points at a module that does not exist — because a "templates"
        section written by hand is exactly where invented features come back.
      */}
      <hr className="rule-glow max-w-7xl mx-auto" />
      <section id="playbooks" className="px-5 lg:px-10 py-24 lg:py-32">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="05">Playbooks</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">
            You don&rsquo;t configure it.<br />The playbooks are <span className="text-primary">already running.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl leading-7">
            Import your file and {PLAYBOOKS.length} playbooks start watching the same day — each one a specific thing that costs
            Indian businesses money, with the action attached. No rules to write, no dashboard to build.
          </p>

          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border border rounded-2xl overflow-hidden hairline">
            {PLAYBOOKS.map((p) => (
              <div key={p.id} className="bg-card p-6 lg:p-7 hover:bg-accent/30 transition-colors flex flex-col">
                <div className="font-display text-xl lg:text-2xl tracking-tightest">{p.name}</div>
                <div className="mt-4 space-y-3 text-sm flex-1">
                  <div>
                    <div className="eyebrow text-[10px]">Watches</div>
                    <p className="text-muted-foreground leading-6 mt-1">{p.watches}</p>
                  </div>
                  <div>
                    <div className="eyebrow text-[10px]">Does</div>
                    <p className="text-muted-foreground leading-6 mt-1">{p.does}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-1.5">
                  {p.industries.length === 0
                    ? <span className="rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">Every business</span>
                    : p.industries.map((i) => (
                        <span key={i} className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{i}</span>
                      ))}
                </div>
              </div>
            ))}
          </div>

          {/*
            WHAT "AI-NATIVE" MEANS HERE, said precisely — because the phrase is
            usually empty, and because the distinction is the product.

            A model that is asked to compute a statutory deadline will
            eventually get one wrong, and a wrong tax date destroys the trust
            everything else depends on. So the rules decide, the model reads
            and writes, and the product acts. See lib/playbooks.ts.
          */}
          <div className="mt-12 grid md:grid-cols-3 gap-px bg-border border rounded-2xl overflow-hidden hairline">
            {[
              { k: "Rules decide", d: "The 45-day MSME window, the statutory calendar, ageing, reorder points — arithmetic over your own rows, in tested code. Not a prompt, because a wrong tax date is worse than no product." },
              { k: "The model reads and writes", d: "It looks up your actual invoices and orders, explains what it found in plain English or Hinglish, and drafts the message you were going to have to write." },
              { k: "The product acts", d: "Draft, you approve, it sends — in your business's name — and stops the moment the invoice is marked paid. A recommendation nobody executes is a PDF." },
            ].map((x) => (
              <div key={x.k} className="bg-card p-7">
                <div className="font-display text-xl tracking-tightest">{x.k}</div>
                <p className="mt-2.5 text-sm text-muted-foreground leading-6">{x.d}</p>
              </div>
            ))}
          </div>

          {/* Breadth, shown rather than asserted. */}
          <div className="mt-10">
            <div className="eyebrow">Tuned for {INDUSTRIES.length} industries</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {INDUSTRIES.map((i: any) => (
                <Link
                  key={i.slug}
                  href={`/industries/${i.slug}`}
                  className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {i.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- THE OBJECTIONS ----------
        Was "The moat" — four cards of defensibility argument written for an
        investor and shown to a buyer. See the note on OBJECTIONS above; the
        moat argument now lives on /investors, where its reader is.
      */}
      <hr className="rule-glow max-w-7xl mx-auto" />
      <section className="px-5 lg:px-10 py-24 lg:py-32">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="06">The bit you&rsquo;re worried about</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">
            You&rsquo;ve been sold software before.<br /><span className="text-primary">This one asks almost nothing of you.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl leading-7">
            The last thing you bought needed a consultant, six weeks and someone to keep feeding it. Here is
            what this actually asks — including the parts we&rsquo;d rather not mention.
          </p>
          <div className="mt-12 grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden hairline">
            {OBJECTIONS.map((o) => (
              <div key={o.q} className="bg-card p-7 lg:p-8 hover:bg-accent/30 transition-colors">
                <div className="font-display text-xl lg:text-2xl tracking-tightest">{o.q}</div>
                <p className="mt-3 text-sm text-muted-foreground leading-6">{o.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- PROOF ---------- */}
      <section className="px-5 lg:px-10 pb-8">
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border rounded-2xl overflow-hidden hairline">
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

      {/* ---------- WHAT MOVED, AND WHY ----------
        Six sections used to sit here: a thirty-card feature grid, a ten-row
        capability list, the five-step loop, an eight-card audience grid, a
        seven-row comparison table and the ROI calculator. Together they were
        more than half the page, and they were positions twelve through
        seventeen of eighteen — which is to say nobody read them.

        They are not gone. The feature grid, the audience grid and the
        comparison table are on /features. The loop and the ten domains were
        ALREADY on /features, duplicated here. The ROI calculator moved to
        /pricing, where a reader is actually weighing the money.

        The argument for cutting is not brevity for its own sake. A landing
        page is read in one pass by somebody deciding whether to care, and
        every section after the point they have decided is a section that can
        only lose them. Depth belongs one click away, on the page whose job is
        depth, read by someone who went looking for it.
      */}
      {/* ---------- TESTIMONIALS ----------
           Hidden until there are real ones. Without this guard, emptying TESTI
           leaves a bare "In the field" heading over nothing, which looks more
           broken than having no section at all. */}
      {TESTI.length > 0 && (
      <>
      <hr className="rule-glow max-w-7xl mx-auto" />
      <section className="px-5 lg:px-10 py-24">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="◆">In the field</SectionLabel>
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
      </>
      )}

      {/* ---------- FAQ ---------- */}
      <hr className="rule-glow max-w-7xl mx-auto" />
      <section className="px-5 lg:px-10 py-24">
        <div className="max-w-3xl mx-auto">
          <SectionLabel n="07">Questions</SectionLabel>
          <h2 className="font-display display-3 tracking-tightest mt-5 mb-10">Good to know.</h2>
          <Faq items={FAQS} />
        </div>
      </section>

      {/* ---------- FINAL CTA ---------- */}
      <hr className="rule-glow max-w-7xl mx-auto" />
      <section className="px-5 lg:px-10 py-28 text-center">
        <div className="max-w-3xl mx-auto">
          {/* "Give your business a brain" describes the software. The last
              thing a reader needs at the bottom of a long page is the smallest
              possible next action, with the effort restated. */}
          <h2 className="font-display display-2 tracking-tightest">Start with one file.</h2>
          <p className="mt-5 text-muted-foreground text-lg">Create your workspace in under a minute — no card. Import an export you already have and see your own overdue list and dashboard before you pay for anything.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Magnetic>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>
                Get started <ArrowUpRight className="h-4 w-4" />
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
