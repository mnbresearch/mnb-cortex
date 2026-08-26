"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";

type Inv = { id: string; client: string; amount: number; days: number };

// Placeholder rows shown only until the workspace has real invoices. These
// were named "Reliance Retail" and "Tata Croma" — real, trademarked companies
// presented as this customer's debtors, which is both misleading and a
// needless legal exposure.
const SEED: Inv[] = [
  { id: "i1", client: "Example retailer", amount: 850000, days: 12 },
  { id: "i2", client: "Example electronics chain", amount: 420000, days: 38 },
  { id: "i3", client: "Example distributor", amount: 260000, days: 74 },
  { id: "i4", client: "Example kirana chain", amount: 180000, days: 105 },
];

const BUCKETS = [
  { label: "Current (0–30)", test: (d: number) => d <= 30, tone: "text-success" },
  { label: "31–60", test: (d: number) => d > 30 && d <= 60, tone: "text-foreground" },
  { label: "61–90", test: (d: number) => d > 60 && d <= 90, tone: "text-warning" },
  { label: "90+", test: (d: number) => d > 90, tone: "text-danger" },
];

/**
 * `seed` is the workspace's REAL unpaid receivables, passed from the server.
 *
 * This component previously always started from SEED — four invented invoices
 * — under the page heading "Who owes you, how old it is, and who to chase
 * first". A customer with a hundred real invoices in Cortex saw none of them
 * here, and the totals, DSO and "chase first" list all described a fiction.
 * The sample now appears only when there is genuinely nothing to show, and
 * says so.
 */
export function ReceivablesAging({ seed, creditSalesHint }: { seed?: Inv[]; creditSalesHint?: number } = {}) {
  const isReal = Boolean(seed && seed.length);
  const [invs, setInvs] = useState<Inv[]>(isReal ? seed! : SEED);
  const [creditSales, setCreditSales] = useState(creditSalesHint && creditSalesHint > 0 ? creditSalesHint : 6_000_000);

  const m = useMemo(() => {
    const total = invs.reduce((s, i) => s + i.amount, 0);
    const overdue = invs.filter((i) => i.days > 30).reduce((s, i) => s + i.amount, 0);
    const buckets = BUCKETS.map((b) => ({ ...b, amount: invs.filter((i) => b.test(i.days)).reduce((s, i) => s + i.amount, 0) }));
    // DSO ≈ receivables / monthly credit sales * 30
    const dso = creditSales > 0 ? (total / creditSales) * 30 : 0;
    const priority = [...invs].sort((a, b) => b.amount * b.days - a.amount * a.days).slice(0, 4);
    return { total, overdue, buckets, dso, priority };
  }, [invs, creditSales]);

  function upd(id: string, k: keyof Inv, v: string) { setInvs((xs) => xs.map((i) => i.id === id ? { ...i, [k]: k === "client" ? v : Number(v) } : i)); }
  function add() { setInvs((xs) => [...xs, { id: "i" + Date.now(), client: "New client", amount: 100000, days: 15 }]); }
  function del(id: string) { setInvs((xs) => xs.filter((i) => i.id !== id)); }

  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4">
      {!isReal && (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          These are <b>example invoices</b>, not yours — add invoices in Finance or import them and this
          page will age your real book, work out your DSO, and tell you who to chase first.
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total receivable" value={inr(m.total)} />
        <Stat label="Overdue (30+)" value={inr(m.overdue)} cls={m.overdue > 0 ? "text-danger" : "text-success"} />
        <Stat label="DSO" value={`${m.dso.toFixed(0)} days`} highlight />
        <Stat label="Overdue share" value={m.total ? `${((m.overdue / m.total) * 100).toFixed(0)}%` : "0%"} />
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Open invoices</div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1">Monthly credit sales ₹
              <input className={I + " w-28"} type="number" value={creditSales} onChange={(e) => setCreditSales(Number(e.target.value))} /></label>
            <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="py-2 pr-2 font-medium">Client</th><th className="py-2 pr-2 font-medium">Amount ₹</th><th className="py-2 pr-2 font-medium">Days outstanding</th><th className="py-2 font-medium">Bucket</th></tr></thead>
            <tbody>
              {invs.map((i) => {
                const b = BUCKETS.find((x) => x.test(i.days))!;
                return (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2"><input className={I + " w-40"} value={i.client} onChange={(e) => upd(i.id, "client", e.target.value)} /></td>
                    <td className="py-1.5 pr-2"><input className={I + " w-28"} type="number" value={i.amount} onChange={(e) => upd(i.id, "amount", e.target.value)} /></td>
                    <td className="py-1.5 pr-2"><input className={I + " w-20"} type="number" value={i.days} onChange={(e) => upd(i.id, "days", e.target.value)} /></td>
                    <td className="py-1.5"><div className="flex items-center gap-2"><span className={`text-xs font-medium ${b.tone}`}>{b.label}</span><button onClick={() => del(i.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="font-semibold mb-2">Aging buckets</div>
          {m.buckets.map((b) => (
            <div key={b.label} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
              <span className={b.tone}>{b.label}</span><span className="font-medium tabular-nums">{inr(b.amount)}</span>
            </div>
          ))}
        </Card>
        <Card className="p-5">
          <div className="font-semibold mb-2">Chase these first</div>
          <div className="text-xs text-muted-foreground mb-2">Ranked by amount × days — biggest, oldest money.</div>
          {m.priority.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
              <span>{i + 1}. {p.client} <span className="text-muted-foreground">· {p.days}d</span></span><span className="font-medium tabular-nums">{inr(p.amount)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
