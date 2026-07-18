"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

const MONTHLY_PROFIT = 5_100_000; // ₹51 L

export function FundingCalculator() {
  const [amount, setAmount] = useState(5_000_000);
  const [rate, setRate] = useState(14);
  const [years, setYears] = useState(3);
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const m = useMemo(() => {
    const n = years * 12;
    const r = rate / 100 / 12;
    const emi = r === 0 ? amount / n : (amount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const total = emi * n;
    const interest = total - amount;
    const coverage = emi > 0 ? MONTHLY_PROFIT / emi : 0; // times monthly profit covers EMI
    return { emi, total, interest, coverage };
  }, [amount, rate, years]);

  async function advise() {
    setLoading(true); setOut("");
    const input = `Considering a loan of ${inr(amount)} at ${rate}% for ${years} years. EMI ≈ ${inr(m.emi)}/month, total interest ${inr(m.interest)}. Monthly profit is ~₹51 L, so EMI coverage is ${m.coverage.toFixed(1)}x. Should I take it?`;
    try { const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "loan", input }) }); const j = await r.json(); setOut(j.text || "No response."); }
    catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  return (
    <Card className="p-5 space-y-5">
      <div><div className="font-semibold">Loan / EMI calculator</div><div className="text-sm text-muted-foreground">Model the cost of debt before you commit.</div></div>
      <div className="grid sm:grid-cols-3 gap-4">
        <Slider label="Loan amount" value={amount} min={500000} max={50000000} step={500000} onChange={setAmount} fmt={(v) => inr(v)} />
        <Slider label="Interest rate" value={rate} min={8} max={28} step={0.5} onChange={setRate} fmt={(v) => v + "%"} />
        <Slider label="Tenure" value={years} min={1} max={7} step={1} onChange={setYears} fmt={(v) => v + " yr"} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Monthly EMI" value={inr(m.emi)} />
        <Stat label="Total interest" value={inr(m.interest)} tone="down" />
        <Stat label="Total repayment" value={inr(m.total)} />
        <Stat label="EMI coverage" value={`${m.coverage.toFixed(1)}x`} tone={m.coverage >= 5 ? "up" : m.coverage >= 3 ? "flat" : "down"} />
      </div>
      <Button onClick={advise} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Analysing…" : "Should I take this loan? (ask the AI CFO)"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; fmt: (n: number) => string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
    </div>
  );
}
function Stat({ label, value, tone = "flat" }: { label: string; value: string; tone?: "up" | "down" | "flat" }) {
  const c = tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-foreground";
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${c}`}>{value}</div></div>;
}
