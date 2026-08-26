"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2 } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

type Cust = { id: string; name: string; recency: number; frequency: number; monetary: number };

const SEED: Cust[] = [
  { id: "c1", name: "Customer A", recency: 12, frequency: 14, monetary: 1800000 },
  { id: "c2", name: "Nova Distributors", recency: 45, frequency: 9, monetary: 950000 },
  { id: "c3", name: "Customer C", recency: 90, frequency: 3, monetary: 320000 },
  { id: "c4", name: "Zenith Wholesale", recency: 20, frequency: 11, monetary: 1200000 },
  { id: "c5", name: "Customer B", recency: 150, frequency: 2, monetary: 120000 },
];

const rScore = (d: number) => d <= 15 ? 5 : d <= 30 ? 4 : d <= 60 ? 3 : d <= 90 ? 2 : 1;
const fScore = (f: number) => f >= 12 ? 5 : f >= 8 ? 4 : f >= 4 ? 3 : f >= 2 ? 2 : 1;
const mScore = (m: number) => m >= 1000000 ? 5 : m >= 500000 ? 4 : m >= 200000 ? 3 : m >= 50000 ? 2 : 1;

function segment(r: number, f: number, m: number): { name: string; tone: string } {
  if (r >= 4 && f >= 4 && m >= 4) return { name: "Champion", tone: "bg-success/10 text-success border-success/20" };
  if (f >= 4 && m >= 3) return { name: "Loyal", tone: "bg-success/10 text-success border-success/20" };
  if (r <= 2 && (f >= 3 || m >= 4)) return { name: "At risk", tone: "bg-danger/10 text-danger border-danger/20" };
  if (r <= 2 && f <= 2) return { name: "Lost", tone: "bg-muted text-muted-foreground border-border" };
  if (r >= 4 && f <= 2) return { name: "New / promising", tone: "bg-primary/10 text-primary border-primary/20" };
  return { name: "Needs attention", tone: "bg-warning/10 text-warning border-warning/20" };
}

/** `seed` is the workspace's REAL customers, scored from their own orders. */
export function RfmSegments({ seed }: { seed?: Cust[] } = {}) {
  const isReal = Boolean(seed && seed.length);
  const [rows, setRows] = useState<Cust[]>(isReal ? seed! : SEED);
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const scored = useMemo(() => rows.map((c) => {
    const r = rScore(c.recency), f = fScore(c.frequency), m = mScore(c.monetary);
    return { ...c, r, f, m, seg: segment(r, f, m) };
  }), [rows]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    scored.forEach((c) => { map[c.seg.name] = (map[c.seg.name] || 0) + 1; });
    return map;
  }, [scored]);

  function upd(id: string, k: keyof Cust, v: string) { setRows((rs) => rs.map((c) => c.id === id ? { ...c, [k]: k === "name" ? v : Number(v) } : c)); }
  function add() { setRows((rs) => [...rs, { id: "c" + Date.now(), name: "New customer", recency: 30, frequency: 4, monetary: 200000 }]); }
  function del(id: string) { setRows((rs) => rs.filter((c) => c.id !== id)); }

  async function advise() {
    setLoading(true); setOut("");
    const input = "Customer RFM segments:\n" + scored.map((c) => `- ${c.name}: ${c.seg.name} (recency ${c.recency}d, ${c.frequency} orders/yr, ${inr(c.monetary)}/yr)`).join("\n") + "\nGive a specific action for each segment (Champions, Loyal, At risk, Lost, New), prioritised by revenue impact.";
    try { const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "strategy", input }) }); const j = await r.json(); setOut(j.text || "No response."); }
    catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4">
      {!isReal && (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          These are <b>example customers</b>, not yours — add customers and sales orders and this page will segment your real book.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([k, v]) => <Badge key={k} className="border-border">{k}: <b className="ml-1">{v}</b></Badge>)}
      </div>
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Customers</div>
          <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-2 font-medium">Customer</th><th className="py-2 pr-2 font-medium">Days since order</th><th className="py-2 pr-2 font-medium">Orders/yr</th><th className="py-2 pr-2 font-medium">₹/yr</th><th className="py-2 pr-2 font-medium">RFM</th><th className="py-2 font-medium">Segment</th>
            </tr></thead>
            <tbody>
              {scored.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2"><input className={I + " w-36"} value={c.name} onChange={(e) => upd(c.id, "name", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={c.recency} onChange={(e) => upd(c.id, "recency", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={c.frequency} onChange={(e) => upd(c.id, "frequency", e.target.value)} /></td>
                  <td className="py-1.5 pr-2"><input className={I + " w-24"} type="number" value={c.monetary} onChange={(e) => upd(c.id, "monetary", e.target.value)} /></td>
                  <td className="py-1.5 pr-2 text-muted-foreground font-mono">{c.r}{c.f}{c.m}</td>
                  <td className="py-1.5"><div className="flex items-center gap-1"><Badge className={c.seg.tone}>{c.seg.name}</Badge><button onClick={() => del(c.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button onClick={advise} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Thinking…" : "What should I do per segment?"}</Button>
        {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
      </Card>
    </div>
  );
}
