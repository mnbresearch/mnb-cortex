import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, MessageSquareText } from "lucide-react";
import { SmoothScroll, Kinetic, SectionLabel } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { AgentTeamGrid, HowAgentsWork, SolutionCta } from "@/components/solution-blocks";
import { SOLUTIONS, solutionBySlug } from "@/lib/solutions";
import { ENTRY_PRICE_LABEL } from "@/lib/config";

export function generateStaticParams() {
  return SOLUTIONS.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const s = solutionBySlug(params.slug);
  if (!s) return {};
  return {
    title: `${s.name} — AI agents that work from your books`,
    description: s.short,
    alternates: { canonical: `/solutions/${s.slug}` },
    openGraph: { title: s.name, description: s.short, type: "website" },
  };
}

export default function SolutionPage({ params }: { params: { slug: string } }) {
  const s = solutionBySlug(params.slug);
  if (!s) notFound();
  const others = SOLUTIONS.filter((o) => o.slug !== s.slug);
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <PublicHeader />

      <section className="relative px-5 lg:px-10 pt-32 lg:pt-40 pb-16 overflow-hidden noise">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="relative z-10 max-w-6xl mx-auto">
          <SectionLabel n="00">{s.name}</SectionLabel>
          <p className="mt-6 text-sm font-medium text-muted-foreground">{s.eyebrow}</p>
          <Kinetic as="h1" text={s.headline} className="font-display display-1 tracking-tightest mt-3 text-balance max-w-4xl" />
          <p className="mt-6 text-lg text-muted-foreground max-w-3xl leading-8">{s.sub}</p>
          <div className="mt-8"><SolutionCta /></div>
          <p className="mt-4 text-sm text-muted-foreground">Plans from {ENTRY_PRICE_LABEL}/month. <Link href="/pricing" className="underline underline-offset-4">See pricing</Link>.</p>
        </div>
      </section>

      {s.team && (
        <section className="px-5 lg:px-10 py-20 border-t">
          <div className="max-w-7xl mx-auto">
            <SectionLabel n="01">The team</SectionLabel>
            <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">Agents with named jobs and named tools.</h2>
            <p className="mt-4 text-muted-foreground max-w-2xl leading-7">Each agent reads only your workspace&rsquo;s data, through the tools listed on its card. The lead plans the work and writes the answer.</p>
            <div className="mt-10"><Reveal><AgentTeamGrid team={s.team} /></Reveal></div>
          </div>
        </section>
      )}

      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="02">What it covers</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">The work, module by module.</h2>
          <div className="mt-10 space-y-12">
            {s.groups.map((g) => (
              <div key={g.name}>
                <h3 className="font-display text-2xl tracking-tightest">{g.name}</h3>
                <div className="mt-5 grid md:grid-cols-2 gap-4">
                  {g.items.map((c) => (
                    <div key={c.title} className="rounded-2xl border bg-card p-6">
                      <div className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-primary mt-1 shrink-0" aria-hidden="true" /><div className="font-medium">{c.title}</div></div>
                      <p className="mt-2 text-sm text-muted-foreground leading-6">{c.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="03">How it works</SectionLabel>
          <h2 className="font-display display-2 tracking-tightest mt-5 max-w-3xl">You delegate. They work. You decide.</h2>
          <div className="mt-10"><HowAgentsWork /></div>
        </div>
      </section>

      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-10">
          <div>
            <SectionLabel n="04">Things to hand over</SectionLabel>
            <h2 className="font-display display-3 tracking-tightest mt-5">Say it the way you&rsquo;d say it to a colleague.</h2>
            <ul className="mt-6 space-y-3">
              {s.delegations.map((d) => (
                <li key={d} className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm"><MessageSquareText className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />&ldquo;{d}&rdquo;</li>
              ))}
            </ul>
          </div>
          <div>
            <SectionLabel n="05">Who it&rsquo;s for</SectionLabel>
            <ul className="mt-6 space-y-3">
              {s.forWho.map((w) => <li key={w} className="flex items-start gap-3 text-base"><CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />{w}</li>)}
            </ul>
            <div className="mt-10"><SolutionCta /></div>
          </div>
        </div>
      </section>

      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-display display-3 tracking-tightest">More from Cortex</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-4">
            {others.map((o) => (
              <Link key={o.slug} href={`/solutions/${o.slug}`} className="group rounded-2xl border bg-card p-6 hover:bg-accent transition-colors">
                <div className="font-display text-xl tracking-tightest">{o.name}</div>
                <p className="mt-2 text-sm text-muted-foreground leading-6">{o.short}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">Explore <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
