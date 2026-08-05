import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";
import { VisibilityCheck } from "@/components/visibility-check";

export const metadata = {
  title: "Free AI Visibility Check — is AI recommending your business? | MNB Cortex",
  description: "Over 100M people ask AI for recommendations before buying. Run a free check to see whether ChatGPT, Gemini and Perplexity name your business — and how to fix it.",
};

const STEPS = [
  { n: "01", t: "We ask the AI what buyers ask", d: "Real buyer-intent questions about your category, run through live AI answer engines." },
  { n: "02", t: "We check if you're named", d: "See your AI Visibility Score and exactly who's being recommended instead of you." },
  { n: "03", t: "Cortex drafts the fix", d: "The AI-ready FAQs, blurb and moves that get engines to cite and recommend you." },
];

export default function AiVisibility() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-12">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="00">Free tool</SectionLabel>
          <Kinetic as="h1" text={"Is AI recommending\nyour business?"} className="font-display display-1 tracking-tightest mt-6" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Your next customer is asking ChatGPT, Gemini or Perplexity for a recommendation right now. If the AI doesn&rsquo;t name you, you don&rsquo;t exist.
            Find out where you stand — free, in about 20 seconds.
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-16">
        <div className="max-w-7xl mx-auto"><VisibilityCheck /></div>
      </section>

      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="01">How it works</SectionLabel>
          <div className="mt-10 grid md:grid-cols-3 gap-px bg-border border rounded-2xl overflow-hidden">
            {STEPS.map((s) => (
              <Reveal key={s.n} className="bg-card">
                <div className="p-6 h-full">
                  <div className="font-display text-4xl tracking-tightest text-primary">{s.n}</div>
                  <div className="mt-4 font-semibold">{s.t}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 lg:px-10 py-16 border-t">
        <div className="max-w-7xl mx-auto flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-display display-3 tracking-tightest max-w-xl">AI Visibility is one tool. Cortex runs your whole company.</h2>
          <div className="flex gap-3">
            <Link href="/features" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">See all features</Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>Start free <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
