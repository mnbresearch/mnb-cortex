import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ArrowLeft, Check, X, CalendarClock } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { INDUSTRIES } from "@/lib/industries";
import { industrySeo } from "@/lib/industry-seo";

/*
  ONE INDUSTRY, ON ITS OWN URL.

  These twenty-seven records already existed, each with a tagline, three
  specific pains and four fixes pointing at real tools — and all twenty-seven
  were rendered into a single /industries page behind an anchor list. Which
  meant that a jeweller searching for their own problem found, at best, a page
  about twenty-seven industries.

  That is the same shape as the calculators before they were split out, and it
  is the strongest SEO asset here for the same reason: the content is genuinely
  differentiated and already written. Manufacturing's "stock-outs on some SKUs,
  dead inventory on others" is not a rewrite of the pharmacy's problem.

  WHAT IS NOT HERE, DELIBERATELY.

  No invented statistics about the trade, no "the Indian jewellery market is
  worth ₹X crore", no fabricated case study. Everything below is either from
  the INDUSTRIES record or is a link to something that genuinely exists. A
  padded page would rank no better and would put a claim on twenty-seven pages
  at once — and every claim on this site now has to survive being asked
  "where does that number come from".
*/

export const dynamic = "force-static";

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const seo = industrySeo(params.slug);
  if (!seo) return { title: "Industries — MNB Cortex" };
  const url = `https://cortex.mnbresearch.com/industries/${seo.slug}`;
  return {
    title: `${seo.title} | MNB Cortex`,
    description: seo.description,
    alternates: { canonical: url },
    openGraph: { title: seo.title, description: seo.description, url, type: "website" as const },
    twitter: { card: "summary_large_image" as const, title: seo.title, description: seo.description },
  };
}

export default function IndustryPage({ params }: { params: { slug: string } }) {
  const ind = INDUSTRIES.find((i) => i.slug === params.slug);
  const seo = industrySeo(params.slug);
  if (!ind || !seo) notFound();

  const Icon = ind.icon;
  /* Neighbours in the list, wrapping — gives every page inbound links from two
     others, so no industry page depends on the hub alone to be crawled. */
  const idx = INDUSTRIES.findIndex((i) => i.slug === ind.slug);
  const others = [
    INDUSTRIES[(idx + 1) % INDUSTRIES.length],
    INDUSTRIES[(idx + 2) % INDUSTRIES.length],
    INDUSTRIES[(idx + 3) % INDUSTRIES.length],
    INDUSTRIES[(idx + 4) % INDUSTRIES.length],
  ].filter((x) => x.slug !== ind.slug);

  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Industries", item: "https://cortex.mnbresearch.com/industries" },
      { "@type": "ListItem", position: 2, name: ind.name, item: `https://cortex.mnbresearch.com/industries/${ind.slug}` },
    ],
  };

  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-12">
        <div className="max-w-5xl mx-auto">
          <Link href="/industries" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground link-sweep mb-8">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All industries
          </Link>

          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 grid place-items-center shrink-0">
              <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="eyebrow">Industries</div>
              <Kinetic as="h1" text={ind.name} className="font-display display-2 tracking-tightest mt-1" stagger={40} />
            </div>
          </div>

          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">{seo.standfirst}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/health-check" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">
              Free health check
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>
              Get started <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Problems / tools, the same split the hub uses so the two read as one system. */}
      <section className="px-5 lg:px-10 pb-14">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="rounded-2xl border overflow-hidden grid md:grid-cols-2 gap-px bg-border">
              <div className="bg-card p-6 lg:p-8">
                <div className="eyebrow">What usually goes wrong</div>
                <ul className="mt-5 space-y-4">
                  {ind.pains.map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <span className="h-5 w-5 rounded-full bg-danger/10 grid place-items-center shrink-0 mt-0.5">
                        <X className="h-3 w-3 text-danger" aria-hidden="true" />
                      </span>
                      <span className="text-[15px] leading-7">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-primary/[0.04] p-6 lg:p-8">
                <div className="eyebrow text-primary">What Cortex does about it</div>
                <ul className="mt-5 space-y-4">
                  {ind.fixes.map((f) => (
                    <li key={f.tool} className="flex items-start gap-3">
                      <span className="h-5 w-5 rounded-full bg-primary/15 grid place-items-center shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-primary" aria-hidden="true" />
                      </span>
                      {/* Real hrefs from the record — each points at a module that exists. */}
                      <Link href={f.href} className="text-[15px] leading-7 link-sweep">{f.tool}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          <div className="mt-5 rounded-2xl border bg-card p-6 lg:p-7">
            <div className="eyebrow text-primary">Outcome</div>
            <p className="mt-2 text-lg">{ind.outcome}</p>
          </div>
        </div>
      </section>

      {/* Everyone has the statutory clock, whatever the trade — a real cross-link. */}
      <section className="px-5 lg:px-10 pb-16">
        <div className="max-w-5xl mx-auto">
          <Link href="/deadlines" className="block rounded-2xl border bg-primary/5 p-6 hover:border-primary/40 transition-colors">
            <div className="flex items-start gap-3">
              <CalendarClock className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-display text-xl tracking-tightest">
                  The statutory clock runs for {midSentence(ind.name)} too
                </div>
                <p className="text-sm text-muted-foreground mt-1.5">
                  GST, TDS, PF and ESI, advance tax, the return and the ROC filings — every date, and who each one actually
                  applies to.
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  Open the compliance calendar <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-24 border-t">
        <div className="max-w-5xl mx-auto pt-12">
          <div className="eyebrow mb-4">Other industries</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {others.map((o) => {
              const OIcon = o.icon;
              return (
                <Link key={o.slug} href={`/industries/${o.slug}`} className="rounded-2xl border p-5 bg-card hover:border-primary/40 transition-colors">
                  <OIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <div className="font-display text-lg tracking-tightest mt-3">{o.name}</div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{o.tagline}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}

/** Lower-case mid-sentence, keeping acronym caps like D2C. */
function midSentence(name: string): string {
  return /[A-Z]{2,}/.test(name) ? name : name.toLowerCase();
}
