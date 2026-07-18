"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, TrendingDown, RotateCcw } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

// Baseline drawn from the live business snapshot (monthly).
const BASE_REVENUE = 42_500_000; // ₹4.25 Cr
const BASE_MARGIN = 0.12; // 12% net
const BASE_COSTS = BASE_REVENUE * (1 - BASE_MARGIN); // ₹3.74 Cr
const CASH_RESERVE = 18_900_000; // working capital ₹1.89 Cr
const COST_PER_HIRE = 60_000; // fully-loaded monthly

function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value > 0 && unit === "%" ? "+" : ""}{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--primary))]" />
    </div>
  );
}

export function ScenarioPlanner() {
  const [g, setG] = useState(5);     // revenue growth %/mo
  const [p, setP] = useState(0);     // price change %
  const [c, setC] = useState(3);     // cost inflation %
  const [h, setH] = useState(0);     // new hires
  const [out, setOut] = useState("");
  const [loading, setLoading] = useState(false);

  const m = useMemo(() => {
    const revenue = BASE_REVENUE * (1 + g / 100) * (1 + p / 100);
    const costs = BASE_COSTS * (1 + c / 100) + h * COST_PER_HIRE;
    const profit = revenue - costs;
    const margin = revenue > 0 ? profit / revenue : 0;
    const dProfit = profit - BASE_REVENUE * BASE_MARGIN;
    const runwayMonths = profit >= 0 ? Infinity : CASH_RESERVE / -profit;
    // 6-month revenue trajectory for the sparkline
    const traj = Array.from({ length: 6 }, (_, i) => BASE_REVENUE * Math.pow(1 + g / 100, i) * (1 + p / 100));
    return { revenue, costs, profit, margin, dProfit, runwayMonths, traj };
  }, [g, p, c, h]);

  function reset() { setG(5); setP(0); setC(3); setH(0); setOut(""); }

  async function stressTest() {
    setLoading(true); setOut("");
    const input = `Scenario the owner is considering (monthly): revenue growth ${g}%/mo, price change ${p}%, cost inflation ${c}%, ${h} new hires at ~₹${COST_PER_HIRE.toLocaleString("en-IN")}/mo each. Model output: projected monthly revenue ${inr(m.revenue)}, costs ${inr(m.costs)}, net profit ${inr(m.profit)} (margin ${(m.margin * 100).toFixed(1)}%), profit change vs today ${inr(m.dProfit)}, runway ${m.runwayMonths === Infinity ? "cash-positive" : m.runwayMonths.toFixed(1) + " months"}. Stress-test this decision.`;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "scenario", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  const max = Math.max(...m.traj), min = Math.min(...m.traj);
  const pts = m.traj.map((v, i) => `${(i / 5) * 100},${40 - ((v - min) / (max - min || 1)) * 36 - 2}`).join(" ");
  const marginUp = m.margin >= BASE_MARGIN;

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> What-if scenario planner</div>
          <div className="text-sm text-muted-foreground">Drag the levers — the model recalculates instantly, then let the AI COO stress-test it.</div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset</Button>
      </div>

      <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
        <Slider label="Revenue growth" value={g} min={-20} max={30} step={1} unit="%/mo" onChange={setG} />
        <Slider label="Price change" value={p} min={-15} max={20} step={1} unit="%" onChange={setP} />
        <Slider label="Cost inflation" value={c} min={-10} max={25} step={1} unit="%" onChange={setC} />
        <Slider label="New hires" value={h} min={0} max={20} step={1} unit="" onChange={setH} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Monthly revenue" value={inr(m.revenue)} />
        <Metric label="Net profit" value={inr(m.profit)} tone={m.profit >= 0 ? "up" : "down"} />
        <Metric label="Net margin" value={`${(m.margin * 100).toFixed(1)}%`} tone={marginUp ? "up" : "down"} />
        <Metric label="Cash runway" value={m.runwayMonths === Infinity ? "Cash-positive" : `${m.runwayMonths.toFixed(1)} mo`} tone={m.runwayMonths === Infinity ? "up" : m.runwayMonths < 4 ? "down" : "flat"} />
      </div>

      <div className="rounded-lg border p-4 bg-background/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">6-month revenue trajectory</span>
          <Badge className={m.dProfit >= 0 ? "bg-success/10 text-success border-success/20" : "bg-danger/10 text-danger border-danger/20"}>
            {m.dProfit >= 0 ? "+" : ""}{inr(m.dProfit)} profit vs today
          </Badge>
        </div>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-16">
          <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <Button onClick={stressTest} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Stress-testing…" : "Stress-test this with the AI COO"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}

function Metric({ label, value, tone = "flat" }: { label: string; value: string; tone?: "up" | "down" | "flat" }) {
  const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : null;
  const color = tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums flex items-center gap-1 ${color}`}>
        {Icon && <Icon className="h-4 w-4" />}{value}
      </div>
    </div>
  );
}
