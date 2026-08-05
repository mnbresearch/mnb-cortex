"use client";
import { useState } from "react";
import Link from "next/link";
import { Radar, Loader2, ArrowUpRight, Check, X } from "lucide-react";

const IN = "w-full rounded-lg border bg-background px-3.5 h-12 text-sm outline-none focus:ring-2 focus:ring-ring";

type Teaser = {
  ok: boolean; error?: string; brand?: string; score?: number; engine?: string; grounded?: boolean;
  shown?: number; total?: number; competitors?: { name: string; hits: number }[];
  sample?: { prompt: string; mentioned: boolean; answer: string } | null;
};

export function VisibilityCheck() {
  const [f, setF] = useState({ name: "", email: "", brand: "", category: "", location: "" });
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Teaser | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name || !f.email || !f.brand) return;
    setLoading(true); setRes(null);
    try {
      const r = await fetch("/api/visibility/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      setRes(await r.json());
    } catch { setRes({ ok: false, error: "Network error — please try again." }); }
    finally { setLoading(false); }
  }

  const band = (s: number) => s >= 66 ? { t: "Strong", c: "text-success" } : s >= 33 ? { t: "Patchy", c: "text-warning" } : { t: "Nearly invisible", c: "text-danger" };

  if (res?.ok) {
    const s = res.score ?? 0;
    return (
      <div className="rounded-2xl border bg-card p-6 lg:p-8 max-w-2xl">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">AI Visibility Score · {res.brand}</div>
        <div className="mt-2 flex items-end gap-3">
          <div className="font-display text-6xl tracking-tightest">{s}</div>
          <div className={`font-display text-2xl tracking-tightest mb-1 ${band(s).c}`}>{band(s).t}</div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {res.brand} appeared in <b className="text-foreground">{res.shown}</b> of {res.total} AI answers we tested. Engine: {res.engine}{res.grounded ? " · live web" : ""}.
        </p>
        {res.competitors && res.competitors.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-muted-foreground mb-1.5">Recommended instead of you</div>
            <div className="flex flex-wrap gap-2">{res.competitors.map((c) => <span key={c.name} className="rounded-full border px-3 py-1 text-sm">{c.name}</span>)}</div>
          </div>
        )}
        {res.sample && (
          <div className="mt-4 rounded-xl border bg-secondary/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className={`h-4 w-4 rounded-full grid place-items-center ${res.sample.mentioned ? "bg-success/15 text-success" : "bg-danger/10 text-danger"}`}>
                {res.sample.mentioned ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </span>
              “{res.sample.prompt}”
            </div>
            <p className="text-sm text-foreground/80">{res.sample.answer}…</p>
          </div>
        )}
        <div className="mt-6 rounded-xl bg-primary/5 border border-primary/15 p-4">
          <div className="font-display text-lg tracking-tightest">This was just 3 questions.</div>
          <p className="text-sm text-muted-foreground mt-1">Inside Cortex you get the full check across more questions and engines, competitor tracking, and the AI‑ready content that gets you recommended.</p>
          <Link href="/login" className="mt-3 inline-flex items-center gap-2 rounded-full btn-ink px-6 h-11 text-sm font-medium" data-cursor>Fix my AI visibility — start free <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={run} className="rounded-2xl border bg-card p-6 lg:p-8 max-w-2xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <input className={IN} placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input className={IN} type="email" placeholder="Work email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <input className={`${IN} sm:col-span-2`} placeholder="Your brand / business name" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} required />
        <input className={IN} placeholder="What you do (e.g. gold jewellery exporter)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        <input className={IN} placeholder="City / region (optional)" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
      </div>
      {res?.error && <p className="text-sm text-danger mt-3">{res.error}</p>}
      <button disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-full btn-ink px-6 h-12 text-sm font-medium" data-cursor>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
        {loading ? "Asking the AI engines…" : "Check my AI visibility — free"}
      </button>
      <p className="text-xs text-muted-foreground mt-3">Free. We run real questions through live AI and show your score in ~20 seconds.</p>
    </form>
  );
}
