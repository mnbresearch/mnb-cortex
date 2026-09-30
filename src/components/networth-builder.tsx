"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";
import { ExampleFigures } from "@/components/example-figures";
import { orDefault, seedSource, type WorkspaceSeed } from "@/lib/seed-types";

type Row = { id: string; label: string; amount: number };
const row = (label: string, amount: number): Row => ({ id: Math.random().toString(36).slice(2), label, amount });

/*
  FOUR OF THESE NINE LINES ARE REAL. THE OTHER FIVE CANNOT BE.

  Cash, receivables, stock at cost and payables are all recorded in the
  workspace, and they are the four that move week to week — exactly the ones
  worth not retyping. Plant & equipment, investments, the two loans and tax
  due are not stored anywhere: there is no fixed-asset register and no debt
  schedule in this product.

  So this is a PARTIAL seed, and the banner says which half is which. The
  alternative — leaving all nine invented because five of them must be —
  is what the page did before, and it presented a fictional balance sheet in
  the second person.
*/
const assetRows = (s?: WorkspaceSeed): Row[] => [
  row("Cash & bank", orDefault(s?.cash, 1_500_000)),
  row("Receivables", orDefault(s?.receivables, 2_200_000)),
  row("Inventory", orDefault(s?.inventoryValue, 1_800_000)),
  row("Plant & equipment", 4_000_000),
  row("Investments", 800_000),
];
const liabRows = (s?: WorkspaceSeed): Row[] => [
  row("Payables", orDefault(s?.payables, 1_600_000)),
  row("Working-capital loan", 2_500_000),
  row("Term loan", 3_000_000),
  row("GST / tax due", 400_000),
];

function Ledger({ title, rows, setRows, tone }: { title: string; rows: Row[]; setRows: (r: Row[]) => void; tone: string }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <Card className="p-5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{title}</div>
        <Button size="sm" variant="outline" onClick={() => setRows([...rows, row("New line", 0)])}><Plus className="h-4 w-4" /></Button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <input className={I + " flex-1"} value={r.label} onChange={(e) => setRows(rows.map((x) => x.id === r.id ? { ...x, label: e.target.value } : x))} />
          <input className={I + " w-32"} type="number" value={r.amount} onChange={(e) => setRows(rows.map((x) => x.id === r.id ? { ...x, amount: Number(e.target.value) } : x))} />
          <button onClick={() => setRows(rows.filter((x) => x.id !== r.id))} className="text-muted-foreground hover:text-danger min-h-11 min-w-11 p-2" aria-label="Remove"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <div className={`flex items-center justify-between border-t pt-2 font-semibold ${tone}`}><span>Total {title.toLowerCase()}</span><span className="tabular-nums">{inr(total)}</span></div>
    </Card>
  );
}

export function NetWorthBuilder({ seed }: { seed?: WorkspaceSeed } = {}) {
  const [assets, setAssets] = useState<Row[]>(() => assetRows(seed));
  const [liabs, setLiabs] = useState<Row[]>(() => liabRows(seed));
  const m = useMemo(() => {
    const a = assets.reduce((s, r) => s + r.amount, 0);
    const l = liabs.reduce((s, r) => s + r.amount, 0);
    return { a, l, net: a - l, ratio: l ? a / l : Infinity };
  }, [assets, liabs]);

  return (
    <div className="space-y-4">
      <ExampleFigures
        source={seedSource(seed, "cash", "receivables", "inventoryValue", "payables")}
        what="cash, receivables, stock and payables"
        note="Those four come from your workspace. Plant & equipment, investments, both loans and tax due are still examples — this product keeps no fixed-asset register or debt schedule, so type those in."
      />
      <div className="grid lg:grid-cols-2 gap-4">
        <Ledger title="Assets" rows={assets} setRows={setAssets} tone="text-success" />
        <Ledger title="Liabilities" rows={liabs} setRows={setLiabs} tone="text-danger" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="Total assets" value={inr(m.a)} />
        <Stat label="Total liabilities" value={inr(m.l)} />
        <Stat label="Net worth (equity)" value={inr(m.net)} cls={m.net >= 0 ? "text-success" : "text-danger"} highlight />
      </div>
      <Card className="p-5 text-sm">
        <span className="text-muted-foreground">Assets-to-liabilities ratio: </span>
        <b className={m.ratio >= 1.5 ? "text-success" : m.ratio >= 1 ? "text-warning" : "text-danger"}>{m.ratio === Infinity ? "∞" : m.ratio.toFixed(2) + "×"}</b>
        <span className="text-muted-foreground"> — above 1.5× is comfortable; below 1× means liabilities exceed assets. Net worth is what the business is worth on paper after clearing every debt.</span>
      </Card>
    </div>
  );
}

function Stat({ label, value, cls = "", highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return <div className={`rounded-lg border p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
