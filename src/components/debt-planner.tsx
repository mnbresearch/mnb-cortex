"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";

type Debt = { id: string; name: string; balance: number; rate: number; minPay: number };

const SEED: Debt[] = [
  { id: "d1", name: "Working-capital CC", balance: 1_500_000, rate: 16, minPay: 40000 },
  { id: "d2", name: "Equipment loan", balance: 800_000, rate: 12, minPay: 22000 },
  { id: "d3", name: "Vendor credit", balance: 300_000, rate: 24, minPay: 15000 },
];

function simulate(debts: Debt[], extra: number, strategy: "avalanche" | "snowball") {
  let list = debts.map((d) => ({ ...d, bal: d.balance }));
  let month = 0, totalInterest = 0;
  const order = () => [...list].filter((d) => d.bal > 0).sort((a, b) => strategy === "avalanche" ? b.rate - a.rate : a.bal - b.bal);
  while (list.some((d) => d.bal > 0) && month < 600) {
    month++;
    // accrue interest + pay minimums
    let pool = extra;
    for (const d of list) {
      if (d.bal <= 0) continue;
      const interest = d.bal * (d.rate / 100 / 12);
      totalInterest += interest;
      d.bal += interest;
      const pay = Math.min(d.minPay, d.bal);
      d.bal -= pay;
    }
    // throw extra at the target
    for (const t of order()) {
      if (pool <= 0) break;
      const pay = Math.min(pool, t.bal);
      t.bal -= pay; pool -= pay;
    }
  }
  return { months: month, totalInterest };
}

export function DebtPlanner() {
  const [debts, setDebts] = useState<Debt[]>(SEED);
  const [extra, setExtra] = useState(30000);
  const [strategy, setStrategy] = useState<"avalanche" | "snowball">("avalanche");

  const result = useMemo(() => simulate(debts, extra, strategy), [debts, extra, strategy]);
  const alt = useMemo(() => simulate(debts, extra, strategy === "avalanche" ? "snowball" : "avalanche"), [debts, extra, strategy]);
  const totalBalance = debts.reduce((s, d) => s + d.balance, 0);

  function upd(id: string, k: keyof Debt, v: string) { setDebts((ds) => ds.map((d) => d.id === id ? { ...d, [k]: k === "name" ? v : Number(v) } : d)); }
  function add() { setDebts((ds) => [...ds, { id: "d" + Date.now(), name: "New loan", balance: 500000, rate: 14, minPay: 15000 }]); }
  function del(id: string) { setDebts((ds) => ds.filter((d) => d.id !== id)); }

  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Your loans · total {inr(totalBalance)}</div>
          <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add loan</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 pr-2 font-medium">Loan</th><th className="py-2 pr-2 font-medium">Balance ₹</th><th className="py-2 pr-2 font-medium">Rate %</th><th className="py-2 pr-2 font-medium">Min pay ₹/mo</th><th className="py-2 font-medium"></th></tr></thead>
            <tbody>
              {debts.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2"><input className={I + " w-36"} value={d.name} onChange={(e) => upd(d.id, "name", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-28"} type="number" value={d.balance} onChange={(e) => upd(d.id, "balance", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={d.rate} onChange={(e) => upd(d.id, "rate", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-24"} type="number" value={d.minPay} onChange={(e) => upd(d.id, "minPay", e.target.value)} /></td>
                  <td className="py-1.5"><button onClick={() => del(d.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="text-muted-foreground block mb-1">Extra payment / month</span>
            <input className={I + " w-32"} type="number" value={extra} onChange={(e) => setExtra(Number(e.target.value))} /></label>
          <label className="text-sm"><span className="text-muted-foreground block mb-1">Strategy</span>
            <select className={I} value={strategy} onChange={(e) => setStrategy(e.target.value as any)}><option value="avalanche">Avalanche (highest rate first)</option><option value="snowball">Snowball (smallest first)</option></select></label>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        <Card className="p-5 border-primary/30 bg-primary/5">
          <div className="text-sm text-muted-foreground capitalize">{strategy} plan</div>
          <div className="text-2xl font-bold mt-1">{result.months < 600 ? `${result.months} months` : "60+ years"}</div>
          <div className="text-sm text-muted-foreground">to debt-free · {inr(result.totalInterest)} total interest</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">vs {strategy === "avalanche" ? "snowball" : "avalanche"}</div>
          <div className="text-lg font-semibold mt-1">{alt.months} months · {inr(alt.totalInterest)} interest</div>
          <div className={`text-sm mt-1 ${result.totalInterest <= alt.totalInterest ? "text-success" : "text-warning"}`}>
            {result.totalInterest <= alt.totalInterest ? `This plan saves ${inr(alt.totalInterest - result.totalInterest)} in interest.` : `The other plan saves ${inr(result.totalInterest - alt.totalInterest)}.`}
          </div>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">Avalanche minimises interest (pay the priciest debt first); snowball builds momentum (clear the smallest first). Both beat paying only minimums.</p>
    </div>
  );
}
