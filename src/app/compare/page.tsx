import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SmoothScroll, Cursor, Kinetic, SectionLabel } from "@/components/loco";
import { Reveal } from "@/components/landing-extras";
import { PublicHeader, PublicFooter } from "@/components/public-chrome";

export const metadata = {
  title: "MNB Cortex vs ERP, CRM, ChatGPT & consultants",
  description: "How an AI operating system compares to an ERP, a CRM, a general chatbot, and hiring a consultant — for an Indian SME.",
};

const COLS = ["Cortex", "ERP", "CRM", "ChatGPT", "Consultant"];
const ROWS: { f: string; v: string[] }[] = [
  { f: "Reads all your business data", v: ["y", "p", "p", "n", "p"] },
  { f: "Diagnoses problems for you", v: ["y", "n", "n", "p", "y"] },
  { f: "Predicts what's coming", v: ["y", "n", "n", "n", "p"] },
  { f: "Recommends specific actions", v: ["y", "n", "n", "p", "y"] },
  { f: "Executes the busywork", v: ["y", "n", "n", "n", "n"] },
  { f: "Plain-language answers", v: ["y", "n", "n", "y", "y"] },
  { f: "Remembers your business", v: ["y", "p", "p", "n", "p"] },
  { f: "Available 24/7", v: ["y", "y", "y", "y", "n"] },
  { f: "Built for Indian SMEs", v: ["y", "p", "p", "n", "p"] },
  { f: "Monthly cost", v: ["₹", "₹₹₹", "₹₹", "₹", "₹₹₹₹"] },
];

const NARR = [
  { t: "vs an ERP", d: "An ERP is a system of record — it stores transactions beautifully but waits for you to ask questions and draw conclusions. Cortex sits on top of your data (including your ERP) and does the thinking: it tells you what changed, why it matters, and what to do." },
  { t: "vs a CRM", d: "A CRM tracks your pipeline; it doesn't tell you which deals to prioritise, which customers are about to churn, or how pricing is hurting margin. Cortex reads sales alongside finance and operations, so advice reflects the whole business, not one slice." },
  { t: "vs ChatGPT", d: "A general chatbot is brilliant and blank — it knows nothing about your numbers unless you paste them every time, and it forgets. Cortex is grounded in a permanent memory of your business and connected to your data, so answers are specific to you." },
  { t: "vs a consultant", d: "A great consultant is expensive, occasional, and gone when the engagement ends. Cortex gives you boardroom-grade analysis every day for a fraction of the cost — and it remembers every decision you've made." },
];

const mark = (v: string) => {
  if (v === "y") return <span className="text-primary text-lg">●</span>;
  if (v === "p") return <span className="text-warning text-lg">◐</span>;
  if (v === "n") return <span className="text-muted-foreground/40 text-lg">○</span>;
  return <span className="text-sm">{v}</span>;
};

export default function Compare() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <SmoothScroll />
      <Cursor />
      <PublicHeader />

      <section className="px-5 lg:px-10 pt-32 lg:pt-40 pb-14">
        <div className="max-w-7xl mx-auto">
          <SectionLabel n="00">Compare</SectionLabel>
          <Kinetic as="h1" text={"Store, chat, or act?"} className="font-display display-1 tracking-tightest mt-6" />
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            ERPs and CRMs store your data. Chatbots make conversation. Consultants cost a fortune. MNB Cortex reads everything and acts.
          </p>
        </div>
      </section>

      <section className="px-5 lg:px-10 pb-20 border-t">
        <div className="max-w-5xl mx-auto pt-10 overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b">
                <th className="text-left font-normal text-muted-foreground py-4 pr-3"></th>
                {COLS.map((c, i) => (
                  <th key={c} className={`py-4 px-3 text-center ${i === 0 ? "font-semibold text-primary" : "font-normal text-muted-foreground"}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.f} className="border-b border-border/60">
                  <td className="py-4 pr-3 font-medium">{r.f}</td>
                  {r.v.map((v, j) => <td key={j} className="py-4 px-3 text-center">{mark(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 text-xs text-muted-foreground flex gap-4">
            <span><span className="text-primary">●</span> Yes</span>
            <span><span className="text-warning">◐</span> Partial</span>
            <span><span className="text-muted-foreground/40">○</span> No</span>
          </div>
        </div>
      </section>

      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-px bg-border border rounded-2xl overflow-hidden">
          {NARR.map((n) => (
            <Reveal key={n.t} className="bg-card">
              <div className="p-7 h-full">
                <h2 className="font-display text-2xl tracking-tightest">{n.t}</h2>
                <p className="text-muted-foreground mt-3 text-[15px] leading-7">{n.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="px-5 lg:px-10 py-20 border-t">
        <div className="max-w-7xl mx-auto flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-display display-3 tracking-tightest max-w-xl">See the difference on your own numbers.</h2>
          <div className="flex gap-3">
            <Link href="/health-check" className="inline-flex items-center gap-2 rounded-full border px-6 h-12 text-sm font-medium hover:bg-accent transition-colors">Free health check</Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>Get started <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
