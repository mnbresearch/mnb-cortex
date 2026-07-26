"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";

type Round = { id: string; name: string; raise: number; preMoney: number; esop: number };

const R0: Round[] = [
  { id: "r1", name: "Seed", raise: 20_000_000, preMoney: 80_000_000, esop: 10 },
];

export function CapTable() {
  const [founderShares] = useState(10_000_000); // starting founder shares (100%)
  const [rounds, setRounds] = useState<Round[]>(R0);

  const model = useMemo(() => {
    let totalShares = founderShares;
    let founder = founderShares;
    let esopPool = 0;
    const investors: { name: string; shares: number }[] = [];
    const steps: { name: string; founderPct: number; investorPct: number; esopPct: number; postMoney: number; price: number }[] = [];

    for (const r of rounds) {
      const postMoney = r.preMoney + r.raise;
      // ESOP top-up (pre-money, dilutes founders): add pool to reach r.esop% post
      const targetEsopShares = 0; // simplified: treat esop as a % added to pool below
      const pricePerShare = r.preMoney / totalShares;
      const newInvestorShares = r.raise / pricePerShare;
      // ESOP: expand pool so esop% of post-round belongs to pool
      let poolAdd = 0;
      const preRoundTotal = totalShares + newInvestorShares;
      if (r.esop > 0) {
        // pool should be esop% of final; solve: (esopPool+poolAdd)/(preRoundTotal+poolAdd) = esop/100
        const e = r.esop / 100;
        poolAdd = Math.max(0, (e * preRoundTotal - esopPool) / (1 - e));
      }
      totalShares = preRoundTotal + poolAdd;
      esopPool += poolAdd;
      investors.push({ name: r.name, shares: newInvestorShares });
      const invTotal = investors.reduce((s, i) => s + i.shares, 0);
      steps.push({
        name: r.name,
        founderPct: (founder / totalShares) * 100,
        investorPct: (invTotal / totalShares) * 100,
        esopPct: (esopPool / totalShares) * 100,
        postMoney, price: pricePerShare,
      });
      void targetEsopShares;
    }
    const last = steps[steps.length - 1];
    return { steps, last, totalShares, founder, esopPool, investors };
  }, [rounds, founderShares]);

  function add() { setRounds((r) => [...r, { id: "r" + Date.now(), name: "Series " + String.fromCharCode(65 + r.length), raise: 50_000_000, preMoney: 250_000_000, esop: 0 }]); }
  function del(id: string) { setRounds((r) => r.filter((x) => x.id !== id)); }
  function upd(id: string, f: keyof Round, v: string) { setRounds((r) => r.map((x) => x.id === id ? { ...x, [f]: f === "name" ? v : Number(v) } : x)); }

  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Funding rounds</div>
          <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add round</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-2 font-medium">Round</th><th className="py-2 pr-2 font-medium">Raise ₹</th><th className="py-2 pr-2 font-medium">Pre-money ₹</th><th className="py-2 pr-2 font-medium">New ESOP %</th><th className="py-2 font-medium"></th>
            </tr></thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2"><input className={I + " w-24"} value={r.name} onChange={(e) => upd(r.id, "name", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-28"} type="number" value={r.raise} onChange={(e) => upd(r.id, "raise", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-32"} type="number" value={r.preMoney} onChange={(e) => upd(r.id, "preMoney", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={r.esop} onChange={(e) => upd(r.id, "esop", e.target.value)} /></td>
                  <td className="py-1.5"><button onClick={() => del(r.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-semibold">Ownership after each round</div>
        <div className="space-y-3">
          {model.steps.map((s) => (
            <div key={s.name}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{s.name} <span className="text-xs text-muted-foreground">· post-money {inr(s.postMoney)}</span></span>
                <span className="text-xs text-muted-foreground">Founders {s.founderPct.toFixed(1)}%</span>
              </div>
              <div className="flex h-4 rounded-full overflow-hidden">
                <div className="brand-gradient" style={{ width: `${s.founderPct}%` }} title={`Founders ${s.founderPct.toFixed(1)}%`} />
                <div className="bg-primary/50" style={{ width: `${s.investorPct}%` }} title={`Investors ${s.investorPct.toFixed(1)}%`} />
                <div className="bg-warning/60" style={{ width: `${s.esopPct}%` }} title={`ESOP ${s.esopPct.toFixed(1)}%`} />
              </div>
            </div>
          ))}
        </div>
        {model.last && (
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Founders now own</div><div className="text-xl font-bold">{model.last.founderPct.toFixed(1)}%</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Investors</div><div className="text-xl font-bold">{model.last.investorPct.toFixed(1)}%</div></div>
            <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">ESOP pool</div><div className="text-xl font-bold">{model.last.esopPct.toFixed(1)}%</div></div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Simplified model (priced rounds, ESOP as post-round %). Real term sheets add liquidation preferences, SAFEs, anti-dilution and more — use this to build intuition, not for legal docs.</p>
      </Card>
    </div>
  );
}
