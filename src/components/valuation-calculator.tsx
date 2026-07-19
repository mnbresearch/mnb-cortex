"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

function Field({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring">
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

export function ValuationCalculator() {
  const [revenue, setRevenue] = useState(51_000_000);   // annual ₹
  const [ebitda, setEbitda] = useState(9_000_000);
  const [growth, setGrowth] = useState(18);             // % YoY
  const [revMultiple, setRevMultiple] = useState(1.5);
  const [ebitdaMultiple, setEbitdaMultiple] = useState(7);
  const [discount, setDiscount] = useState(18);         // % WACC for DCF
  const [years, setYears] = useState(5);
  const [terminal, setTerminal] = useState(4);          // terminal multiple on final-year EBITDA
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const m = useMemo(() => {
    const byRevenue = revenue * revMultiple;
    const byEbitda = ebitda * ebitdaMultiple;
    // Simple DCF on EBITDA as a proxy for free cash flow
    const g = growth / 100, r = discount / 100;
    let pv = 0, cf = ebitda;
    for (let i = 1; i <= years; i++) { cf = cf * (1 + g); pv += cf / Math.pow(1 + r, i); }
    const terminalValue = (cf * terminal) / Math.pow(1 + r, years);
    const dcf = pv + terminalValue;
    const values = [byRevenue, byEbitda, dcf];
    const low = Math.min(...values), high = Math.max(...values);
    const mid = values.reduce((a, b) => a + b, 0) / values.length;
    const margin = revenue > 0 ? (ebitda / revenue) * 100 : 0;
    return { byRevenue, byEbitda, dcf, low, high, mid, margin };
  }, [revenue, ebitda, growth, revMultiple, ebitdaMultiple, discount, years, terminal]);

  async function analyse() {
    setLoading(true); setOut("");
    const input = `Valuation inputs: annual revenue ${inr(revenue)}, EBITDA ${inr(ebitda)} (${m.margin.toFixed(1)}% margin), growth ${growth}% YoY. Methods: revenue multiple ${revMultiple}x → ${inr(m.byRevenue)}; EBITDA multiple ${ebitdaMultiple}x → ${inr(m.byEbitda)}; DCF over ${years} years at ${discount}% discount with ${terminal}x terminal → ${inr(m.dcf)}. Indicative range ${inr(m.low)}–${inr(m.high)}.`;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "valuation", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  return (
    <Card className="p-5 space-y-5">
      <div>
        <div className="font-semibold">Indicative business valuation</div>
        <div className="text-sm text-muted-foreground">Three standard methods, side by side.</div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Annual revenue" value={revenue} onChange={setRevenue} suffix="₹" />
        <Field label="EBITDA" value={ebitda} onChange={setEbitda} suffix="₹" />
        <Field label="Growth (YoY)" value={growth} onChange={setGrowth} suffix="%" />
        <Field label="Revenue multiple" value={revMultiple} onChange={setRevMultiple} suffix="x" />
        <Field label="EBITDA multiple" value={ebitdaMultiple} onChange={setEbitdaMultiple} suffix="x" />
        <Field label="Discount rate (WACC)" value={discount} onChange={setDiscount} suffix="%" />
        <Field label="DCF horizon" value={years} onChange={setYears} suffix="yrs" />
        <Field label="Terminal multiple" value={terminal} onChange={setTerminal} suffix="x" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Revenue multiple method" value={inr(m.byRevenue)} />
        <Stat label="EBITDA multiple method" value={inr(m.byEbitda)} />
        <Stat label="Discounted cash flow" value={inr(m.dcf)} />
      </div>

      <div className="rounded-lg border p-4 bg-primary/5 border-primary/30">
        <div className="text-sm text-muted-foreground">Indicative valuation range</div>
        <div className="text-2xl font-bold mt-1">{inr(m.low)} — {inr(m.high)}</div>
        <div className="text-sm text-muted-foreground mt-1">Midpoint {inr(m.mid)} · EBITDA margin {m.margin.toFixed(1)}%</div>
      </div>

      <p className="text-xs text-muted-foreground">
        Indicative only — not a formal valuation. Real Indian SME deals are heavily affected by customer concentration,
        owner dependence, quality of books, and whether earnings are clean and provable.
      </p>

      <Button onClick={analyse} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Analysing…" : "Interpret this valuation (ask the AI analyst)"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold tabular-nums">{value}</div></div>;
}
