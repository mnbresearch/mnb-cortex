"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/utils";

type Row = { id: string; label: string; amount: number };
const seed = (label: string, amount: number): Row => ({ id: Math.random().toString(36).slice(2), label, amount });

const ASSETS: Row[] = [
  seed("Cash & bank", 1_500_000), seed("Receivables", 2_200_000), seed("Inventory", 1_800_000),
  seed("Plant & equipment", 4_000_000), seed("Investments", 800_000),
];
const LIABS: Row[] = [
  seed("Payables", 1_600_000), seed("Working-capital loan", 2_500_000), seed("Term loan", 3_000_000),
  seed("GST / tax due", 400_000),
];

function Ledger({ title, rows, setRows, tone }: { title: string; rows: Row[]; setRows: (r: Row[]) => void; tone: string }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <Card className="p-5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{title}</div>
        <Button size="sm" variant="outline" onClick={() => setRows([...rows, seed("New line", 0)])}><Plus className="h-4 w-4" /></Button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <input className={I + " flex-1"} value={r.label} onChange={(e) => setRows(rows.map((x) => x.id === r.id ? { ...x, label: e.target.value } : x))} />
          <input className={I + " w-32"} type="number" value={r.amount} onChange={(e) => setRows(rows.map((x) => x.id === r.id ? { ...x, amount: Number(e.target.value) } : x))} />
          <button onClick={() => setRows(rows.filter((x) => x.id !== r.id))} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <div className={`flex items-center justify-between border-t pt-2 font-semibold ${tone}`}><span>Total {title.toLowerCase()}</span><span className="tabular-nums">{inr(total)}</span></div>
    </Card>
  );
}

export function NetWorthBuilder() {
  const [assets, setAssets] = useState<Row[]>(ASSETS);
  const [liabs, setLiabs] = useState<Row[]>(LIABS);
  const m = useMemo(() => {
    const a = assets.reduce((s, r) => s + r.amount, 0);
    const l = liabs.reduce((s, r) => s + r.amount, 0);
    return { a, l, net: a - l, ratio: l ? a / l : Infinity };
  }, [assets, liabs]);

  return (
    <div className="space-y-4">
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
