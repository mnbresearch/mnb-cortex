"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

type Cust = { id: string; name: string; value: number; daysSince: number; tickets: number; sentiment: "good" | "neutral" | "poor" };

const DEFAULTS: Cust[] = [
  { id: "c1", name: "Apex Traders", value: 1800000, daysSince: 62, tickets: 3, sentiment: "poor" },
  { id: "c2", name: "Nova Distributors", value: 950000, daysSince: 41, tickets: 1, sentiment: "neutral" },
  { id: "c3", name: "Sunrise Retail", value: 640000, daysSince: 12, tickets: 0, sentiment: "good" },
  { id: "c4", name: "Zenith Wholesale", value: 1200000, daysSince: 78, tickets: 2, sentiment: "neutral" },
  { id: "c5", name: "Metro Mart", value: 430000, daysSince: 20, tickets: 0, sentiment: "good" },
];

function churnRisk(c: Cust): number {
  let s = 15;
  if (c.daysSince > 60) s += 40; else if (c.daysSince > 30) s += 22; else if (c.daysSince > 14) s += 8;
  s += Math.min(24, c.tickets * 8);
  s += c.sentiment === "poor" ? 22 : c.sentiment === "neutral" ? 6 : -12;
  return Math.max(2, Math.min(99, s));
}
function tone(n: number) {
  return n >= 65 ? "bg-danger/10 text-danger border-danger/20" : n >= 40 ? "bg-warning/10 text-warning border-warning/20" : "bg-success/10 text-success border-success/20";
}

export function ChurnPredictor() {
  const [rows, setRows] = useState<Cust[]>(DEFAULTS);
  const [out, setOut] = useState("");
  const [loading, setLoading] = useState(false);

  const scored = useMemo(() =>
    rows.map((c) => ({ ...c, risk: churnRisk(c), atRisk: churnRisk(c) * c.value }))
      .sort((a, b) => b.risk - a.risk), [rows]);

  const revenueAtRisk = useMemo(() => scored.filter((c) => c.risk >= 65).reduce((s, c) => s + c.value, 0), [scored]);

  function upd(id: string, f: keyof Cust, v: string) {
    setRows((rs) => rs.map((c) => c.id === id ? { ...c, [f]: f === "name" || f === "sentiment" ? v : Number(v) } : c));
  }

  async function retentionPlan() {
    setLoading(true); setOut("");
    const top = scored.filter((c) => c.risk >= 40).slice(0, 5);
    const input = "Customers at churn risk (highest first):\n" + top.map((c) => `- ${c.name}: ${inr(c.value)}/mo, ${c.daysSince} days since last order, ${c.tickets} open tickets, sentiment ${c.sentiment}, churn risk ${c.risk}%`).join("\n") + "\nGive a specific retention play for each (what to do, who does it, what to offer), ordered by revenue at risk.";
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "strategy", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Churn risk model</div>
        <Badge className={revenueAtRisk > 0 ? "bg-danger/10 text-danger border-danger/20" : "border-border text-muted-foreground"}>
          {inr(revenueAtRisk)}/mo at high risk
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-3 font-medium">Customer</th>
            <th className="py-2 pr-3 font-medium">₹/mo</th>
            <th className="py-2 pr-3 font-medium">Days idle</th>
            <th className="py-2 pr-3 font-medium">Tickets</th>
            <th className="py-2 pr-3 font-medium">Sentiment</th>
            <th className="py-2 font-medium">Churn risk</th>
          </tr></thead>
          <tbody>
            {scored.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-1.5 pr-3"><input value={c.name} onChange={(e) => upd(c.id, "name", e.target.value)} className="rounded-md border bg-background px-2 h-8 text-sm w-32 outline-none focus:ring-2 focus:ring-ring" /></td>
                <td className="py-1.5 pr-3"><input type="number" value={c.value} onChange={(e) => upd(c.id, "value", e.target.value)} className="rounded-md border bg-background px-2 h-8 text-sm w-24 outline-none focus:ring-2 focus:ring-ring" /></td>
                <td className="py-1.5 pr-3"><input type="number" value={c.daysSince} onChange={(e) => upd(c.id, "daysSince", e.target.value)} className="rounded-md border bg-background px-2 h-8 text-sm w-16 outline-none focus:ring-2 focus:ring-ring" /></td>
                <td className="py-1.5 pr-3"><input type="number" value={c.tickets} onChange={(e) => upd(c.id, "tickets", e.target.value)} className="rounded-md border bg-background px-2 h-8 text-sm w-14 outline-none focus:ring-2 focus:ring-ring" /></td>
                <td className="py-1.5 pr-3">
                  <select value={c.sentiment} onChange={(e) => upd(c.id, "sentiment", e.target.value)} className="rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option value="good">good</option><option value="neutral">neutral</option><option value="poor">poor</option>
                  </select>
                </td>
                <td className="py-1.5"><Badge className={tone(c.risk)}>{c.risk}%</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button onClick={retentionPlan} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Building plan…" : "Build a retention plan for at-risk accounts"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}
