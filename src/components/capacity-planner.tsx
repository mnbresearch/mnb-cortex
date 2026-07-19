"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2 } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

type Person = { id: string; name: string; capacity: number; booked: number; rate: number; cost: number };

const DEFAULTS: Person[] = [
  { id: "u1", name: "Senior consultant", capacity: 160, booked: 172, rate: 2500, cost: 900 },
  { id: "u2", name: "Analyst", capacity: 160, booked: 120, rate: 1400, cost: 550 },
  { id: "u3", name: "Designer", capacity: 160, booked: 96, rate: 1600, cost: 650 },
  { id: "u4", name: "Developer", capacity: 160, booked: 150, rate: 1800, cost: 800 },
];

export function CapacityPlanner() {
  const [rows, setRows] = useState<Person[]>(DEFAULTS);
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const calc = useMemo(() => {
    const people = rows.map((p) => {
      const util = p.capacity > 0 ? (p.booked / p.capacity) * 100 : 0;
      const revenue = p.booked * p.rate;
      const deliveryCost = p.booked * p.cost;
      const contribution = revenue - deliveryCost;
      const spare = p.capacity - p.booked;
      return { ...p, util, revenue, contribution, spare };
    });
    const totalCap = people.reduce((s, p) => s + p.capacity, 0);
    const totalBooked = people.reduce((s, p) => s + p.booked, 0);
    const avgUtil = totalCap > 0 ? (totalBooked / totalCap) * 100 : 0;
    const revenue = people.reduce((s, p) => s + p.revenue, 0);
    const contribution = people.reduce((s, p) => s + p.contribution, 0);
    const idleHours = people.reduce((s, p) => s + Math.max(0, p.spare), 0);
    const idleValue = people.reduce((s, p) => s + Math.max(0, p.spare) * p.rate, 0);
    const overbooked = people.filter((p) => p.util > 100);
    return { people, avgUtil, revenue, contribution, idleHours, idleValue, overbooked };
  }, [rows]);

  function upd(id: string, f: keyof Person, v: string) {
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, [f]: f === "name" ? v : Number(v) } : r));
  }
  function add() { setRows((rs) => [...rs, { id: "u" + Date.now(), name: "New team member", capacity: 160, booked: 0, rate: 1500, cost: 700 }]); }
  function del(id: string) { setRows((rs) => rs.filter((r) => r.id !== id)); }

  async function analyse() {
    setLoading(true); setOut("");
    const input = "Team capacity this month:\n" + calc.people.map((p) =>
      `- ${p.name}: ${p.booked}/${p.capacity}h booked (${p.util.toFixed(0)}% utilisation), bill rate ₹${p.rate}/h, delivery cost ₹${p.cost}/h`
    ).join("\n") + `\nAverage utilisation ${calc.avgUtil.toFixed(0)}%, idle capacity ${calc.idleHours}h worth ${inr(calc.idleValue)}, ${calc.overbooked.length} people over 100%. How do I rebalance the team, and should I hire, subcontract or sell more?`;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "hiring", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  const tone = (u: number) => u > 100 ? "bg-danger/10 text-danger border-danger/20" : u >= 75 ? "bg-success/10 text-success border-success/20" : u >= 50 ? "bg-warning/10 text-warning border-warning/20" : "bg-danger/10 text-danger border-danger/20";
  const I = "rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Team capacity & utilisation</div>
          <div className="text-sm text-muted-foreground">Who's drowning, who's idle, and what that's costing you.</div>
        </div>
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add person</Button>
      </div>

      {calc.overbooked.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
          <b className="text-danger">{calc.overbooked.length} person(s) over capacity:</b> {calc.overbooked.map((p) => p.name).join(", ")} — burnout and delivery-slip risk.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Avg utilisation" value={`${calc.avgUtil.toFixed(0)}%`} cls={calc.avgUtil >= 75 ? "text-success" : "text-warning"} />
        <Stat label="Billable revenue" value={inr(calc.revenue)} />
        <Stat label="Contribution" value={inr(calc.contribution)} cls="text-success" />
        <Stat label="Idle capacity" value={`${calc.idleHours}h · ${inr(calc.idleValue)}`} cls={calc.idleHours > 0 ? "text-warning" : ""} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-2 font-medium">Person</th>
            <th className="py-2 pr-2 font-medium">Capacity h</th>
            <th className="py-2 pr-2 font-medium">Booked h</th>
            <th className="py-2 pr-2 font-medium">Bill ₹/h</th>
            <th className="py-2 pr-2 font-medium">Cost ₹/h</th>
            <th className="py-2 pr-2 font-medium">Contribution</th>
            <th className="py-2 font-medium">Utilisation</th>
          </tr></thead>
          <tbody>
            {calc.people.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-1.5 pr-2"><input className={I + " w-36"} value={p.name} onChange={(e) => upd(p.id, "name", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={p.capacity} onChange={(e) => upd(p.id, "capacity", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-16"} type="number" value={p.booked} onChange={(e) => upd(p.id, "booked", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-20"} type="number" value={p.rate} onChange={(e) => upd(p.id, "rate", e.target.value)} /></td>
                <td className="py-1.5 pr-2"><input className={I + " w-20"} type="number" value={p.cost} onChange={(e) => upd(p.id, "cost", e.target.value)} /></td>
                <td className="py-1.5 pr-2 font-medium text-success">{inr(p.contribution)}</td>
                <td className="py-1.5">
                  <div className="flex items-center gap-1">
                    <Badge className={tone(p.util)}>{p.util.toFixed(0)}%</Badge>
                    <button onClick={() => del(p.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Healthy billable utilisation for a services team is roughly 70–85%. Above 100% is unsustainable; below 50% is unsold capacity.</p>

      <Button onClick={analyse} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Analysing…" : "Should I hire, subcontract or sell more?"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}

function Stat({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
