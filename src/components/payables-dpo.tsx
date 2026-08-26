"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";

type Bill = { id: string; vendor: string; amount: number; days: number };

const SEED: Bill[] = [
  { id: "b1", vendor: "Raw material supplier", amount: 620000, days: 22 },
  { id: "b2", vendor: "Packaging vendor", amount: 180000, days: 40 },
  { id: "b3", vendor: "Logistics partner", amount: 95000, days: 15 },
];

/**
 * `seed` is the workspace's REAL unpaid payables (supplier invoices and
 * committed purchase orders), passed from the server. The sample below is used
 * only when there is nothing real to show, and is labelled as such — this page
 * is headed "What you owe, how long you take, and when to pay early", which is
 * a claim about the reader's own money.
 */
export function PayablesDpo({ seed, purchasesHint }: { seed?: Bill[]; purchasesHint?: number } = {}) {
  const isReal = Boolean(seed && seed.length);
  const [bills, setBills] = useState<Bill[]>(isReal ? seed! : SEED);
  const [purchases, setPurchases] = useState(purchasesHint && purchasesHint > 0 ? purchasesHint : 5_000_000);
  // early payment discount terms
  const [discPct, setDiscPct] = useState(2);
  const [discDays, setDiscDays] = useState(10);
  const [netDays, setNetDays] = useState(30);

  const m = useMemo(() => {
    const total = bills.reduce((s, b) => s + b.amount, 0);
    const dpo = purchases > 0 ? (total / purchases) * 30 : 0;
    // Effective annualised cost of NOT taking the discount
    const held = Math.max(netDays - discDays, 1);
    const effAnnual = (discPct / (100 - discPct)) * (365 / held) * 100;
    const worthTaking = effAnnual > 12; // vs ~12% cost of capital
    return { total, dpo, effAnnual, worthTaking };
  }, [bills, purchases, discPct, discDays, netDays]);

  function upd(id: string, k: keyof Bill, v: string) { setBills((xs) => xs.map((b) => b.id === id ? { ...b, [k]: k === "vendor" ? v : Number(v) } : b)); }
  function add() { setBills((xs) => [...xs, { id: "b" + Date.now(), vendor: "New vendor", amount: 100000, days: 30 }]); }
  function del(id: string) { setBills((xs) => xs.filter((b) => b.id !== id)); }

  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4">
      {!isReal && (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          These are <b>example bills</b>, not yours — add payable invoices or purchase orders and this page will compute your real DPO.
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="Total payable" value={inr(m.total)} />
        <Stat label="DPO" value={`${m.dpo.toFixed(0)} days`} highlight />
        <Stat label="Monthly purchases" value={inr(purchases)} />
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Open vendor bills</div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1">Monthly purchases ₹
              <input className={I + " w-28"} type="number" value={purchases} onChange={(e) => setPurchases(Number(e.target.value))} /></label>
            <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 pr-2 font-medium">Vendor</th><th className="py-2 pr-2 font-medium">Amount ₹</th><th className="py-2 pr-2 font-medium">Days to pay</th><th className="py-2 font-medium"></th></tr></thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2"><input className={I + " w-44"} value={b.vendor} onChange={(e) => upd(b.id, "vendor", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-28"} type="number" value={b.amount} onChange={(e) => upd(b.id, "amount", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-20"} type="number" value={b.days} onChange={(e) => upd(b.id, "days", e.target.value)} /></td>
                  <td className="py-1.5"><button onClick={() => del(b.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-semibold">Early-payment discount — take it or hold the cash?</div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <input className={I + " w-16"} type="number" value={discPct} onChange={(e) => setDiscPct(Number(e.target.value))} /> % discount if paid within
          <input className={I + " w-16"} type="number" value={discDays} onChange={(e) => setDiscDays(Number(e.target.value))} /> days, else net
          <input className={I + " w-16"} type="number" value={netDays} onChange={(e) => setNetDays(Number(e.target.value))} /> days
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Effective annual return of paying early" value={`${m.effAnnual.toFixed(0)}%`} cls={m.worthTaking ? "text-success" : "text-warning"} highlight />
          <div className="rounded-lg border p-3 flex items-center text-sm">
            {m.worthTaking
              ? <span><b className="text-success">Take the discount.</b> It beats your cost of capital — paying early earns an effective {m.effAnnual.toFixed(0)}%.</span>
              : <span><b className="text-warning">Hold the cash.</b> The discount is worth less than keeping the money working elsewhere.</span>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">A “2/10 net 30” term is a ~37% annualised return if you pay on day 10 instead of 30 — almost always worth taking when you have the cash.</p>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
