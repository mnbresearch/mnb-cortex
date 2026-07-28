"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { inr } from "@/lib/utils";

type Band = { id: string; label: string; count: number; avg: number; hike: number };

const SEED: Band[] = [
  { id: "b1", label: "Top performers", count: 4, avg: 90000, hike: 15 },
  { id: "b2", label: "Strong", count: 10, avg: 65000, hike: 10 },
  { id: "b3", label: "Meets expectations", count: 20, avg: 45000, hike: 7 },
  { id: "b4", label: "Below", count: 6, avg: 38000, hike: 3 },
];

export function AppraisalPlanner() {
  const [bands, setBands] = useState<Band[]>(SEED);
  const [budgetPct, setBudgetPct] = useState(9);

  const m = useMemo(() => {
    const rows = bands.map((b) => {
      const monthly = b.count * b.avg;
      const hikeCost = monthly * (b.hike / 100);
      return { ...b, monthly, hikeCost, annualHike: hikeCost * 12 };
    });
    const currentMonthly = rows.reduce((s, r) => s + r.monthly, 0);
    const totalHikeMonthly = rows.reduce((s, r) => s + r.hikeCost, 0);
    const blendedPct = currentMonthly ? (totalHikeMonthly / currentMonthly) * 100 : 0;
    const budgetMonthly = currentMonthly * (budgetPct / 100);
    const overUnder = budgetMonthly - totalHikeMonthly;
    return { rows, currentMonthly, totalHikeMonthly, annualHike: totalHikeMonthly * 12, blendedPct, budgetMonthly, overUnder };
  }, [bands, budgetPct]);

  function upd(id: string, k: keyof Band, v: string) { setBands((xs) => xs.map((b) => b.id === id ? { ...b, [k]: k === "label" ? v : Number(v) } : b)); }
  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold">Appraisal bands</div>
          <label className="text-sm text-muted-foreground flex items-center gap-1">Hike budget
            <input className={I + " w-16"} type="number" value={budgetPct} onChange={(e) => setBudgetPct(Number(e.target.value))} /> % of payroll</label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 pr-2 font-medium">Band</th><th className="py-2 pr-2 font-medium">Headcount</th><th className="py-2 pr-2 font-medium">Avg salary/mo</th><th className="py-2 pr-2 font-medium">Hike %</th><th className="py-2 font-medium">Annual cost</th></tr></thead>
            <tbody>
              {m.rows.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2"><input className={I + " w-40"} value={b.label} onChange={(e) => upd(b.id, "label", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={b.count} onChange={(e) => upd(b.id, "count", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-24"} type="number" value={b.avg} onChange={(e) => upd(b.id, "avg", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={b.hike} onChange={(e) => upd(b.id, "hike", e.target.value)} /></td>
                  <td className="py-1.5 font-medium tabular-nums">{inr(b.annualHike)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Current payroll/mo" value={inr(m.currentMonthly)} />
        <Stat label="Blended hike" value={`${m.blendedPct.toFixed(1)}%`} />
        <Stat label="Annual hike cost" value={inr(m.annualHike)} highlight />
        <Stat label="Vs budget" value={m.overUnder >= 0 ? `${inr(m.overUnder)} spare` : `${inr(-m.overUnder)} over`} cls={m.overUnder >= 0 ? "text-success" : "text-danger"} />
      </div>
      <p className="text-xs text-muted-foreground">Keep the blended hike near your budget line. If you're over, protect top-performer raises and trim the middle band — differentiation retains the people who matter most.</p>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
