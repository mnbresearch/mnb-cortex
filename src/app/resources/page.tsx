import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { ARTICLES } from "@/lib/resources";

export const metadata = {
  title: "Resources — MNB Cortex",
  description: "Practical playbooks for Indian SME owners: cash runway, receivables, unit economics and running a business on AI.",
};

export default function Resources() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-14">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="00">Resources</SectionLabel>
          <Kinetic as="h1" text={"Playbooks for\nrunning smarter."} className="font-display display-1 tracking-tightest mt-6" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Short, practical guides on the numbers that actually run a business — written for Indian SME owners, not finance PhDs.
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-24 border-t">
        <div className="max-w-7xl mx-auto pt-8">
          {ARTICLES.map((a) => (
            <Reveal key={a.slug}>
              <Link href={`/resources/${a.slug}`} className="reveal-row block" data-cursor>
                <span className="fill" aria-hidden />
                <div className="row-inner flex items-baseline gap-4 lg:gap-8 py-7">
                  <span className="row-meta text-xs uppercase tracking-wider text-muted-foreground w-24 shrink-0">{a.tag}</span>
                  <span className="flex-1 min-w-0">
                    <span className="font-display text-2xl lg:text-4xl tracking-tightest block">{a.title}</span>
                    <span className="row-meta text-sm text-muted-foreground mt-1 block max-w-2xl">{a.dek}</span>
                  </span>
                  <span className="row-meta hidden md:block text-sm text-muted-foreground shrink-0">{a.readTime}</span>
                  <ArrowUpRight className="row-arrow h-6 w-6 shrink-0" />
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
