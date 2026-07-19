"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2 } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

type Proj = { id: string; client: string; fee: number; hours: number; costRate: number; expenses: number };

const DEFAULTS: Proj[] = [
  { id: "p1", client: "Retainer — FMCG brand", fee: 250000, hours: 90, costRate: 900, expenses: 15000 },
  { id: "p2", client: "Growth audit — EdTech", fee: 180000, hours: 120, costRate: 900, expenses: 8000 },
  { id: "p3", client: "Website + SEO build", fee: 320000, hours: 210, costRate: 750, expenses: 40000 },
];

export function ProjectProfitability() {
  const [rows, setRows] = useState<Proj[]>(DEFAULTS);
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const calc = useMemo(() => {
    const withMargin = rows.map((r) => {
      const cost = r.hours * r.costRate + r.expenses;
      const profit = r.fee - cost;
      const margin = r.fee > 0 ? (profit / r.fee) * 100 : 0;
      const effRate = r.hours > 0 ? r.fee / r.hours : 0;
      return { ...r, cost, profit, margin, effRate };
    }).sort((a, b) => b.margin - a.margin);
    const totalFee = withMargin.reduce((s, r) => s + r.fee, 0);
    const totalProfit = withMargin.reduce((s, r) => s + r.profit, 0);
    const totalHours = withMargin.reduce((s, r) => s + r.hours, 0);
    const blended = totalHours > 0 ? totalFee / totalHours : 0;
    return { withMargin, totalFee, totalProfit, blended, avgMargin: totalFee > 0 ? (totalProfit / totalFee) * 100 : 0 };
  }, [rows]);

  function upd(id: string, f: keyof Proj, v: string) {
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, [f]: f === "client" ? v : Number(v) } : r));
  }
  function add() { setRows((rs) => [...rs, { id: "p" + Date.now(), client: "New project", fee: 100000, hours: 40, costRate: 900, expenses: 0 }]); }
  function del(id: string) { setRows((rs) => rs.filter((r) => r.id !== id)); }

  async function analyse() {
    setLoading(true); setOut("");
    const input = "Consulting project profitability:\n" + calc.withMargin.map((r) =>
      `- ${r.client}: fee ${inr(r.fee)}, ${r.hours}h at ₹${r.costRate}/h delivery cost, expenses ${inr(r.expenses)} → profit ${inr(r.profit)} (${r.margin.toFixed(0)}% margin, effective rate ₹${r.effRate.toFixed(0)}/h)`
    ).join("\n") + `\nBlended realised rate ₹${calc.blended.toFixed(0)}/h, overall margin ${calc.avgMargin.toFixed(0)}%. Which engagements should I reprice, restructure or drop, and how do I raise blended margin without losing clients?`;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "pricing", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  const tone = (m: number) => m >= 45 ? "bg-success/10 text-success border-success/20" : m >= 25 ? "bg-warning/10 text-warning border-warning/20" : "bg-danger/10 text-danger border-danger/20";
  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Project & client profitability</div>
          <div className="text-sm text-muted-foreground">Which engagements actually make money once delivery time is counted.</div>
        </div>
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add project</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total fees" value={inr(calc.totalFee)} />
        <Stat label="Total profit" value={inr(calc.totalProfit)} cls={calc.totalProfit >= 0 ? "text-success" : "text-danger"} />
        <Stat label="Overall margin" value={`${calc.avgMargin.toFixed(0)}%`} cls={calc.avgMargin >= 35 ? "text-success" : "text-warning"} />
        <Stat label="Blended rate" value={`₹${calc.blended.toFixed(0)}/h`} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-2 font-medium">Client / project</th>
            <th className="py-2 pr-2 font-medium">Fee ₹</th>
            <th className="py-2 pr-2 font-medium">Hours</th>
            <th className="py-2 pr-2 font-medium">Cost ₹/h</th>
            <th className="py-2 pr-2 font-medium">Expenses ₹</th>
            <th className="py-2 pr-2 font-medium">Eff. rate</th>
            <th className="py-2 pr-2 font-medium">Profit</th>
            <th className="py-2 font-medium">Margin</th>
          </tr></thead>
          <tbody>
            {calc.withMargin.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-1.5 pr-2"><input className={I + " w-40"} value={r.client} onChange={(e) => upd(r.id, "client", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-24"} type="number" value={r.fee} onChange={(e) => upd(r.id, "fee", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={r.hours} onChange={(e) => upd(r.id, "hours", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-20"} type="number" value={r.costRate} onChange={(e) => upd(r.id, "costRate", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-20"} type="number" value={r.expenses} onChange={(e) => upd(r.id, "expenses", e.target.value)} /></td>
                <td className="py-1.5 pr-2 text-muted-foreground">₹{r.effRate.toFixed(0)}</td>
                <td className={`py-1.5 pr-2 font-medium ${r.profit >= 0 ? "text-success" : "text-danger"}`}>{inr(r.profit)}</td>
                <td className="py-1.5"><div className="flex items-center gap-1"><Badge className={tone(r.margin)}>{r.margin.toFixed(0)}%</Badge>
                  <button onClick={() => del(r.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button onClick={analyse} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Analysing…" : "Which projects should I reprice or drop?"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}

function Stat({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
