"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";

type Rep = { id: string; name: string; quota: number; sales: number };

const SEED: Rep[] = [
  { id: "s1", name: "Rahul", quota: 3_000_000, sales: 3_600_000 },
  { id: "s2", name: "Priya", quota: 3_000_000, sales: 2_400_000 },
  { id: "s3", name: "Amit", quota: 2_500_000, sales: 2_500_000 },
];

export function CommissionCalc() {
  const [baseRate, setBaseRate] = useState(3);      // % up to quota
  const [accelRate, setAccelRate] = useState(6);    // % above quota
  const [reps, setReps] = useState<Rep[]>(SEED);

  const calc = useMemo(() => {
    const people = reps.map((r) => {
      const attainment = r.quota > 0 ? (r.sales / r.quota) * 100 : 0;
      const uptoQuota = Math.min(r.sales, r.quota);
      const above = Math.max(0, r.sales - r.quota);
      const payout = uptoQuota * (baseRate / 100) + above * (accelRate / 100);
      const effRate = r.sales > 0 ? (payout / r.sales) * 100 : 0;
      return { ...r, attainment, payout, effRate };
    });
    return { people, total: people.reduce((s, p) => s + p.payout, 0), totalSales: people.reduce((s, p) => s + p.sales, 0) };
  }, [reps, baseRate, accelRate]);

  function upd(id: string, k: keyof Rep, v: string) { setReps((rs) => rs.map((r) => r.id === id ? { ...r, [k]: k === "name" ? v : Number(v) } : r)); }
  function add() { setReps((rs) => [...rs, { id: "s" + Date.now(), name: "New rep", quota: 3_000_000, sales: 0 }]); }
  function del(id: string) { setReps((rs) => rs.filter((r) => r.id !== id)); }

  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm"><span className="text-muted-foreground block mb-1">Base rate (to quota)</span><span><input className={I + " w-16"} type="number" value={baseRate} onChange={(e) => setBaseRate(Number(e.target.value))} /> %</span></label>
          <label className="text-sm"><span className="text-muted-foreground block mb-1">Accelerator (above quota)</span><span><input className={I + " w-16"} type="number" value={accelRate} onChange={(e) => setAccelRate(Number(e.target.value))} /> %</span></label>
        </div>
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add rep</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-2 font-medium">Rep</th><th className="py-2 pr-2 font-medium">Quota ₹</th><th className="py-2 pr-2 font-medium">Sales ₹</th><th className="py-2 pr-2 font-medium">Attainment</th><th className="py-2 pr-2 font-medium">Eff. rate</th><th className="py-2 font-medium">Commission</th>
          </tr></thead>
          <tbody>
            {calc.people.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-1.5 pr-2"><input className={I + " w-24"} value={p.name} onChange={(e) => upd(p.id, "name", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-28"} type="number" value={p.quota} onChange={(e) => upd(p.id, "quota", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-28"} type="number" value={p.sales} onChange={(e) => upd(p.id, "sales", e.target.value)} /></td>
                <td className={`py-1.5 pr-2 font-medium ${p.attainment >= 100 ? "text-success" : p.attainment >= 80 ? "text-warning" : "text-danger"}`}>{p.attainment.toFixed(0)}%</td>
                <td className="py-1.5 pr-2 text-muted-foreground">{p.effRate.toFixed(1)}%</td>
                <td className="py-1.5"><div className="flex items-center gap-1"><span className="font-medium">{inr(p.payout)}</span><button onClick={() => del(p.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Total commission</div><div className="text-lg font-bold">{inr(calc.total)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Total sales</div><div className="text-lg font-bold">{inr(calc.totalSales)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Commission / sales</div><div className="text-lg font-bold">{calc.totalSales ? ((calc.total / calc.totalSales) * 100).toFixed(1) : "0"}%</div></div>
      </div>
      <p className="text-xs text-muted-foreground">Accelerators above quota reward over-performance without inflating payout on easy sales. Keep total commission a predictable % of revenue.</p>
    </Card>
  );
}
