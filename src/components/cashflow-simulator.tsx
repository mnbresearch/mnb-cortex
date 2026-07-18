"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RotateCcw } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

const ANNUAL_REVENUE = 510_000_000; // ~₹51 Cr annualised
const COGS = ANNUAL_REVENUE * 0.69;

function Row({ label, value, min, max, onChange, help }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; help: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label} <span className="text-xs">({help})</span></span>
        <span className="font-semibold tabular-nums">{value} days</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
    </div>
  );
}

export function CashflowSimulator() {
  const [dso, setDso] = useState(47); // receivable days
  const [dio, setDio] = useState(38); // inventory days
  const [dpo, setDpo] = useState(30); // payable days
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const m = useMemo(() => {
    const ccc = dso + dio - dpo; // cash conversion cycle
    const baseCcc = 47 + 38 - 30;
    const dayRevenue = ANNUAL_REVENUE / 365;
    const dayCogs = COGS / 365;
    const wc = dso * dayRevenue + dio * dayCogs - dpo * dayCogs;
    const baseWc = 47 * dayRevenue + 38 * dayCogs - 30 * dayCogs;
    const freed = baseWc - wc; // positive = cash freed vs today
    return { ccc, baseCcc, wc, freed };
  }, [dso, dio, dpo]);

  function reset() { setDso(47); setDio(38); setDpo(30); setOut(""); }

  async function analyse() {
    setLoading(true); setOut("");
    const input = `Working-capital scenario: DSO ${dso} days, DIO ${dio} days, DPO ${dpo} days → cash conversion cycle ${m.ccc} days (today ${m.baseCcc}). Working capital tied up ≈ ${inr(m.wc)}; that ${m.freed >= 0 ? "frees" : "consumes"} ${inr(Math.abs(m.freed))} vs today. Given ~5-month runway and ₹72 L overdue receivables, tell me the fastest, realistic way to shorten this cycle and how much cash it frees.`;
    try { const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "forecast", input }) }); const j = await r.json(); setOut(j.text || "No response."); }
    catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Working-capital simulator</div>
          <div className="text-sm text-muted-foreground">Tune how fast cash moves through your business.</div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset</Button>
      </div>

      <div className="space-y-4">
        <Row label="Receivable days (DSO)" help="how fast customers pay you" value={dso} min={5} max={120} onChange={setDso} />
        <Row label="Inventory days (DIO)" help="how long stock sits" value={dio} min={3} max={120} onChange={setDio} />
        <Row label="Payable days (DPO)" help="how long you take to pay suppliers" value={dpo} min={0} max={120} onChange={setDpo} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Cash conversion cycle</div><div className={`text-lg font-bold ${m.ccc <= m.baseCcc ? "text-success" : "text-danger"}`}>{m.ccc} days</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Working capital tied up</div><div className="text-lg font-bold">{inr(m.wc)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Cash freed vs today</div><div className={`text-lg font-bold ${m.freed >= 0 ? "text-success" : "text-danger"}`}>{m.freed >= 0 ? "+" : ""}{inr(m.freed)}</div></div>
      </div>

      <Button onClick={analyse} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Analysing…" : "How do I free this cash? (ask the AI COO)"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}
