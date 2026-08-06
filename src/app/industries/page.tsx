import Link from "next/link";
import { ArrowUpRight, Check, X } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { INDUSTRIES } from "@/lib/industries";

export const metadata = {
  title: "Industries — MNB Cortex",
  description: "MNB Cortex is tuned for 25+ industries — manufacturing, retail & D2C, services, jewellery, distribution, clinics, restaurants, salons, logistics, real estate and more. See your specific problems and the exact tools that solve them.",
};

export default function Industries() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-14">
        <div className="max-w-7xl mx-auto">
          <div className="eyebrow">Industries</div>
          <Kinetic as="h1" text={"Tuned for how your\nindustry actually runs."} className="font-display display-1 tracking-tightest mt-5" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Cortex isn&rsquo;t a generic dashboard. It knows the specific problems of {INDUSTRIES.length}+ industries — and comes with the exact tools to solve them,
            grounded in a permanent memory of your business.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>Start free — 3-day trial <ArrowUpRight className="h-4 w-4" /></Link>
            <Link href="/features" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">See all features <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      {/* Quick index */}
      <section className="px-5 lg:px-10 pb-10">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-2">
          {INDUSTRIES.map((i) => {
            const I = i.icon;
            return (
              <a key={i.slug} href={`#${i.slug}`} className="inline-flex items-center gap-1.5 rounded-full border px-3 h-9 text-sm hover:bg-accent hover:border-primary/40 transition-colors">
                <I className="h-3.5 w-3.5 text-primary" /> {i.name}
              </a>
            );
          })}
        </div>
      </section>

      {/* Industry sections */}
      <section className="px-5 lg:px-10 pb-16">
        <div className="max-w-7xl mx-auto space-y-5">
          {INDUSTRIES.map((ind, idx) => {
            const Icon = ind.icon;
            return (
              <Reveal key={ind.slug} delay={(idx % 3) * 60}>
                <div id={ind.slug} className="scroll-mt-24 rounded-2xl border overflow-hidden">
                  <div className="p-6 lg:p-7 bg-card border-b flex items-start gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center shrink-0"><Icon className="h-6 w-6 text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="row-meta text-sm tabular-nums text-muted-foreground">{String(idx + 1).padStart(2, "0")}</span>
                        <h2 className="font-display text-2xl lg:text-3xl tracking-tightest">{ind.name}</h2>
                      </div>
                      <p className="text-muted-foreground mt-1">{ind.tagline}</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-px bg-border">
                    <div className="bg-card p-6 lg:p-7">
                      <div className="eyebrow">The problems</div>
                      <ul className="mt-4 space-y-3">
                        {ind.pains.map((p) => (
                          <li key={p} className="flex items-start gap-3 text-sm lg:text-base">
                            <span className="h-5 w-5 rounded-full bg-danger/10 grid place-items-center shrink-0 mt-0.5"><X className="h-3 w-3 text-danger" /></span>{p}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-primary/[0.04] p-6 lg:p-7">
                      <div className="eyebrow text-primary">The Cortex tools</div>
                      <ul className="mt-4 space-y-3">
                        {ind.fixes.map((f) => (
                          <li key={f.tool} className="flex items-start gap-3 text-sm lg:text-base">
                            <span className="h-5 w-5 rounded-full bg-primary/15 grid place-items-center shrink-0 mt-0.5"><Check className="h-3 w-3 text-primary" /></span>{f.tool}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="bg-card p-6 lg:p-7 border-t flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm lg:text-base max-w-xl"><span className="text-primary font-medium">Outcome:</span> {ind.outcome}</p>
                    <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium link-sweep shrink-0">Start free <ArrowUpRight className="h-4 w-4" /></Link>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Not listed */}
      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display display-3 tracking-tightest">Don&rsquo;t see yours?</h2>
          <p className="mt-4 text-muted-foreground">Cortex adapts to any business — and even builds custom AI agents for your exact workflow. If you run it, Cortex can run the numbers.</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>Start free <ArrowUpRight className="h-4 w-4" /></Link>
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">Talk to us <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
