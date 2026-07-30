"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DEPARTMENTS, agentsForDepartment } from "@/lib/agents/catalog";
import { BrainCircuit, Sparkles, Loader2, ArrowRight, ScanSearch } from "lucide-react";

export function WorkforceMap({ totalAgents, hasBrain }: { totalAgents: number; hasBrain: boolean }) {
  const [activated, setActivated] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { fetch("/api/agents").then((r) => r.json()).then((j) => setActivated(j.activated || [])).catch(() => {}); }, []);
  const actSet = useMemo(() => new Set(activated), [activated]);

  const depts = useMemo(() => DEPARTMENTS.map((d) => {
    const agents = agentsForDepartment(d.id);
    const done = agents.filter((a) => actSet.has(a.id)).length;
    return { ...d, agents, done, total: agents.length, pct: agents.length ? Math.round((done / agents.length) * 100) : 0 };
  }), [actSet]);

  const totalDeptAgents = depts.reduce((s, d) => s + d.total, 0);
  const totalDone = depts.reduce((s, d) => s + d.done, 0);
  const overall = totalDeptAgents ? Math.round((totalDone / totalDeptAgents) * 100) : 0;

  async function audit() {
    setBusy(true); setMsg(""); setPlan("");
    try {
      const j = await fetch("/api/workforce/audit", { method: "POST" }).then((r) => r.json());
      if (j.ok) setPlan(j.plan); else setMsg(j.error || "Could not run the audit.");
    } catch { setMsg("Could not run the audit."); }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {/* Second brain */}
      <Card className="p-5 border-primary/30 bg-primary/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl brand-gradient grid place-items-center text-white"><BrainCircuit className="h-6 w-6" /></div>
            <div>
              <div className="font-semibold">Your second brain {hasBrain ? "· active" : "· not built yet"}</div>
              <div className="text-sm text-muted-foreground">Every agent plugs into Cortex Memory — it knows your business before it does a single job.</div>
            </div>
          </div>
          <Link href="/memory"><Button variant="outline" size="sm">{hasBrain ? "Open memory" : "Build your brain"}</Button></Link>
        </div>
      </Card>

      {/* Overall progress */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Workforce activation</div>
          <div className="text-sm text-muted-foreground">{totalDone} of {totalDeptAgents} department agents used · {totalAgents}+ total agents</div>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden"><div className="h-full brand-gradient" style={{ width: `${overall}%` }} /></div>
        <div className="text-xs text-muted-foreground mt-1">{overall}% activated — run an agent to light up its node.</div>
      </Card>

      {/* Audit engine */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 font-semibold"><ScanSearch className="h-4 w-4 text-primary" /> Audit my business</div>
          <Button size="sm" onClick={audit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Mark my roadmap</Button>
        </div>
        <p className="text-sm text-muted-foreground">Cortex scans your data + memory and hands back which agents to deploy first, second, third.</p>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        {plan && <div className="text-sm whitespace-pre-wrap leading-relaxed border rounded-lg p-4 bg-background max-h-[420px] overflow-y-auto">{plan}</div>}
      </Card>

      {/* Departments */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {depts.map((d) => (
          <Link key={d.id} href={`/agents?tab=${d.id}`} className="block">
            <Card className="p-4 h-full hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-xl">{d.emoji}</span><span className="font-semibold">{d.name}</span></div>
                <span className="text-xs text-muted-foreground">{d.total} agents</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{d.blurb}</div>
              <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${d.pct}%` }} /></div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{d.done}/{d.total} used</span>
                <span className="inline-flex items-center gap-1 text-primary">Open <ArrowRight className="h-3 w-3" /></span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
