import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ArrowLeft, CalendarClock, Info, AlertTriangle } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { DEADLINE_TOPICS, getDeadlineTopic, rulesFor, whenText } from "@/lib/deadline-seo";

/*
  ONE STATUTORY DEADLINE, ANSWERED PROPERLY.

  Every fact on this page is read from STATUTORY_CATALOGUE at render time —
  the day, the form, the severity, who it applies to. Nothing is typed into
  this file. A published due date that is wrong by one day is worse than
  having no page at all, because somebody will plan around it, and the only
  way to guarantee it matches the warning the product sends is to render both
  from the same array.

  DELIBERATELY NOT A "COMPLETE GUIDE".

  The temptation with a page like this is 1,500 words of padding to look
  authoritative. A person searching "GSTR-3B due date" wants the date, whether
  it applies to them, and what to do — in that order, above the fold. Padding
  it would make it rank worse and serve worse, and it would mean writing
  paragraphs of tax commentary this codebase has no business asserting.

  So the page is short, every line is load-bearing, and where a real caveat
  exists it is stated rather than smoothed over.
*/

export const dynamic = "force-static";

export function generateStaticParams() {
  return DEADLINE_TOPICS.map((t) => ({ slug: t.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const t = getDeadlineTopic(params.slug);
  if (!t) return { title: "Deadline — MNB Cortex" };
  const url = `https://cortex.mnbresearch.com/deadlines/${t.slug}`;
  return {
    title: `${t.title} | MNB Cortex`,
    description: t.description,
    alternates: { canonical: url },
    openGraph: { title: t.title, description: t.description, url, type: "article" as const },
    twitter: { card: "summary_large_image" as const, title: t.title, description: t.description },
  };
}

const SEVERITY: Record<string, { label: string; cls: string }> = {
  high: { label: "Hard deadline", cls: "bg-danger/10 text-danger border-danger/20" },
  medium: { label: "Plan ahead", cls: "bg-warning/10 text-warning border-warning/20" },
  low: { label: "Applies to some", cls: "bg-secondary text-muted-foreground" },
};

export default function DeadlinePage({ params }: { params: { slug: string } }) {
  const topic = getDeadlineTopic(params.slug);
  if (!topic) notFound();
  const rules = rulesFor(topic);
  if (!rules.length) notFound();

  const others = DEADLINE_TOPICS.filter((t) => t.slug !== topic.slug).slice(0, 6);

  /*
    FAQPage structured data, built from the same rules.

    Only two questions, and both are answered on the page in the same words —
    marking up an answer the visitor cannot find is what gets rich results
    revoked.
  */
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `When is the ${topic.h1.toLowerCase()}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: rules.map((r) => `${r.name}: ${whenText(r)}. ${r.what}.`).join(" "),
        },
      },
      {
        "@type": "Question",
        name: `Who does it apply to?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: rules.map((r) => `${r.name} applies if ${r.appliesIf}.`).join(" "),
        },
      },
    ],
  };

  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Compliance calendar", item: "https://cortex.mnbresearch.com/deadlines" },
      { "@type": "ListItem", position: 2, name: topic.h1, item: `https://cortex.mnbresearch.com/deadlines/${topic.slug}` },
    ],
  };

  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />

      <article className="px-5 lg:px-10 pt-32 lg:pt-40 pb-16">
        <div className="max-w-3xl mx-auto">
          <Link href="/deadlines" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground link-sweep mb-8">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Compliance calendar
          </Link>

          <div className="eyebrow mb-4">Statutory deadline</div>
          <Kinetic as="h1" text={topic.h1} className="font-display display-3 tracking-tightest" stagger={40} />
          <p className="mt-5 text-lg text-muted-foreground">{topic.standfirst}</p>

          {/* ---- the answer, above the fold ---------------------------- */}
          <div className="mt-10 space-y-3">
            {rules.map((r) => {
              const sev = SEVERITY[r.severity] || SEVERITY.low;
              return (
                <div key={r.id} className="rounded-2xl border bg-card overflow-hidden">
                  <div className="p-5 lg:p-6 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-display text-xl lg:text-2xl tracking-tightest">{r.name}</div>
                      <p className="text-muted-foreground mt-1">{r.what}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${sev.cls}`}>{sev.label}</span>
                  </div>
                  <div className="border-t bg-primary/[0.04] p-5 lg:p-6 flex flex-wrap items-center gap-x-8 gap-y-3">
                    <div>
                      <div className="eyebrow text-primary">Falls due</div>
                      <div className="font-display text-2xl tracking-tightest mt-1 tabular-nums">{whenText(r)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      {/*
                        `appliesIf`, always, and never softened.

                        statutory.ts opens by saying Cortex is never told whether
                        a business is GST-registered, has employees or deducts
                        TDS — so it phrases every warning conditionally. On a
                        page a stranger reaches from Google that matters more,
                        not less: most readers are not the person this applies to.
                      */}
                      <div className="eyebrow">Applies if</div>
                      <div className="mt-1 text-[15px]">{r.appliesIf}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ---- the caveat that keeps this honest --------------------- */}
          <div className="mt-8 rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-start gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <span className="font-medium">Extensions happen.</span>{" "}
              These are the statutory dates. The CBIC and CBDT extend them often enough that you should confirm against the
              official portal before relying on one — particularly in the first year of a change. Cortex warns you ahead of
              the statutory date, which is the one you can plan around.
            </div>
          </div>

          {/* ---- what the product does about it ------------------------ */}
          <div className="mt-12 rounded-2xl border bg-primary/5 p-6">
            <div className="flex items-start gap-3">
              <CalendarClock className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-display text-xl tracking-tightest">Stop tracking this by hand.</div>
                <p className="text-sm text-muted-foreground mt-1.5 leading-6">
                  Cortex watches every statutory date that applies to you alongside your receivables, your payables and the
                  MSME 45-day clock — and emails you before one costs you money, rather than after. Upload a Tally, Vyapar
                  or Busy export and it reads your numbers as they come.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/health-check" className="inline-flex items-center gap-2 rounded-full border px-5 h-11 text-sm font-medium hover:bg-accent transition-colors">
                    Free health check
                  </Link>
                  <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-5 h-11 text-sm font-medium" data-cursor>
                    Get started <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-xs text-muted-foreground flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            General information, not tax advice. Your own dates depend on your registration, turnover and constitution —
            check with your CA.
          </p>
        </div>
      </article>

      {/* ---- the rest of the calendar, for crawlers and for readers ---- */}
      <section className="px-5 lg:px-10 pb-24 border-t">
        <div className="max-w-3xl mx-auto pt-10">
          <div className="eyebrow mb-4">Other deadlines</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {others.map((o) => (
              <Link key={o.slug} href={`/deadlines/${o.slug}`} className="rounded-2xl border p-4 bg-card hover:border-primary/40 transition-colors">
                <div className="font-display text-lg tracking-tightest">{o.h1}</div>
              </Link>
            ))}
          </div>
          <Link href="/deadlines" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium link-sweep">
            See the whole calendar <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
