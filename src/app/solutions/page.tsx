import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { SmoothScroll, Kinetic, SectionLabel } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { HowAgentsWork, SolutionCta } from "@/components/solution-blocks";
import { SOLUTIONS } from "@/lib/solutions";

export const metadata: Metadata = {
  title: "Solutions — Cortex for Finance, Operations, Sales & Growth and Practices",
  description: "One agent workspace, four ways in. Teams of AI agents that read your own books, propose the actions and show their working.",
  alternates: { canonical: "/solutions" },
};

export default function SolutionsIndex() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <PublicHeader />
      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-16">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="00">Solutions</SectionLabel>
          <Kinetic as="h1" text={"One workspace.\nA team for every job."} className="font-display display-1 tracking-tightest mt-6" />
          <p className="mt-6 text-lg text-muted-foreground max-w-3xl leading-8">Every solution is a team of agents working from the same place: your books, your memory, your approvals. Start with the team you need; the others are there when you need them.</p>
          <div className="mt-12 grid md:grid-cols-2 gap-4">
            {SOLUTIONS.map((s) => (
              <Link key={s.slug} href={`/solutions/${s.slug}`} className={`group rounded-2xl border p-8 transition-colors hover:bg-accent ${s.flagship ? "bg-primary/5 border-primary/30 md:col-span-2" : "bg-card"}`}>
                {s.flagship && <span className="text-xs font-medium text-primary">Flagship</span>}
                <div className="font-display text-3xl tracking-tightest mt-1">{s.name}</div>
                <p className="mt-3 text-muted-foreground leading-7 max-w-2xl">{s.short}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium">Explore {s.name.replace("Cortex for ", "")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="01">How the agents work</SectionLabel>
          <div className="mt-8"><HowAgentsWork /></div>
          <div className="mt-10"><SolutionCta /></div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
