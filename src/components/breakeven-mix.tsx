"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";

type Prod = { id: string; name: string; price: number; varCost: number; volume: number };

const SEED: Prod[] = [
  { id: "p1", name: "Premium-X", price: 1200, varCost: 620, volume: 4000 },
  { id: "p2", name: "Standard-100", price: 800, varCost: 500, volume: 6000 },
  { id: "p3", name: "Value-Tier", price: 500, varCost: 380, volume: 5000 },
];

export function BreakevenMix() {
  const [fixed, setFixed] = useState(2_500_000);
  const [prods, setProds] = useState<Prod[]>(SEED);

  const calc = useMemo(() => {
    const rows = prods.map((p) => {
      const cm = p.price - p.varCost;
      const cmPct = p.price ? (cm / p.price) * 100 : 0;
      const contribution = cm * p.volume;
      const revenue = p.price * p.volume;
      return { ...p, cm, cmPct, contribution, revenue };
    });
    const totalContribution = rows.reduce((s, r) => s + r.contribution, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalVolume = rows.reduce((s, r) => s + r.volume, 0);
    const weightedCm = totalVolume ? totalContribution / totalVolume : 0;
    const weightedCmPct = totalRevenue ? (totalContribution / totalRevenue) * 100 : 0;
    const breakEvenUnits = weightedCm > 0 ? Math.ceil(fixed / weightedCm) : Infinity;
    const breakEvenRevenue = weightedCmPct > 0 ? fixed / (weightedCmPct / 100) : Infinity;
    const profit = totalContribution - fixed;
    return { rows, totalContribution, totalRevenue, weightedCm, weightedCmPct, breakEvenUnits, breakEvenRevenue, profit };
  }, [prods, fixed]);

  function upd(id: string, k: keyof Prod, v: string) { setProds((ps) => ps.map((p) => p.id === id ? { ...p, [k]: k === "name" ? v : Number(v) } : p)); }
  function add() { setProds((ps) => [...ps, { id: "p" + Date.now(), name: "New product", price: 500, varCost: 300, volume: 1000 }]); }
  function del(id: string) { setProds((ps) => ps.filter((p) => p.id !== id)); }

  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-sm"><span className="text-muted-foreground block mb-1">Fixed costs / month</span>
            <div className="flex items-center gap-1 rounded-lg border bg-background px-3 h-10"><span className="text-xs text-muted-foreground">₹</span><input className="w-32 bg-transparent text-sm outline-none" type="number" value={fixed} onChange={(e) => setFixed(Number(e.target.value))} /></div></label>
          <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add product</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 pr-2 font-medium">Product</th><th className="py-2 pr-2 font-medium">Price ₹</th><th className="py-2 pr-2 font-medium">Var cost ₹</th><th className="py-2 pr-2 font-medium">Units/mo</th><th className="py-2 pr-2 font-medium">CM</th><th className="py-2 font-medium">Contribution</th></tr></thead>
            <tbody>
              {calc.rows.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2"><input className={I + " w-32"} value={p.name} onChange={(e) => upd(p.id, "name", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-20"} type="number" value={p.price} onChange={(e) => upd(p.id, "price", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-20"} type="number" value={p.varCost} onChange={(e) => upd(p.id, "varCost", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-20"} type="number" value={p.volume} onChange={(e) => upd(p.id, "volume", e.target.value)} /></td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{p.cmPct.toFixed(0)}%</td>
                  <td className="py-1.5"><div className="flex items-center gap-1"><span className="font-medium">{inr(p.contribution)}</span><button onClick={() => del(p.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Blended CM" value={`${calc.weightedCmPct.toFixed(1)}%`} />
        <Stat label="Break-even units" value={calc.breakEvenUnits === Infinity ? "—" : `${calc.breakEvenUnits.toLocaleString("en-IN")}`} />
        <Stat label="Break-even revenue" value={calc.breakEvenRevenue === Infinity ? "—" : inr(calc.breakEvenRevenue)} />
        <Stat label="Monthly profit" value={inr(calc.profit)} cls={calc.profit >= 0 ? "text-success" : "text-danger"} highlight />
      </div>
      <p className="text-xs text-muted-foreground">The blended contribution margin depends on your product mix — selling more of your high-margin lines lowers the break-even point even at the same total revenue.</p>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
