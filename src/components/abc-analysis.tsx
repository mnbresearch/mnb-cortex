"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";

type Item = { id: string; name: string; value: number };

const SEED: Item[] = [
  { id: "i1", name: "Product A", value: 4_800_000 },
  { id: "i2", name: "Product B", value: 2_400_000 },
  { id: "i3", name: "Bulk-B2B", value: 1_600_000 },
  { id: "i4", name: "Product F", value: 700_000 },
  { id: "i5", name: "Accessory-A", value: 300_000 },
  { id: "i6", name: "Spare-part-Z", value: 120_000 },
  { id: "i7", name: "Legacy-SKU", value: 60_000 },
];

/** `seed` is the workspace's REAL inventory, valued at on_hand x unit_cost. */
export function AbcAnalysis({ seed }: { seed?: Item[] } = {}) {
  const isReal = Boolean(seed && seed.length);
  const [items, setItems] = useState<Item[]>(isReal ? seed! : SEED);

  const calc = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, i) => s + i.value, 0) || 1;
    let cum = 0;
    const rows = sorted.map((it) => {
      cum += it.value;
      const cumPct = (cum / total) * 100;
      const cls = cumPct <= 80 ? "A" : cumPct <= 95 ? "B" : "C";
      return { ...it, pct: (it.value / total) * 100, cumPct, cls };
    });
    const counts = { A: rows.filter((r) => r.cls === "A").length, B: rows.filter((r) => r.cls === "B").length, C: rows.filter((r) => r.cls === "C").length };
    return { rows, total, counts };
  }, [items]);

  function upd(id: string, k: keyof Item, v: string) { setItems((its) => its.map((i) => i.id === id ? { ...i, [k]: k === "name" ? v : Number(v) } : i)); }
  function add() { setItems((its) => [...its, { id: "i" + Date.now(), name: "New item", value: 100000 }]); }
  function del(id: string) { setItems((its) => its.filter((i) => i.id !== id)); }

  const tone: Record<string, string> = { A: "bg-success/10 text-success border-success/20", B: "bg-warning/10 text-warning border-warning/20", C: "bg-muted text-muted-foreground border-border" };
  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <Card className="p-5 space-y-4">
      {!isReal && (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          These are <b>example items</b>, not yours — add inventory and this page will class your real SKUs by value.
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Badge className={tone.A}>A: {calc.counts.A} items · top 80% value</Badge>
          <Badge className={tone.B}>B: {calc.counts.B}</Badge>
          <Badge className={tone.C}>C: {calc.counts.C}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-2 font-medium">Item</th><th className="py-2 pr-2 font-medium">Annual value ₹</th><th className="py-2 pr-2 font-medium">% of total</th><th className="py-2 pr-2 font-medium">Cumulative</th><th className="py-2 font-medium">Class</th>
          </tr></thead>
          <tbody>
            {calc.rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-1.5 pr-2"><input className={I + " w-36"} value={r.name} onChange={(e) => upd(r.id, "name", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-28"} type="number" value={r.value} onChange={(e) => upd(r.id, "value", e.target.value)} /></td>
                <td className="py-1.5 pr-2 text-muted-foreground">{r.pct.toFixed(1)}%</td>
                <td className="py-1.5 pr-2 text-muted-foreground">{r.cumPct.toFixed(0)}%</td>
                <td className="py-1.5"><div className="flex items-center gap-1"><Badge className={tone[r.cls]}>{r.cls}</Badge><button onClick={() => del(r.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Class A items (usually ~20% of SKUs, ~80% of value) deserve tight stock control and your best terms. Class C can run on simple reorder rules or be pruned. Total value: {inr(calc.total)}.</p>
    </Card>
  );
}
