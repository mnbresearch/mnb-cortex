"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, RefreshCw, Check, Zap, Landmark, ReceiptText, Upload } from "lucide-react";

type P = { title: string; why: string; tool: string; href: string; urgency: "high" | "medium" | "low" };
const dot: Record<string, string> = { high: "bg-danger", medium: "bg-warning", low: "bg-primary" };
const uLabel: Record<string, string> = { high: "Now", medium: "This week", low: "Soon" };
const DONE_KEY = "cortex_plan_done_v1";

export function PlanBoard() {
  const [items, setItems] = useState<P[] | null>(null);
  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(DONE_KEY) || "{}")); } catch {} }, []);
  function toggle(title: string) {
    setDone((d) => { const n = { ...d, [title]: !d[title] }; try { localStorage.setItem(DONE_KEY, JSON.stringify(n)); } catch {} return n; });
  }

  const load = useCallback(() => {
    setBusy(true);
    fetch("/api/priorities", { method: "POST" }).then((r) => r.json())
      .then((j) => { setItems(j.priorities || []); setMode(j.mode || ""); })
      .catch(() => setItems([]))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const doneCount = items ? items.filter((p) => done[p.title]).length : 0;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 rounded-2xl brand-gradient grid place-items-center text-white"><Zap className="h-5 w-5" /></span>
            <div>
              <div className="font-semibold">{mode === "setup" ? "Get set up, then Cortex plans your week" : "Your plan for the week"}</div>
              <div className="text-sm text-muted-foreground">{items && items.length ? `${doneCount} of ${items.length} done — chosen from 130+ tools for your business` : "Cortex reads your numbers and picks the few actions that matter."}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh</Button>
        </div>
        {items && items.length > 0 && (
          <div className="mt-4 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.round((doneCount / items.length) * 100)}%` }} />
          </div>
        )}
      </Card>

      {items === null ? (
        <Card className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /><div className="mt-2">Cortex is building your plan…</div></Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-medium">No plan yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">Add your data and Cortex will tell you exactly what to do next.</p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <Link href="/bank" className="inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-sm hover:bg-accent"><Landmark className="h-4 w-4 text-primary" /> Bank statement</Link>
            <Link href="/gst-reader" className="inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-sm hover:bg-accent"><ReceiptText className="h-4 w-4 text-primary" /> GST return</Link>
            <Link href="/import" className="inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-sm hover:bg-accent"><Upload className="h-4 w-4 text-primary" /> Import CSV</Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {items.map((p, i) => {
            const isDone = !!done[p.title];
            return (
              <Card key={i} style={{ animationDelay: `${i * 40}ms` }} className={`rise-in p-4 ${isDone ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggle(p.title)} aria-label="Mark done"
                    className={`h-6 w-6 rounded-full border-2 grid place-items-center shrink-0 mt-0.5 transition-colors ${isDone ? "bg-primary border-primary text-white" : "border-border hover:border-primary"}`}>
                    {isDone && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`h-2 w-2 rounded-full ${dot[p.urgency] || "bg-primary"}`} />
                      <span className={`font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>{p.title}</span>
                      <span className="text-[10px] uppercase tracking-wide rounded-full border px-1.5 py-0.5 text-muted-foreground">{uLabel[p.urgency] || "This week"}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{p.why}</p>
                    <Link href={p.href} className="mt-2 inline-flex items-center gap-1.5 rounded-lg brand-gradient text-white px-3 h-8 text-xs font-medium">Open {p.tool} <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
