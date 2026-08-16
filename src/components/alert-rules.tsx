"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2, BellRing, AlertTriangle, CheckCircle2 } from "lucide-react";
import { mdToHtml } from "@/lib/utils";

/**
 * Live KPI values for this workspace, passed in from the server.
 *
 * These used to be a hardcoded map ("gross margin 31%", "inventory cover on
 * RM-204: 9 days"), so every workspace — including a brand-new empty one —
 * permanently showed "3 alerts firing" against another company's numbers.
 */
export type LiveMetric = { key: string; label: string; value: number; unit: string; lowerBad?: boolean };

type Rule = { id: string; metric: string; op: "<" | ">"; threshold: number };


function breached(r: Rule, m?: LiveMetric): boolean {
  if (!m) return false;
  return r.op === "<" ? m.value < r.threshold : m.value > r.threshold;
}

export function AlertRules({ metrics = [] }: { metrics?: LiveMetric[] }) {
  const byKey = useMemo(() => Object.fromEntries(metrics.map((m) => [m.key, m])) as Record<string, LiveMetric>, [metrics]);
  // Seed one sensible rule per metric the workspace actually has.
  const defaults = useMemo<Rule[]>(() => metrics.slice(0, 4).map((m, i) => ({
    id: "r" + i, metric: m.key, op: m.lowerBad ? ">" : "<", threshold: Math.round(m.value),
  })), [metrics]);
  const [rules, setRules] = useState<Rule[]>(defaults);
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cortex_alert_rules");
      if (!saved) return;
      const parsed: Rule[] = JSON.parse(saved);
      // Drop rules for metrics this workspace doesn't have, so a stale rule can
      // never fire against a KPI we no longer compute.
      const kept = parsed.filter((r) => byKey[r.metric]);
      if (kept.length) setRules(kept);
    } catch {}
  }, [byKey]);
  useEffect(() => { try { localStorage.setItem("cortex_alert_rules", JSON.stringify(rules)); } catch {} }, [rules]);

  const evaluated = useMemo(() => rules.map((r) => ({ ...r, hit: breached(r, byKey[r.metric]), m: byKey[r.metric] })), [rules, byKey]);
  const alerts = evaluated.filter((r) => r.hit);

  function add() { setRules((rs) => [...rs, { id: "r" + Date.now(), metric: metrics[0]?.key ?? "", op: "<", threshold: 0 }]); }
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
                {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
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
