import Link from "next/link";
import { ArrowRight, Activity, Brain, Workflow, ShieldCheck } from "lucide-react";

const feats = [
  { icon: Activity, t: "Monitors continuously", d: "Reads sales, finance, production, inventory & HR in real time." },
  { icon: Brain, t: "Predicts & recommends", d: "Forecasts stockouts, churn, cash crunches before they happen." },
  { icon: Workflow, t: "Executes for you", d: "Drafts POs, invoices, reminders and campaigns automatically." },
  { icon: ShieldCheck, t: "Explains in plain English", d: "Ask 'How is my business?' and get a real answer." },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">C</div>
          <span className="font-semibold">MNB Cortex</span>
        </div>
        <Link href="/login" className="text-sm rounded-lg bg-primary text-primary-foreground px-4 py-2 font-medium">Sign in</Link>
      </header>

      <section className="px-6 lg:px-12 py-20 lg:py-28 max-w-5xl mx-auto text-center">
        <span className="inline-block text-xs font-medium rounded-full border px-3 py-1 text-muted-foreground mb-6">The AI COO for SMEs</span>
        <h1 className="text-4xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
          Run your company by <span className="gradient-text">asking</span>, not by opening spreadsheets.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          MNB Cortex is an AI Operating System that observes your business, detects problems, predicts outcomes, recommends actions — and executes them.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/login" className="rounded-lg bg-primary text-primary-foreground px-6 h-12 inline-flex items-center gap-2 font-medium">
            Open the dashboard <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/dashboard" className="rounded-lg border px-6 h-12 inline-flex items-center font-medium">View live demo</Link>
        </div>
      </section>

      <section className="px-6 lg:px-12 pb-24 max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {feats.map((f) => (
          <div key={f.t} className="rounded-xl border p-5 bg-card">
            <f.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">{f.t}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
