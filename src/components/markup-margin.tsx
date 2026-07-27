"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

export function MarkupMargin() {
  const [cost, setCost] = useState(620);
  const [price, setPrice] = useState(1000);

  const m = useMemo(() => {
    const profit = price - cost;
    const markup = cost > 0 ? (profit / cost) * 100 : 0;
    const margin = price > 0 ? (profit / price) * 100 : 0;
    return { profit, markup, margin };
  }, [cost, price]);

  // Reverse helpers: set price from a target margin / markup
  function fromMargin(marginPct: number) { if (marginPct >= 100) return; setPrice(Math.round(cost / (1 - marginPct / 100))); }
  function fromMarkup(markupPct: number) { setPrice(Math.round(cost * (1 + markupPct / 100))); }

  const REF = [10, 20, 30, 40, 50, 60].map((margin) => ({ margin, markup: (margin / (100 - margin)) * 100 }));
  const F = (label: string, value: number, set: (n: number) => void) => (
    <label className="block"><span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 mt-1 rounded-lg border bg-background px-3 h-10 focus-within:ring-2 focus-within:ring-ring"><span className="text-xs text-muted-foreground">₹</span>
        <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1 bg-transparent text-sm outline-none" /></div></label>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">{F("Cost", cost, setCost)}{F("Selling price", price, setPrice)}</div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Profit" value={inr(m.profit)} cls={m.profit >= 0 ? "text-success" : "text-danger"} />
          <Stat label="Markup" value={`${m.markup.toFixed(1)}%`} />
          <Stat label="Margin" value={`${m.margin.toFixed(1)}%`} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => fromMarkup(100)} className="text-xs rounded border px-2 py-1 hover:bg-accent">Keystone (2× cost)</button>
          {[40, 50, 60].map((mg) => <button key={mg} onClick={() => fromMargin(mg)} className="text-xs rounded border px-2 py-1 hover:bg-accent">Set {mg}% margin</button>)}
        </div>
        <p className="text-xs text-muted-foreground">Markup is on cost; margin is on price. A 50% markup is only a 33% margin — the difference trips up a lot of pricing.</p>
      </Card>

      <Card className="p-5">
        <div className="font-semibold mb-2">Margin → markup reference</div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 font-medium">If margin is…</th><th className="py-2 font-medium">…markup must be</th></tr></thead>
          <tbody>{REF.map((r) => <tr key={r.margin} className="border-b last:border-0"><td className="py-1.5">{r.margin}%</td><td className="py-1.5 font-medium">{r.markup.toFixed(0)}%</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
