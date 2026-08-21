"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RotateCcw, Check, AlertTriangle } from "lucide-react";

type Opt = { label: string; score: number };
type Q = { id: string; q: string; area: string; rec: string; opts: Opt[] };

const QUESTIONS: Q[] = [
  { id: "cash", q: "Do you know your exact cash runway right now?", area: "Cash visibility", rec: "Cash Runway & Burn + a 13-week rolling cash-flow view",
    opts: [{ label: "Yes, precisely", score: 100 }, { label: "Roughly", score: 55 }, { label: "Not really", score: 15 }] },
  { id: "receivables", q: "How do you chase overdue payments?", area: "Receivables", rec: "Receivables & DSO tracker with a chase-first priority list",
    opts: [{ label: "Automated aging report", score: 100 }, { label: "A spreadsheet", score: 55 }, { label: "From memory", score: 15 }] },
  { id: "forecast", q: "Do you forecast demand and stockouts?", area: "Planning", rec: "Reorder Optimizer + AI forecasting & scenarios",
    opts: [{ label: "Yes, data-driven", score: 100 }, { label: "Sometimes", score: 55 }, { label: "No", score: 15 }] },
  { id: "reporting", q: "How fast can you produce a P&L?", area: "Reporting speed", rec: "P&L Builder + the Business Health Dashboard",
    opts: [{ label: "Instantly", score: 100 }, { label: "A few days", score: 55 }, { label: "Weeks", score: 20 }] },
  { id: "unit", q: "Do you know your CAC and customer LTV?", area: "Unit economics", rec: "Unit Economics + Customer LTV & RFM",
    opts: [{ label: "Both", score: 100 }, { label: "One of them", score: 55 }, { label: "Neither", score: 20 }] },
  { id: "decisions", q: "How are big decisions usually made?", area: "Decision quality", rec: "AI CEO Chat + a Decision Journal with a devil's advocate",
    opts: [{ label: "Data-driven", score: 100 }, { label: "A mix", score: 60 }, { label: "Mostly gut", score: 25 }] },
];

export function HealthCheckClient() {
  const [step, setStep] = useState(0); // 0..QUESTIONS.length-1, then results
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ name: "", email: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  const done = step >= QUESTIONS.length;
  const score = done ? Math.round(Object.values(answers).reduce((a, b) => a + b, 0) / QUESTIONS.length) : 0;
  const band = score >= 80 ? { t: "Strong", c: "text-success" } : score >= 55 ? { t: "Developing", c: "text-warning" } : { t: "At risk", c: "text-danger" };
  const risks = QUESTIONS.filter((q) => (answers[q.id] ?? 100) <= 55);

  function choose(q: Q, opt: Opt) {
    setAnswers((a) => ({ ...a, [q.id]: opt.score }));
    setTimeout(() => setStep((s) => s + 1), 180);
  }
  function reset() { setAnswers({}); setStep(0); setStatus("idle"); setForm({ name: "", email: "" }); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setStatus("sending");
    try {
      const note = `Business Health Score: ${score}/100 (${band.t}). Weak areas: ${risks.map((r) => r.area).join(", ") || "none"}.`;
      const r = await fetch("/api/inquiry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, plan: "Health Check", source: "health-check", note }),
      });
      const j = await r.json();
      setStatus(j.ok ? "done" : "error");
    } catch { setStatus("error"); }
  }

  if (!done) {
    const q = QUESTIONS[step];
    return (
      <div className="rounded-2xl border bg-card p-6 lg:p-10 max-w-2xl">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-6">
          <span>Question {step + 1} of {QUESTIONS.length}</span>
          <span>{Math.round((step / QUESTIONS.length) * 100)}%</span>
        </div>
        <div className="h-1 rounded-full bg-secondary mb-8 overflow-hidden">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${(step / QUESTIONS.length) * 100}%` }} />
        </div>
        <h2 className="font-display text-2xl lg:text-3xl tracking-tightest">{q.q}</h2>
        <div className="mt-6 space-y-3">
          {q.opts.map((o) => (
            <button key={o.label} onClick={() => choose(q, o)}
              className="w-full text-left rounded-xl border px-4 py-3.5 hover:border-primary hover:bg-accent/50 transition-colors flex items-center justify-between group">
              <span>{o.label}</span>
              <span className="h-5 w-5 rounded-full border group-hover:border-primary group-hover:bg-primary transition-colors" />
            </button>
          ))}
        </div>
        {step > 0 && <button onClick={() => setStep((s) => s - 1)} className="mt-6 text-sm text-muted-foreground link-sweep">← Back</button>}
      </div>
    );
  }

  // Results
  const R = 54, C = 2 * Math.PI * R, off = C * (1 - score / 100);
  return (
    <div className="rounded-2xl border bg-card p-6 lg:p-10 max-w-2xl">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative shrink-0">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r={R} fill="none" stroke="hsl(var(--secondary))" strokeWidth="12" />
            <circle cx="70" cy="70" r={R} fill="none" stroke="hsl(var(--primary))" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 70 70)" style={{ transition: "stroke-dashoffset 1s cubic-bezier(.19,1,.22,1)" }} />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center"><div className="font-display text-4xl tracking-tightest">{score}</div><div className="text-[10px] text-muted-foreground">/ 100</div></div>
          </div>
        </div>
        <div>
          <div className="eyebrow">Your Business Health Score</div>
          <div className={`font-display text-3xl tracking-tightest mt-1 ${band.c}`}>{band.t}</div>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            {score >= 80 ? "You run a tight ship. Cortex helps you compound that edge and free up hours every week."
              : score >= 55 ? "Solid foundation with clear gaps. Cortex can close them fast — here's where to start."
              : "You're flying partly blind. The good news: these are exactly the things Cortex fixes on day one."}
          </p>
        </div>
      </div>

      {risks.length > 0 && (
        <div className="mt-8">
          <div className="text-sm font-medium flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-warning" /> Where to focus</div>
          <div className="space-y-2.5">
            {risks.map((r) => (
              <div key={r.id} className="rounded-xl border p-3.5">
                <div className="font-medium text-sm">{r.area}</div>
                <div className="text-sm text-muted-foreground mt-0.5">In Cortex: {r.rec}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 rounded-xl bg-primary/5 border border-primary/15 p-5">
        {status === "done" ? (
          <div className="text-center py-2">
            <Check className="h-8 w-8 text-success mx-auto" />
            <p className="mt-2 font-medium">Thanks, {form.name}! Your report is on its way.</p>
            <Link href="/login" className="mt-4 inline-flex items-center gap-2 rounded-full btn-ink px-6 h-11 text-sm font-medium">Get started <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        ) : (
          <>
            <div className="font-display text-xl tracking-tightest">Get your detailed report + a fix plan</div>
            <p className="text-sm text-muted-foreground mt-1">We&rsquo;ll email the full breakdown and show you what Cortex would do with your numbers.</p>
            <form onSubmit={submit} className="mt-4 grid sm:grid-cols-2 gap-3">
              <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <input required type="email" placeholder="Work email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring" />
              {status === "error" && <p className="text-xs text-danger sm:col-span-2">Something went wrong — please try again.</p>}
              <button disabled={status === "sending"} className="sm:col-span-2 rounded-full btn-ink h-11 text-sm font-medium">{status === "sending" ? "Sending…" : "Email me the report"}</button>
            </form>
          </>
        )}
      </div>

      <button onClick={reset} className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground link-sweep"><RotateCcw className="h-3.5 w-3.5" /> Retake the check</button>
    </div>
  );
}
