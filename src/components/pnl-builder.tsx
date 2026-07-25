"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Trash2 } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

type Line = { id: string; label: string; amount: number };

const OPEX0: Line[] = [
  { id: "o1", label: "Salaries & wages", amount: 1_400_000 },
  { id: "o2", label: "Rent & utilities", amount: 320_000 },
  { id: "o3", label: "Marketing", amount: 280_000 },
  { id: "o4", label: "Logistics", amount: 240_000 },
  { id: "o5", label: "Other overheads", amount: 180_000 },
];

function Row({ label, value, cls = "", strong }: { label: string; value: string; cls?: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${strong ? "border-t font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

export function PnlBuilder() {
  const [revenue, setRevenue] = useState(4_250_000);
  const [cogs, setCogs] = useState(2_932_500);
  const [opex, setOpex] = useState<Line[]>(OPEX0);
  const [tax, setTax] = useState(25); // % on profit before tax
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const m = useMemo(() => {
    const totalOpex = opex.reduce((s, l) => s + l.amount, 0);
    const grossProfit = revenue - cogs;
    const grossMargin = revenue ? (grossProfit / revenue) * 100 : 0;
    const ebitda = grossProfit - totalOpex;
    const ebitdaMargin = revenue ? (ebitda / revenue) * 100 : 0;
    const taxAmt = ebitda > 0 ? ebitda * (tax / 100) : 0;
    const net = ebitda - taxAmt;
    const netMargin = revenue ? (net / revenue) * 100 : 0;
    return { totalOpex, grossProfit, grossMargin, ebitda, ebitdaMargin, taxAmt, net, netMargin };
  }, [revenue, cogs, opex, tax]);

  function upd(id: string, f: keyof Line, v: string) { setOpex((o) => o.map((l) => l.id === id ? { ...l, [f]: f === "label" ? v : Number(v) } : l)); }
  function add() { setOpex((o) => [...o, { id: "o" + Date.now(), label: "New cost", amount: 0 }]); }
  function del(id: string) { setOpex((o) => o.filter((l) => l.id !== id)); }

  async function review() {
    setLoading(true); setOut("");
    const input = `Monthly P&L: Revenue ${inr(revenue)}, COGS ${inr(cogs)} (gross margin ${m.grossMargin.toFixed(1)}%), operating expenses ${inr(m.totalOpex)} [${opex.map((l) => `${l.label} ${inr(l.amount)}`).join(", ")}], EBITDA ${inr(m.ebitda)} (${m.ebitdaMargin.toFixed(1)}%), net profit after ${tax}% tax ${inr(m.net)} (${m.netMargin.toFixed(1)}%). Review this P&L: what's healthy, what's off vs typical Indian SME benchmarks, and the 3 highest-impact ways to improve net margin.`;
    try { const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "costs", input }) }); const j = await r.json(); setOut(j.text || "No response."); }
    catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring text-right";
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5 space-y-3">
        <div className="font-semibold">Inputs (monthly)</div>
        <label className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Revenue</span>
          <input className={I + " w-36"} type="number" value={revenue} onChange={(e) => setRevenue(Number(e.target.value))} /></label>
        <label className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Cost of goods sold (COGS)</span>
          <input className={I + " w-36"} type="number" value={cogs} onChange={(e) => setCogs(Number(e.target.value))} /></label>
        <div className="pt-1 text-sm font-medium">Operating expenses</div>
        {opex.map((l) => (
          <div key={l.id} className="flex items-center gap-2">
            <input className="rounded-md border bg-background px-2 h-8 text-sm flex-1 outline-none focus:ring-2 focus:ring-ring" value={l.label} onChange={(e) => upd(l.id, "label", e.target.value)} />
            <input className={I + " w-28"} type="number" value={l.amount} onChange={(e) => upd(l.id, "amount", e.target.value)} />
            <button onClick={() => del(l.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add cost line</Button>
        <label className="flex items-center justify-between gap-2 text-sm pt-1"><span className="text-muted-foreground">Tax rate on profit</span>
          <span><input className={I + " w-16"} type="number" value={tax} onChange={(e) => setTax(Number(e.target.value))} /> %</span></label>
      </Card>

      <Card className="p-5 space-y-1 text-sm">
        <div className="font-semibold mb-2">Income statement</div>
        <Row label="Revenue" value={inr(revenue)} />
        <Row label="Less: COGS" value={`(${inr(cogs)})`} />
        <Row label="Gross profit" value={`${inr(m.grossProfit)} · ${m.grossMargin.toFixed(1)}%`} strong cls={m.grossMargin >= 30 ? "text-success" : "text-warning"} />
        <Row label="Less: Operating expenses" value={`(${inr(m.totalOpex)})`} />
        <Row label="EBITDA" value={`${inr(m.ebitda)} · ${m.ebitdaMargin.toFixed(1)}%`} strong cls={m.ebitda >= 0 ? "text-success" : "text-danger"} />
        <Row label={`Less: Tax (${tax}%)`} value={`(${inr(m.taxAmt)})`} />
        <Row label="Net profit" value={`${inr(m.net)} · ${m.netMargin.toFixed(1)}%`} strong cls={m.net >= 0 ? "text-success" : "text-danger"} />
        <div className="pt-3">
          <Button onClick={review} disabled={loading} className="w-full"><Sparkles className="h-4 w-4" /> {loading ? "Reviewing…" : "Review my P&L (ask the AI CFO)"}</Button>
        </div>
        {out && <div className="rounded-lg border bg-background/50 p-4 leading-relaxed mt-2" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
      </Card>
    </div>
  );
}
