"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Trash2, Target, Link2 } from "lucide-react";
import { mdToHtml } from "@/lib/utils";
import { saveGoal, deleteGoal } from "@/lib/actions";

/**
 * Quarterly targets, measured against the workspace's real KPIs.
 *
 * This used to seed four DEMO-COMPANY figures — gross margin 31→33%, monthly
 * revenue ₹4.25→5.0 Cr, receivables overdue ₹72→30 L, cash runway 5→9 months —
 * into localStorage, where they became sticky and indistinguishable from goals
 * the owner had actually set. The page meanwhile claimed OKRs were "wired to
 * your live data" and that "Cortex measures progress against your live
 * numbers". It measured progress against another company's.
 *
 * Goals now live on the workspace. When a goal is linked to a metric_key, its
 * CURRENT value is read from health_metrics on every render, so it cannot drift
 * out of date — which is the only version of this feature worth having.
 */

export type SavedGoal = {
  id: string;
  name: string;
  metric_key: string | null;
  current: number;      // resolved server-side: live KPI when linked, stored otherwise
  target: number;
  unit: string;
  lowerIsBetter: boolean;
  linked: boolean;          // true when `current` came from a live KPI
  awaitingMetric?: boolean; // linked to a KPI that is not currently being computed
};

export type GoalMetricOption = { key: string; label: string; value: number; unit: string; lowerBad: boolean };

function progress(g: SavedGoal): number {
  let p: number;
  if (g.lowerIsBetter) p = g.current <= g.target ? 100 : (g.target / (g.current || 1)) * 100;
  else p = (g.current / (g.target || 1)) * 100;
  return Math.max(0, Math.min(100, Number.isFinite(p) ? p : 0));
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

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

export function GoalsTracker({ goals = [], metrics = [] }: { goals?: SavedGoal[]; metrics?: GoalMetricOption[] }) {
  const [out, setOut] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const [draftKey, setDraftKey] = useState(metrics[0]?.key ?? "");
  const [draftName, setDraftName] = useState(metrics[0]?.label ?? "");
  const [draftTarget, setDraftTarget] = useState("0");

  async function advise() {
    setLoading(true); setOut("");
    const input = "Owner's quarterly goals (OKRs):\n"
      + goals.map((g) => g.awaitingMetric
        ? `- ${g.name}: target ${fmt(g.target)}${g.unit} (current value unknown — the KPI is not being computed)`
        : `- ${g.name}: currently ${fmt(g.current)}${g.unit}, target ${fmt(g.target)}${g.unit}${g.lowerIsBetter ? " (lower is better)" : ""}`).join("\n")
      + "\nFor each goal, give the single highest-leverage move to close the gap, tied to our live numbers.";
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
        <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> {adding ? "Cancel" : "Add goal"}
        </Button>
      </div>

      {adding && (
        <form action={saveGoal} className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              Track
              <select
                name="metric_key" value={draftKey}
                onChange={(e) => {
                  setDraftKey(e.target.value);
                  const m = metrics.find((x) => x.key === e.target.value);
                  if (m) { setDraftName(m.label); setDraftTarget(String(Math.round(m.value))); }
                }}
                className="ml-2 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                <option value="">Something else (I'll track it myself)</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Name
              <input name="name" value={draftName} onChange={(e) => setDraftName(e.target.value)}
                className="ml-2 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring" required />
            </label>
            <label className="text-xs text-muted-foreground">
              Target
              <input name="target_val" type="number" step="any" value={draftTarget} onChange={(e) => setDraftTarget(e.target.value)}
                className="ml-2 w-24 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring" required />
            </label>
            <label className="text-xs text-muted-foreground">
              Unit
              <input name="unit" defaultValue={metrics.find((m) => m.key === draftKey)?.unit ?? ""}
                className="ml-2 w-20 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </label>
            {!draftKey && (
              <label className="text-xs text-muted-foreground">
                Current
                <input name="current_val" type="number" step="any" defaultValue="0"
                  className="ml-2 w-24 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </label>
            )}
            <label className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <input type="checkbox" name="lower_is_better" value="1"
                defaultChecked={metrics.find((m) => m.key === draftKey)?.lowerBad ?? false} />
              Lower is better
            </label>
            <Button type="submit" size="sm" className="ml-auto">Save goal</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Linking a goal to one of your KPIs means Cortex reads the current value from your own data — you never
            have to update it by hand, and it can never go stale.
          </p>
        </form>
      )}

      <div className="space-y-2">
        {goals.map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-lg border p-3">
            {/* No ring when the KPI is missing: drawing one would assert a
                progress figure we cannot compute. */}
            {g.awaitingMetric
              ? <div className="h-[52px] w-[52px] shrink-0 rounded-full border-2 border-dashed border-border" />
              : <Ring value={progress(g)} />}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm flex items-center gap-1.5">
                {g.name}
                {g.linked && <span title="Current value read from your live KPI"><Link2 className="h-3.5 w-3.5 text-primary" /></span>}
              </div>
              <div className="text-sm text-muted-foreground">
                {g.awaitingMetric
                  ? <>target <b className="text-foreground">{fmt(g.target)}{g.unit ? ` ${g.unit}` : ""}</b></>
                  : <>now <b className="text-foreground">{fmt(g.current)}{g.unit ? ` ${g.unit}` : ""}</b>
                    {" → "}target <b className="text-foreground">{fmt(g.target)}{g.unit ? ` ${g.unit}` : ""}</b></>}
                {g.lowerIsBetter && <span className="ml-1 text-xs">(lower is better)</span>}
              </div>
              {g.awaitingMetric && (
                <div className="text-xs text-warning mt-0.5">
                  Cortex is not currently computing <b>{g.metric_key}</b> for this workspace, so there is no
                  progress to show — add the data it needs and this starts tracking again.
                </div>
              )}
              {!g.linked && !g.awaitingMetric && (
                <div className="text-xs text-muted-foreground mt-0.5">Tracked by hand — not linked to a KPI.</div>
              )}
            </div>
            <form action={deleteGoal}>
              <input type="hidden" name="id" value={g.id} />
              <button type="submit" className="text-muted-foreground hover:text-danger" aria-label="Delete goal"><Trash2 className="h-4 w-4" /></button>
            </form>
          </div>
        ))}
        {!goals.length && (
          <p className="text-sm text-muted-foreground">
            No goals yet. Add one above — link it to a KPI and Cortex will track your progress against your own numbers.
          </p>
        )}
      </div>

      {goals.length > 0 && (
        <Button onClick={advise} disabled={loading}>
          <Sparkles className="h-4 w-4" /> {loading ? "Thinking…" : "Ask Cortex how to hit these"}
        </Button>
      )}
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
      <p className="text-xs text-muted-foreground">
        Goals are saved to your workspace, so your team sees the same targets and they follow you between devices.
      </p>
    </Card>
  );
}
