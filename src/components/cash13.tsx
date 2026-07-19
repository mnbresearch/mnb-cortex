"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertTriangle } from "lucide-react";
import { inr, mdToHtml } from "@/lib/utils";

const WEEKS = 13;

export function Cash13() {
  const [opening, setOpening] = useState(1_890_000);
  const [inflow, setInflow] = useState<number[]>(Array.from({ length: WEEKS }, () => 950_000));
  const [outflow, setOutflow] = useState<number[]>(Array.from({ length: WEEKS }, () => 880_000));
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);

  const m = useMemo(() => {
    const balances: number[] = [];
    let bal = opening;
    for (let i = 0; i < WEEKS; i++) { bal = bal + inflow[i] - outflow[i]; balances.push(bal); }
    const low = Math.min(...balances);
    const lowWeek = balances.indexOf(low) + 1;
    const firstNegative = balances.findIndex((b) => b < 0);
    const net = balances[WEEKS - 1] - opening;
    return { balances, low, lowWeek, firstNegative: firstNegative >= 0 ? firstNegative + 1 : null, net, closing: balances[WEEKS - 1] };
  }, [opening, inflow, outflow]);

  function setAt(arr: number[], setter: (n: number[]) => void, i: number, v: string) {
    const copy = [...arr]; copy[i] = Number(v); setter(copy);
  }

  async function analyse() {
    setLoading(true); setOut("");
    const input = `13-week cash flow: opening balance ${inr(opening)}. Weekly inflows ${inflow.map((v) => Math.round(v / 1000) + "k").join(", ")}. Weekly outflows ${outflow.map((v) => Math.round(v / 1000) + "k").join(", ")}. Closing ${inr(m.closing)}, lowest point ${inr(m.low)} in week ${m.lowWeek}${m.firstNegative ? `, goes negative in week ${m.firstNegative}` : ""}. What should I do now to protect cash, in priority order?`;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "forecast", input }) });
      const j = await r.json(); setOut(j.text || "No response.");
    } catch { setOut("Network error reaching the AI."); } finally { setLoading(false); }
  }

  const maxAbs = Math.max(...m.balances.map((b) => Math.abs(b)), 1);
  const I = "rounded-md border bg-background px-1.5 h-8 text-xs outline-none focus:ring-2 focus:ring-ring w-full text-right";

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-semibold">13-week rolling cash flow</div>
          <div className="text-sm text-muted-foreground">The standard tool for spotting a cash crunch before it happens.</div>
        </div>
        <label className="text-sm">
          <span className="text-muted-foreground block mb-1">Opening balance</span>
          <input type="number" value={opening} onChange={(e) => setOpening(Number(e.target.value))}
            className="rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring w-40" />
        </label>
      </div>

      {m.firstNegative && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
          <span><b className="text-danger">Cash goes negative in week {m.firstNegative}.</b> You need to pull in receipts, delay payments, or arrange a facility before then.</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Closing balance" value={inr(m.closing)} cls={m.closing >= 0 ? "text-success" : "text-danger"} />
        <Stat label="Net movement" value={`${m.net >= 0 ? "+" : ""}${inr(m.net)}`} cls={m.net >= 0 ? "text-success" : "text-danger"} />
        <Stat label="Lowest point" value={inr(m.low)} cls={m.low < 0 ? "text-danger" : m.low < opening * 0.4 ? "text-warning" : ""} />
        <Stat label="Occurs in" value={`Week ${m.lowWeek}`} />
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs min-w-[860px] w-full">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium py-1 pr-2 sticky left-0 bg-card">Week</th>
              {Array.from({ length: WEEKS }, (_, i) => <th key={i} className="font-medium py-1 px-1">{i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1 pr-2 text-muted-foreground sticky left-0 bg-card">Inflow</td>
              {inflow.map((v, i) => <td key={i} className="px-0.5"><input className={I} type="number" value={v} onChange={(e) => setAt(inflow, setInflow, i, e.target.value)} /></td>)}
            </tr>
            <tr>
              <td className="py-1 pr-2 text-muted-foreground sticky left-0 bg-card">Outflow</td>
              {outflow.map((v, i) => <td key={i} className="px-0.5"><input className={I} type="number" value={v} onChange={(e) => setAt(outflow, setOutflow, i, e.target.value)} /></td>)}
            </tr>
            <tr className="border-t">
              <td className="py-1.5 pr-2 font-medium sticky left-0 bg-card">Balance</td>
              {m.balances.map((b, i) => (
                <td key={i} className={`px-0.5 py-1.5 text-center font-medium tabular-nums ${b < 0 ? "text-danger" : "text-foreground"}`}>
                  {Math.round(b / 1000)}k
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border p-3 bg-background/40">
        <div className="text-xs text-muted-foreground mb-2">Balance trend</div>
        <div className="flex items-end gap-1 h-20">
          {m.balances.map((b, i) => (
            <div key={i} className={`flex-1 rounded-t ${b < 0 ? "bg-danger" : "brand-gradient"}`}
              style={{ height: `${Math.max(3, (Math.abs(b) / maxAbs) * 100)}%` }} title={inr(b)} />
          ))}
        </div>
      </div>

      <Button onClick={analyse} disabled={loading}><Sparkles className="h-4 w-4" /> {loading ? "Analysing…" : "How do I protect cash? (ask the AI CFO)"}</Button>
      {out && <div className="rounded-lg border bg-background/50 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(out) }} />}
    </Card>
  );
}

function Stat({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div></div>;
}
