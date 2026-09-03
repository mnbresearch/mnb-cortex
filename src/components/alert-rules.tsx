"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2, BellRing, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { mdToHtml } from "@/lib/utils";
import { saveAlertRule, deleteAlertRule } from "@/lib/actions";

/**
 * Live KPI values for this workspace, passed in from the server.
 *
 * These used to be a hardcoded map ("gross margin 31%", "inventory cover on
 * RM-204: 9 days"), so every workspace — including a brand-new empty one —
 * permanently showed "3 alerts firing" against another company's numbers.
 */
export type LiveMetric = { key: string; label: string; value: number; unit: string; lowerBad?: boolean };

/** A rule as stored on the workspace. */
export type SavedRule = { id: string; metric_key: string; op: "<" | ">"; threshold: number };

function breached(r: SavedRule, m?: LiveMetric): boolean {
  if (!m) return false;
  return r.op === "<" ? m.value < r.threshold : m.value > r.threshold;
}

export function AlertRules({ metrics = [], rules = [] }: { metrics?: LiveMetric[]; rules?: SavedRule[] }) {
  const byKey = useMemo(
    () => Object.fromEntries(metrics.map((m) => [m.key, m])) as Record<string, LiveMetric>,
    [metrics],
  );

  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Draft state for the "add a rule" row only. Existing rules are server state
  // and are not mirrored into React state — the previous version kept the whole
  // list in useState and synced it to localStorage, which is precisely why they
  // were invisible on a second device and were never evaluated server-side.
  const [draftMetric, setDraftMetric] = useState(metrics[0]?.key ?? "");
  const [draftOp, setDraftOp] = useState<"<" | ">">(metrics[0]?.lowerBad ? ">" : "<");
  const [draftValue, setDraftValue] = useState<string>(String(Math.round(metrics[0]?.value ?? 0)));

  const evaluated = rules.map((r) => ({ ...r, hit: breached(r, byKey[r.metric_key]), m: byKey[r.metric_key] }));
  const firing = evaluated.filter((r) => r.hit);

  async function advise() {
    setLoading(true); setOut("");
    const input = "These KPI alerts are currently breached:\n"
      + firing.map((r) => `- ${r.m?.label}: now ${r.m?.value}${r.m?.unit}, rule says alert when ${r.op} ${r.threshold}${r.m?.unit}`).join("\n")
      + "\nFor each breached alert, give the single most important action to take, in priority order.";
    try {
      const res = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "actions", input }),
      });
      const j = await res.json();
      setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <Card className={`p-4 ${firing.length ? "border-danger/30 bg-danger/5" : "border-success/30 bg-success/5"}`}>
        <div className="flex items-center gap-2 text-sm">
          {firing.length ? <AlertTriangle className="h-4 w-4 text-danger" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
          <b className={firing.length ? "text-danger" : "text-success"}>
            {firing.length
              ? `${firing.length} rule${firing.length > 1 ? "s" : ""} breached`
              : rules.length ? "All clear — no rules breached" : "No rules set yet"}
          </b>
          {firing.length > 0 && <span className="text-muted-foreground">· {firing.map((a) => a.m?.label).join(", ")}</span>}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-semibold flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" /> Alert rules</div>

        <div className="space-y-2">
          {evaluated.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${r.hit ? "border-danger/30 bg-danger/5" : ""}`}>
              <span className="text-sm">
                Alert me when <b>{r.m?.label ?? r.metric_key}</b> is {r.op === "<" ? "below" : "above"}{" "}
                <b>{r.threshold}{r.m?.unit ? ` ${r.m.unit}` : ""}</b>
              </span>
              <span className="text-sm text-muted-foreground ml-auto">
                {r.m ? <>now <b className="text-foreground">{r.m.value}{r.m.unit ? ` ${r.m.unit}` : ""}</b></> : "this KPI is not being computed yet"}
              </span>
              {r.m
                ? (r.hit
                  ? <Badge className="bg-danger/10 text-danger border-danger/20">breached</Badge>
                  : <Badge className="bg-success/10 text-success border-success/20">ok</Badge>)
                : <Badge className="bg-muted text-muted-foreground">waiting for data</Badge>}
              <form action={deleteAlertRule} onSubmit={() => setBusy(r.id)}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="text-muted-foreground hover:text-danger" aria-label="Delete rule">
                  {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </form>
            </div>
          ))}
          {!rules.length && (
            <p className="text-sm text-muted-foreground">
              No rules yet. Add one below and Cortex will watch it after every change to your data — not only while this page is open.
            </p>
          )}
        </div>

        {metrics.length > 0 && (
          <form action={saveAlertRule} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
            <span className="text-sm text-muted-foreground">Alert me when</span>
            <select
              name="metric_key" value={draftMetric}
              onChange={(e) => {
                setDraftMetric(e.target.value);
                const m = byKey[e.target.value];
                if (m) { setDraftOp(m.lowerBad ? ">" : "<"); setDraftValue(String(Math.round(m.value))); }
              }}
              className="rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <select
              name="op" value={draftOp} onChange={(e) => setDraftOp(e.target.value as "<" | ">")}
              className="rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="<">is below</option><option value=">">is above</option>
            </select>
            <input
              type="number" name="threshold" value={draftValue} onChange={(e) => setDraftValue(e.target.value)}
              className="w-28 rounded-md border bg-background px-2 h-8 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">{byKey[draftMetric]?.unit}</span>
            <Button type="submit" variant="outline" size="sm" className="ml-auto"><Plus className="h-4 w-4" /> Add rule</Button>
          </form>
        )}

        {firing.length > 0 && (
          <Button onClick={advise} disabled={loading}>
            <Sparkles className="h-4 w-4" /> {loading ? "Thinking…" : "What should I do about these? (ask CorteO)"}
          </Button>
        )}
        {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}

        <p className="text-xs text-muted-foreground">
          Rules are saved to your workspace, so your team sees the same ones and they follow you between devices.
          Cortex checks them after every change to your data and raises an alert the moment one is crossed.
        </p>
      </Card>
    </div>
  );
}
