"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Trash2, Target } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

type Goal = { id: string; name: string; current: number; target: number; unit: string };

const DEFAULTS: Goal[] = [
  { id: "g1", name: "Gross margin", current: 31, target: 33, unit: "%" },
  { id: "g2", name: "Monthly revenue", current: 4.25, target: 5.0, unit: "Cr" },
  { id: "g3", name: "Receivables overdue", current: 72, target: 30, unit: "L" },
  { id: "g4", name: "Cash runway", current: 5, target: 9, unit: "mo" },
];

function progress(g: Goal): number {
  const lowerBetter = g.name.toLowerCase().match(/overdue|cost|churn|attrition|debt/);
  let p: number;
  if (lowerBetter) p = g.current <= g.target ? 100 : (g.target / (g.current || 1)) * 100;
  else p = (g.current / (g.target || 1)) * 100;
  return Math.max(0, Math.min(100, p));
}

function Ring({ value }: { value: number }) {
  const r = 20, c = 2 * Math.PI * r, off = c - (value / 100) * c;
  const color = value >= 80 ? "hsl(var(--success))" : value >= 50 ? "hsl(var(--warning))" : "hsl(var(--danger))";
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" className="fill-foreground text-[11px] font-bold">{Math.round(value)}%</text>
    </svg>
  );
}

export function GoalsTracker() {
  const [goals, setGoals] = useState<Goal[]>(DEFAULTS);
  const [out, setOut] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try { const s = localStorage.getItem("cortex_goals"); if (s) setGoals(JSON.parse(s)); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("cortex_goals", JSON.stringify(goals)); } catch {}
  }, [goals]);

  function update(id: string, field: keyof Goal, v: string) {
    setGoals((gs) => gs.map((g) => g.id === id ? { ...g, [field]: field === "name" || field === "unit" ? v : Number(v) } : g));
  }
  function add() {
    setGoals((gs) => [...gs, { id: "g" + Date.now(), name: "New goal", current: 0, target: 100, unit: "%" }]);
  }
  function remove(id: string) { setGoals((gs) => gs.filter((g) => g.id !== id)); }

  async function advise() {
    setLoading(true); setOut("");
    const input = "Owner's quarterly goals (OKRs):\n" + goals.map((g) => `- ${g.name}: currently ${g.current}${g.unit}, target ${g.target}${g.unit}`).join("\n") + "\nFor each goal, give the single highest-leverage move to close the gap, tied to our live numbers.";
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "strategy", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Quarterly OKRs</div>
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add goal</Button>
      </div>
      <div className="space-y-2">
        {goals.map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-lg border p-3">
            <Ring value={progress(g)} />
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
              <input value={g.name} onChange={(e) => update(g.id, "name", e.target.value)}
                className="col-span-2 sm:col-span-1 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring font-medium" />
              <label className="text-xs text-muted-foreground flex items-center gap-1">Now
                <input type="number" value={g.current} onChange={(e) => update(g.id, "current", e.target.value)}
                  className="w-16 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
              <label className="text-xs text-muted-foreground flex items-center gap-1">Target
                <input type="number" value={g.target} onChange={(e) => update(g.id, "target", e.target.value)}
                  className="w-16 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
              <input value={g.unit} onChange={(e) => update(g.id, "unit", e.target.value)}
                className="w-14 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button onClick={() => remove(g.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <Button onClick={advise} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Thinking…" : "Ask the AI COO how to hit these"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
      <p className="text-xs text-muted-foreground">Goals are saved to this device automatically.</p>
    </Card>
  );
}
