import Link from "next/link";
import { ArrowUpRight, CalendarClock, Info } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { DEADLINE_TOPICS, rulesFor, whenText } from "@/lib/deadline-seo";
import { STATUTORY_CATALOGUE } from "@/lib/statutory";

/*
  THE COMPLIANCE CALENDAR — the hub the thirteen topic pages hang off.

  Two jobs. For a reader: the whole year on one screen, monthly obligations
  separated from annual ones, because those are two different kinds of worry.
  For a crawler: a single page that links every deadline page, so none of them
  is an orphan reachable only from the sitemap.

  Every row is rendered from STATUTORY_CATALOGUE. The count in the standfirst
  is `STATUTORY_CATALOGUE.length` rather than a number typed here — that is the
  same discipline scripts/test-claims.mjs enforces on the marketing pages, and
  this page would otherwise be the easiest place in the codebase for a stale
  figure to reappear.
*/

const url = "https://cortex.mnbresearch.com/deadlines";
const description =
  "Every GST, TDS, PF, advance tax, ITR and ROC date an Indian business has to keep, on one page — with who each one actually applies to.";

export const metadata = {
  title: "Indian statutory compliance calendar — every due date | MNB Cortex",
  description,
  alternates: { canonical: url },
  openGraph: { title: "Indian statutory compliance calendar", description, url, type: "website" as const },
  twitter: { card: "summary_large_image" as const, title: "Indian statutory compliance calendar", description },
};

/** Which topic page covers a given rule, so every row can link somewhere. */
function topicForRule(id: string) {
  return DEADLINE_TOPICS.find((t) => t.ids.includes(id)) || null;
}

export default function DeadlinesHub() {
  const monthly = STATUTORY_CATALOGUE.filter((r) => r.cadence === "monthly").sort((a, b) => a.day - b.day);
  const annual = STATUTORY_CATALOGUE.filter((r) => r.cadence === "annual")
    .sort((a, b) => (a.month || 0) - (b.month || 0) || a.day - b.day);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Indian statutory compliance calendar",
    itemListElement: DEADLINE_TOPICS.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.h1,
      url: `https://cortex.mnbresearch.com/deadlines/${t.slug}`,
    })),
  };

  const Row = ({ r }: { r: (typeof STATUTORY_CATALOGUE)[number] }) => {
    const t = topicForRule(r.id);
    const inner = (
      <>
        <div className="min-w-0">
          <div className="font-medium">{r.name}</div>
          <div className="text-sm text-muted-foreground truncate">{r.what}</div>
          <div className="text-xs text-muted-foreground mt-1">Applies if {r.appliesIf}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-lg tracking-tightest tabular-nums">{whenText(r)}</div>
          {t && <div className="text-xs text-primary mt-0.5">Read more</div>}
        </div>
      </>
    );
    const cls = "flex items-start justify-between gap-4 p-4 lg:p-5 bg-card";
    return t
      ? <Link href={`/deadlines/${t.slug}`} className={`${cls} hover:bg-accent transition-colors`}>{inner}</Link>
      : <div className={cls}>{inner}</div>;
  };

  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-14">
        <div className="max-w-5xl mx-auto">
          <div className="eyebrow">Compliance calendar</div>
          <Kinetic as="h1" text={"Every date that\ncosts you if you miss it."} className="font-display display-1 tracking-tightest mt-5" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            The {STATUTORY_CATALOGUE.length} statutory obligations an Indian business is measured against — GST, TDS, PF and
            ESI, advance tax, the income tax return and the ROC filings. Each one says who it actually applies to, because
            most of them will not apply to you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/health-check" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">
              Free health check
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>
              Get warned before each one <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-8">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="row-meta text-sm tabular-nums text-muted-foreground">01</span>
              <h2 className="font-display text-2xl lg:text-3xl tracking-tightest">Every month</h2>
            </div>
            <div className="rounded-2xl border overflow-hidden grid gap-px bg-border">
              {monthly.map((r) => <Row key={r.id} r={r} />)}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-16">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="flex items-baseline gap-3 mb-4 mt-6">
              <span className="row-meta text-sm tabular-nums text-muted-foreground">02</span>
              <h2 className="font-display text-2xl lg:text-3xl tracking-tightest">Once or four times a year</h2>
            </div>
            <div className="rounded-2xl border overflow-hidden grid gap-px bg-border">
              {annual.map((r) => <Row key={r.id} r={r} />)}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Guides — the crawlable index of the thirteen topic pages. */}
      <section className="px-5 lg:px-10 pb-20 border-t">
        <div className="max-w-5xl mx-auto pt-12">
          <div className="eyebrow mb-4">Due date guides</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DEADLINE_TOPICS.map((t) => (
              <Link key={t.slug} href={`/deadlines/${t.slug}`} className="rounded-2xl border p-5 bg-card hover:border-primary/40 transition-colors">
                <div className="font-display text-lg tracking-tightest">{t.h1}</div>
                <div className="text-xs text-muted-foreground mt-1.5">
                  {rulesFor(t).map((r) => whenText(r)).join(" · ")}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-3xl mx-auto text-center">
          <CalendarClock className="h-8 w-8 text-primary mx-auto" aria-hidden="true" />
          <h2 className="font-display display-3 tracking-tightest mt-5">A calendar does not chase you.</h2>
          <p className="mt-4 text-muted-foreground">
            {/*
              This sentence used to end "the cash that has to be there on the
              20th" — a hardcoded reference to GSTR-3B's day, in prose, which
              would have gone silently wrong the day that rule moved. Caught by
              scripts/test-seo-pages.mjs, which is exactly what it is for.
            */}
            Cortex watches these dates against your own numbers — the receivables that fund the payment, the suppliers past
            the MSME 45-day mark, the cash that has to be there on the day — and emails you before it costs you.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>
              Get started <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/pricing" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">
              See pricing
            </Link>
          </div>
          <p className="mt-8 text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            General information, not tax advice. Dates are extended from time to time — confirm against the official portal.
          </p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
