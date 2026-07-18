"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

function Field({ label, value, onChange, prefix = "₹" }: { label: string; value: number; onChange: (n: number) => void; prefix?: string }) {
  return (
    <label className="block">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring">
        <span className="text-sm text-muted-foreground">{prefix}</span>
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" />
      </div>
    </label>
  );
}

export function UnitEconomics() {
  const [price, setPrice] = useState(1000);
  const [varCost, setVarCost] = useState(620);
  const [fixed, setFixed] = useState(3_500_000);
  const [volume, setVolume] = useState(15000);

  const m = useMemo(() => {
    const contribution = price - varCost;
    const cmPct = price > 0 ? (contribution / price) * 100 : 0;
    const beUnits = contribution > 0 ? Math.ceil(fixed / contribution) : Infinity;
    const beRevenue = beUnits === Infinity ? Infinity : beUnits * price;
    const profit = volume * contribution - fixed;
    const marginOfSafety = beUnits === Infinity || volume === 0 ? 0 : ((volume - beUnits) / volume) * 100;
    return { contribution, cmPct, beUnits, beRevenue, profit, marginOfSafety };
  }, [price, varCost, fixed, volume]);

  return (
    <Card className="p-5 space-y-5">
      <div>
        <div className="font-semibold">Unit economics & break-even</div>
        <div className="text-sm text-muted-foreground">Enter your numbers per unit and per month.</div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Selling price / unit" value={price} onChange={setPrice} />
        <Field label="Variable cost / unit" value={varCost} onChange={setVarCost} />
        <Field label="Fixed costs / month" value={fixed} onChange={setFixed} />
        <Field label="Units sold / month" value={volume} onChange={setVolume} prefix="#" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Contribution / unit" value={inr(m.contribution)} tone={m.contribution > 0 ? "up" : "down"} />
        <Stat label="Contribution margin" value={`${m.cmPct.toFixed(1)}%`} tone={m.cmPct >= 30 ? "up" : "flat"} />
        <Stat label="Break-even" value={m.beUnits === Infinity ? "—" : `${m.beUnits.toLocaleString("en-IN")} units`} />
        <Stat label="Monthly profit" value={inr(m.profit)} tone={m.profit >= 0 ? "up" : "down"} />
      </div>
      <div className="rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground">Margin of safety: </span>
        <b className={m.marginOfSafety >= 20 ? "text-success" : m.marginOfSafety > 0 ? "text-warning" : "text-danger"}>
          {m.marginOfSafety.toFixed(0)}%
        </b>
        <span className="text-muted-foreground"> — sales can fall this much before you hit break-even.</span>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone = "flat" }: { label: string; value: string; tone?: "up" | "down" | "flat" }) {
  const c = tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-foreground";
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${c}`}>{value}</div></div>;
}
