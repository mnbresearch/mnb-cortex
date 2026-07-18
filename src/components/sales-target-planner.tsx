"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

const MONTHS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; fmt: (n: number) => string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
    </div>
  );
}

export function SalesTargetPlanner() {
  const [annual, setAnnual] = useState(600000000); // ₹60 Cr
  const [reps, setReps] = useState(6);
  const [ramp, setRamp] = useState(2); // % MoM ramp

  const m = useMemo(() => {
    const g = ramp / 100;
    const weights = MONTHS.map((_, i) => Math.pow(1 + g, i));
    const sum = weights.reduce((a, b) => a + b, 0);
    const base = annual / sum;
    const monthly = weights.map((w) => base * w);
    const perRepAvg = annual / 12 / reps;
    const max = Math.max(...monthly);
    return { monthly, perRepAvg, max };
  }, [annual, reps, ramp]);

  return (
    <Card className="p-5 space-y-5">
      <div><div className="font-semibold">Sales target planner</div><div className="text-sm text-muted-foreground">Turn an annual number into a monthly, per-rep plan.</div></div>
      <div className="grid sm:grid-cols-3 gap-4">
        <Slider label="Annual target" value={annual} min={50000000} max={2000000000} step={10000000} onChange={setAnnual} fmt={(v) => inr(v)} />
        <Slider label="Sales reps" value={reps} min={1} max={30} step={1} onChange={setReps} fmt={(v) => v + ""} />
        <Slider label="Monthly ramp" value={ramp} min={0} max={8} step={0.5} onChange={setRamp} fmt={(v) => v + "%"} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Avg per rep / month</div><div className="text-lg font-bold">{inr(m.perRepAvg)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Q1 target (Apr-Jun)</div><div className="text-lg font-bold">{inr(m.monthly.slice(0,3).reduce((a,b)=>a+b,0))}</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Exit-month run-rate</div><div className="text-lg font-bold">{inr(m.monthly[11])}</div></div>
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-2">Monthly targets</div>
        <div className="flex items-end gap-1 h-28">
          {m.monthly.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t bg-primary/70" style={{ height: `${(v / m.max) * 100}%` }} title={inr(v)} />
              <span className="text-[10px] text-muted-foreground">{MONTHS[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
