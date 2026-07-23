"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2, BellRing, AlertTriangle, CheckCircle2 } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

// Key metrics with their current live values (from the business snapshot).
const METRICS: Record<string, { label: string; value: number; unit: string; lowerBad?: boolean }> = {
  revenue_growth: { label: "Revenue growth (MoM)", value: 12, unit: "%" },
  profit_change: { label: "Net profit change", value: -7, unit: "%" },
  gross_margin: { label: "Gross margin", value: 31, unit: "%" },
  cash_runway: { label: "Cash runway", value: 5, unit: "mo" },
  overdue: { label: "Overdue receivables", value: 72, unit: "L", lowerBad: true },
  inv_cover: { label: "Inventory cover (RM-204)", value: 9, unit: "days" },
  dso: { label: "Receivable days (DSO)", value: 47, unit: "days", lowerBad: true },
};

type Rule = { id: string; metric: string; op: "<" | ">"; threshold: number };

const DEFAULTS: Rule[] = [
  { id: "r1", metric: "cash_runway", op: "<", threshold: 6 },
  { id: "r2", metric: "gross_margin", op: "<", threshold: 33 },
  { id: "r3", metric: "overdue", op: ">", threshold: 50 },
  { id: "r4", metric: "inv_cover", op: "<", threshold: 12 },
];

function breached(r: Rule): boolean {
  const m = METRICS[r.metric]; if (!m) return false;
  return r.op === "<" ? m.value < r.threshold : m.value > r.threshold;
}

export function AlertRules() {
  const [rules, setRules] = useState<Rule[]>(DEFAULTS);
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  useEffect(() => { try { const s = localStorage.getItem("cortex_alert_rules"); if (s) setRules(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("cortex_alert_rules", JSON.stringify(rules)); } catch {} }, [rules]);

  const evaluated = useMemo(() => rules.map((r) => ({ ...r, hit: breached(r), m: METRICS[r.metric] })), [rules]);
  const alerts = evaluated.filter((r) => r.hit);

  function add() { setRules((rs) => [...rs, { id: "r" + Date.now(), metric: "revenue_growth", op: "<", threshold: 0 }]); }
  function del(id: string) { setRules((rs) => rs.filter((r) => r.id !== id)); }
  function upd(id: string, f: keyof Rule, v: string) { setRules((rs) => rs.map((r) => r.id === id ? { ...r, [f]: f === "threshold" ? Number(v) : v } : r)); }

  async function advise() {
    setLoading(true); setOut("");
    const input = "These KPI alerts are currently breached:\n" + alerts.map((r) => `- ${r.m?.label}: now ${r.m?.value}${r.m?.unit}, rule says alert when ${r.op} ${r.threshold}${r.m?.unit}`).join("\n") + "\nFor each breached alert, give the single most important action to take, in priority order.";
    try { const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "actions", input }) }); const j = await res.json(); setOut(j.text || "No response."); }
    catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <Card className={`p-4 ${alerts.length ? "border-danger/30 bg-danger/5" : "border-success/30 bg-success/5"}`}>
        <div className="flex items-center gap-2 text-sm">
          {alerts.length ? <AlertTriangle className="h-4 w-4 text-danger" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
          <b className={alerts.length ? "text-danger" : "text-success"}>{alerts.length ? `${alerts.length} alert${alerts.length > 1 ? "s" : ""} firing` : "All clear — no rules breached"}</b>
          {alerts.length > 0 && <span className="text-muted-foreground">· {alerts.map((a) => a.m?.label).join(", ")}</span>}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" /> Alert rules</div>
          <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add rule</Button>
        </div>
        <div className="space-y-2">
          {evaluated.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${r.hit ? "border-danger/30 bg-danger/5" : ""}`}>
              <span className="text-sm text-muted-foreground">Alert me when</span>
              <select value={r.metric} onChange={(e) => upd(r.id, "metric", e.target.value)} className="rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring">
                {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
              <select value={r.op} onChange={(e) => upd(r.id, "op", e.target.value)} className="rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option value="<">is below</option><option value=">">is above</option>
              </select>
              <input type="number" value={r.threshold} onChange={(e) => upd(r.id, "threshold", e.target.value)} className="w-20 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <span className="text-sm text-muted-foreground">{r.m?.unit}</span>
              <span className="text-sm text-muted-foreground ml-auto">now <b className="text-foreground">{r.m?.value}{r.m?.unit}</b></span>
              {r.hit ? <Badge className="bg-danger/10 text-danger border-danger/20">firing</Badge> : <Badge className="bg-success/10 text-success border-success/20">ok</Badge>}
              <button onClick={() => del(r.id)} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        {alerts.length > 0 && <Button onClick={advise} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Thinking…" : "What should I do about these? (ask the AI COO)"}</Button>}
        {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
        <p className="text-xs text-muted-foreground">Rules are saved to this device. Your AI Autopilot also watches these metrics daily in the background.</p>
      </Card>
    </div>
  );
}
