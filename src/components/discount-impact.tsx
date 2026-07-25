"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{value}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
    </div>
  );
}

export function DiscountImpact() {
  const [price, setPrice] = useState(1000);
  const [cost, setCost] = useState(620);
  const [discount, setDiscount] = useState(10);
  const [units, setUnits] = useState(1000);

  const m = useMemo(() => {
    const marginBefore = price - cost;
    const marginPctBefore = price ? (marginBefore / price) * 100 : 0;
    const newPrice = price * (1 - discount / 100);
    const marginAfter = newPrice - cost;
    const marginPctAfter = newPrice ? (marginAfter / newPrice) * 100 : 0;
    // To hold the same total gross profit, volume must rise by marginBefore/marginAfter.
    const gpBefore = marginBefore * units;
    const neededUnits = marginAfter > 0 ? gpBefore / marginAfter : Infinity;
    const upliftPct = marginAfter > 0 ? (neededUnits / units - 1) * 100 : Infinity;
    const belowCost = newPrice < cost;
    return { marginBefore, marginPctBefore, newPrice, marginAfter, marginPctAfter, neededUnits, upliftPct, belowCost };
  }, [price, cost, discount, units]);

  return (
    <Card className="p-5 space-y-5">
      <div>
        <div className="font-semibold">Discount impact</div>
        <div className="text-sm text-muted-foreground">See how much extra volume a discount really needs to pay for itself.</div>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
        <Slider label="Selling price / unit" value={price} min={50} max={10000} step={50} unit="₹" onChange={setPrice} />
        <Slider label="Cost / unit" value={cost} min={0} max={9000} step={25} unit="₹" onChange={setCost} />
        <Slider label="Discount" value={discount} min={0} max={60} step={1} unit="%" onChange={setDiscount} />
        <Slider label="Current units / month" value={units} min={10} max={100000} step={10} unit="" onChange={setUnits} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Margin before" value={`${m.marginPctBefore.toFixed(1)}%`} sub={inr(m.marginBefore) + "/unit"} />
        <Stat label="Margin after discount" value={`${m.marginPctAfter.toFixed(1)}%`} sub={inr(m.marginAfter) + "/unit"} cls={m.belowCost ? "text-danger" : m.marginPctAfter < m.marginPctBefore / 2 ? "text-warning" : ""} />
        <Stat label="New price" value={inr(m.newPrice)} sub={`was ${inr(price)}`} />
        <Stat label="Break-even volume" value={m.upliftPct === Infinity ? "impossible" : `+${m.upliftPct.toFixed(0)}%`} sub={m.upliftPct === Infinity ? "sells below cost" : `${Math.ceil(m.neededUnits).toLocaleString("en-IN")} units`} cls={m.upliftPct === Infinity ? "text-danger" : m.upliftPct > 40 ? "text-warning" : "text-foreground"} />
      </div>

      <div className={`rounded-lg border p-4 text-sm ${m.belowCost ? "border-danger/30 bg-danger/5" : m.upliftPct > 40 ? "border-warning/30 bg-warning/5" : "border-primary/30 bg-primary/5"}`}>
        {m.belowCost ? (
          <span className="text-danger">A {discount}% discount sells <b>below cost</b> — you'd lose money on every unit. Don't.</span>
        ) : (
          <span>A <b>{discount}% discount</b> cuts your margin from <b>{m.marginPctBefore.toFixed(0)}%</b> to <b>{m.marginPctAfter.toFixed(0)}%</b>. To make the same total profit you'd need to sell <b>{m.upliftPct.toFixed(0)}% more units</b> — {m.upliftPct > 40 ? "a very tall order. A smaller discount or added value usually beats this." : "achievable if the promotion genuinely drives demand."}</span>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value, sub, cls = "" }: { label: string; value: string; sub?: string; cls?: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>;
}
