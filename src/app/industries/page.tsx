import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic, SectionLabel, Reveal } from "@/components/loco";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";

export const metadata = {
  title: "Industries — MNB Cortex",
  description: "How MNB Cortex works for manufacturers, D2C & retail, services & agencies, jewellery, distribution and clinics.",
};

const INDUSTRIES: { n: string; name: string; pains: string[]; fixes: string[] }[] = [
  { n: "01", name: "Manufacturing",
    pains: ["Stock-outs and dead inventory", "Thin, unclear margins per SKU", "Receivables stretched by big buyers"],
    fixes: ["Reorder Optimizer with safety stock", "Per-product unit economics & pricing", "Receivables aging with a chase-first list", "13-week cash flow to survive long cycles"] },
  { n: "02", name: "D2C & Retail",
    pains: ["Rising CAC, unclear payback", "Discounts eating the margin", "Which SKUs actually make money?"],
    fixes: ["Marketing funnel + ROAS allocator", "Discount impact & pricing optimizer", "Customer LTV, RFM & churn prediction", "Inventory ABC and reorder planning"] },
  { n: "03", name: "Services & Agencies",
    pains: ["Projects that quietly lose money", "Over- or under-booked teams", "Slow, generic proposals"],
    fixes: ["Project & client profitability", "Team capacity & utilisation planner", "AI proposal & quote generator", "Billable-rate and pipeline tools"] },
  { n: "04", name: "Jewellery",
    pains: ["Costing a design by hand", "Metal + stone price volatility", "Turning a sketch into a spec"],
    fixes: ["Sketch → merchandising spec agent", "Stone-plot layout & collection planner", "Live costing with metal/stone inputs", "Making-charge & margin calculators"] },
  { n: "05", name: "Distribution & Wholesale",
    pains: ["Hundreds of SKUs, tight margins", "Credit risk across many dealers", "Cash locked in the cycle"],
    fixes: ["Payables & DPO with early-pay discounts", "DSCR & credit exposure by account", "Cash conversion cycle simulator", "Vendor scorecards & GST ITC set-off"] },
  { n: "06", name: "Clinics & Healthcare",
    pains: ["Fragmented revenue and no-shows", "Compliance & statutory deadlines", "No single view of the practice"],
    fixes: ["Business health dashboard", "Compliance calendar & GST helper", "Daily brief + KPI alerts", "Payroll, CTC and appraisal tools"] },
];

export default function Industries() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-14">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="00">Industries</SectionLabel>
          <Kinetic as="h1" text={"Built for how you\nactually run it."} className="font-display display-1 tracking-tightest mt-6" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            MNB Cortex isn&rsquo;t generic AI. It speaks the language of your business — with tools and agents tuned to the way your industry makes money.
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-16 border-t">
        <div className="max-w-7xl mx-auto pt-16 space-y-16">
          {INDUSTRIES.map((ind) => (
            <Reveal key={ind.n}>
              <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-8 lg:gap-12">
                <div>
                  <div className="flex items-baseline gap-4">
                    <span className="text-sm tabular-nums text-muted-foreground">{ind.n}</span>
                    <h2 className="font-display text-3xl lg:text-5xl tracking-tightest">{ind.name}</h2>
                  </div>
                  <div className="mt-5 lg:pl-8">
                    <div className="eyebrow mb-2">The pain</div>
                    <ul className="space-y-1.5 text-muted-foreground text-sm">
                      {ind.pains.map((p) => <li key={p}>— {p}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="lg:pt-1">
                  <div className="eyebrow mb-3">How Cortex fixes it</div>
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {ind.fixes.map((f) => (
                      <div key={f} className="rounded-xl border bg-card px-4 py-3 text-sm hover:border-primary/40 hover:bg-accent/40 transition-colors">{f}</div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-display display-3 tracking-tightest max-w-xl">Don&rsquo;t see yours? Cortex adapts to any business.</h2>
          <div className="flex gap-3">
            <Link href="/health-check" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">Free health check</Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>Start free <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
