"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot, Send, Loader2, Pause, Play, X, CheckCircle2, AlertTriangle, Clock, ShieldCheck, ListChecks, Sparkles,
  ChevronDown, ChevronRight, Wrench, CalendarClock, Trash2, Users, Inbox,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentMarkdown } from "@/components/agent-markdown";

type TeamLite = { id: string; name: string; solution: string; examples: string[] };
type AgentLite = { id: string; team: string; name: string; role: string; lead?: boolean };
type ToolCall = { name: string; ok: boolean; summary: string; rows: number };
type Step = {
  id: string; seq: number; kind: "plan" | "agent" | "synthesis" | "verify"; agent_id: string | null; agent_name: string | null;
  instruction: string | null; status: string; output: string | null; tool_calls: ToolCall[]; credits: number; error: string | null;
};
type Verification = { engine: string; status: string; checked: number; supported: number; unsupported: { text: string }[]; injection: string[]; note: string };
type Task = {
  id: string; title: string; request: string; team: string; mode: "single" | "team"; agent_id: string | null; status: string;
  status_reason: string | null; result: string | null; verification: Verification | null; proposals: number;
  credits_used: number; credit_ceiling: number; background: boolean; schedule_id: string | null; created_at: string; finished_at: string | null;
};
type Usage = { plan: string; limits: { activeTasks: number; teamTasks: boolean; background: boolean; schedules: number; taskCeiling: number }; active: number; schedules: number };
type Schedule = { id: string; title: string; request: string; cadence: string; hour_ist: number; weekday: number; monthday: number; enabled: boolean; next_run_at: string; last_task_id: string | null };

const TOOL_LABEL: Record<string, string> = {
  top_receivables: "Receivables", top_payables: "Payables", top_customers: "Top customers", recent_orders: "Recent orders",
  low_stock: "Low stock", find_party: "Customer/supplier lookup", collections_status: "Collections", revenue_by_month: "Revenue by month",
  propose_action: "Proposed an action", business_snapshot: "KPI snapshot", msme_exposure: "43B(h) exposure",
  statutory_deadlines: "Statutory calendar", customer_segments: "Customer segments", recall_memory: "Memory", remember_fact: "Saved to memory",
  search_company_knowledge: "Company knowledge", list_company_sources: "Connected sources", query_connected_system: "Connected system",
  forensic_audit_score: "Forensic audit score", detect_invoice_anomalies: "Invoice anomalies",
};

const LIVE = new Set(["queued", "running"]);
const STATUS_STYLE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground border-border", running: "bg-primary/10 text-primary border-primary/30",
  paused: "bg-warning/15 text-warning-foreground border-warning/30", done: "bg-success/15 text-success border-success/30",
  failed: "bg-danger/10 text-danger border-danger/30", cancelled: "bg-muted text-muted-foreground border-border",
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function StatusPill({ status }: { status: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[status] || STATUS_STYLE.queued}`}>
    {LIVE.has(status) && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}{status}
  </span>;
}

function VeritasBadge({ v }: { v: Verification | null }) {
  if (!v) return null;
  const tone = v.status === "verified" ? "text-success border-success/30 bg-success/10"
    : v.status === "no_figures" ? "text-muted-foreground border-border bg-muted/40"
    : "text-warning-foreground border-warning/40 bg-warning/15";
  const label = v.status === "verified" ? `${v.checked} figure${v.checked === 1 ? "" : "s"} verified`
    : v.status === "no_figures" ? "No figures to check"
    : `${v.unsupported.length} of ${v.checked} figure(s) unconfirmed`;
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${tone}`}>
      <div className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {v.engine} · {label}</div>
      <p className="mt-1 opacity-90">{v.note}</p>
      {v.injection?.length > 0 && <p className="mt-1 font-medium">Instruction-like text was found in the data and ignored: {v.injection.join("; ")}.</p>}
    </div>
  );
}

function StepRow({ s }: { s: Step }) {
  const [open, setOpen] = useState(false);
  const icon = s.kind === "plan" ? <ListChecks className="h-4 w-4" /> : s.kind === "verify" ? <ShieldCheck className="h-4 w-4" /> : s.kind === "synthesis" ? <Sparkles className="h-4 w-4" /> : <Bot className="h-4 w-4" />;
  const kindLabel = s.kind === "plan" ? "Planned" : s.kind === "verify" ? "Checked" : s.kind === "synthesis" ? "Wrote the answer" : "Worked";
  return (
    <li className="relative pl-8">
      <span className={`absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${s.status === "done" ? "bg-success/10 text-success border-success/30" : s.status === "running" ? "bg-primary/10 text-primary border-primary/30" : s.status === "failed" ? "bg-danger/10 text-danger border-danger/30" : "bg-muted text-muted-foreground"}`} aria-hidden="true">
        {s.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      </span>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left" aria-expanded={open}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{s.agent_name || "Step"}</span>
          <span className="text-xs text-muted-foreground">{kindLabel}</span>
          <StatusPill status={s.status} />
          {s.credits > 0 && <span className="text-[11px] text-muted-foreground">{s.credits} credits</span>}
          {(s.output || s.tool_calls?.length > 0) && (open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />)}
        </div>
        {s.instruction && s.kind === "agent" && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.instruction}</p>}
      </button>
      {s.tool_calls?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {s.tool_calls.map((c, i) => (
            <span key={i} title={c.summary} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${c.ok ? "bg-background" : "bg-danger/5 text-danger border-danger/30"}`}>
              <Wrench className="h-3 w-3" aria-hidden="true" />{TOOL_LABEL[c.name] || c.name}{c.rows ? ` · ${c.rows}` : ""}
            </span>
          ))}
        </div>
      )}
      {s.error && s.status !== "done" && <p className="mt-1 text-xs text-danger">{s.error}</p>}
      {open && (
        <div className="mt-2 space-y-2">
          {s.tool_calls?.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {s.tool_calls.map((c, i) => <li key={i}><span className="font-medium text-foreground">{TOOL_LABEL[c.name] || c.name}:</span> {c.summary}</li>)}
            </ul>
          )}
          {s.output && s.kind !== "verify" && <div className="rounded-lg border bg-background p-3 max-h-80 overflow-y-auto"><AgentMarkdown text={s.output} /></div>}
          {s.output && s.kind === "verify" && <p className="text-xs text-muted-foreground">{s.output}</p>}
        </div>
      )}
    </li>
  );
}

export function AgentWorkspace({ teams, agents, canDelegate, canSchedule, initialTeam }: {
  teams: TeamLite[]; agents: AgentLite[]; canDelegate: boolean; canSchedule: boolean; initialTeam?: string;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [setup, setSetup] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ task: Task; steps: Step[] } | null>(null);
  const [request, setRequest] = useState("");
  const [team, setTeam] = useState<string>(initialTeam && teams.some((t) => t.id === initialTeam) ? initialTeam : "auto");
  const [mode, setMode] = useState<"auto" | "single" | "team">("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sched, setSched] = useState({ request: "", cadence: "weekly", hourIst: 9, weekday: 1, monthday: 1 });
  const [schedMsg, setSchedMsg] = useState<string | null>(null);
  const ticking = useRef(false);

  const agentName = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.name])), [agents]);
  const examples = (teams.find((t) => t.id === team) ?? teams[0])?.examples ?? [];

  const loadList = useCallback(async () => {
    try {
      const r = await fetch("/api/agents/tasks", { cache: "no-store" });
      const j = await r.json();
      if (j.setup) { setSetup(j.error); return; }
      if (j.ok) { setTasks(j.tasks); setUsage(j.usage); }
    } catch { /* keep what we have */ } finally { setLoaded(true); }
  }, []);

  const loadSchedules = useCallback(async () => {
    try { const j = await (await fetch("/api/agents/schedules", { cache: "no-store" })).json(); if (j.ok) setSchedules(j.schedules); } catch {}
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try { const j = await (await fetch(`/api/agents/tasks/${id}`, { cache: "no-store" })).json(); if (j.ok) setDetail({ task: j.task, steps: j.steps }); } catch {}
  }, []);

  useEffect(() => { loadList(); loadSchedules(); }, [loadList, loadSchedules]);
  useEffect(() => { if (selected) loadDetail(selected); else setDetail(null); }, [selected, loadDetail]);
  useEffect(() => { if (!selected && tasks.length) setSelected(tasks[0].id); }, [tasks, selected]);

  /*
    The runner while you watch: tick the selected task if it is live, else the
    oldest live one. One request at a time. The background sweeper does the
    same when this tab is closed (on plans with background running).
  */
  useEffect(() => {
    let stop = false;
    async function loop() {
      while (!stop) {
        const liveSelected = detail && LIVE.has(detail.task.status) ? detail.task.id : null;
        const target = liveSelected ?? tasks.filter((t) => LIVE.has(t.status)).slice(-1)[0]?.id ?? null;
        if (!target || ticking.current) { await new Promise((r) => setTimeout(r, 4000)); if (!stop && tasks.some((t) => LIVE.has(t.status))) await loadList(); continue; }
        ticking.current = true;
        try {
          const j = await (await fetch(`/api/agents/tasks/${target}/tick`, { method: "POST" })).json();
          if (j.ok && target === selected) setDetail({ task: j.task, steps: j.steps });
        } catch { /* the next loop tries again */ } finally { ticking.current = false; }
        await loadList();
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    const anyLive = tasks.some((t) => LIVE.has(t.status)) || (detail && LIVE.has(detail.task.status));
    if (anyLive) loop();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.map((t) => `${t.id}:${t.status}`).join(","), detail?.task.status, selected]);

  async function delegate(text?: string) {
    const body = (text ?? request).trim();
    if (body.length < 4) { setError("Say what you want the agents to do."); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/agents/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: body, team, mode }) });
      const j = await r.json();
      if (!j.ok) { setError(j.error || "Could not start the task."); return; }
      setRequest(""); setSelected(j.task.id); await loadList();
    } catch { setError("Could not reach Cortex. Check your connection and try again."); } finally { setBusy(false); }
  }

  async function control(action: "pause" | "resume" | "cancel") {
    if (!detail) return;
    const j = await (await fetch(`/api/agents/tasks/${detail.task.id}/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })).json();
    if (!j.ok) setError(j.error); else { await loadDetail(detail.task.id); await loadList(); }
  }

  async function addSchedule() {
    setSchedMsg(null);
    const j = await (await fetch("/api/agents/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sched, team: team === "auto" ? undefined : team }) })).json();
    if (!j.ok) { setSchedMsg(j.error); return; }
    setSched((s) => ({ ...s, request: "" })); setSchedMsg("Scheduled."); loadSchedules();
  }
  async function scheduleAction(id: string, action: "pause" | "resume" | "delete") {
    await fetch("/api/agents/schedules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    loadSchedules();
  }

  if (setup) {
    return <Card className="p-6 text-sm border-warning/30 bg-warning/10"><p className="font-semibold">One step left to switch on the Agent Workspace</p><p className="mt-1 text-muted-foreground">{setup}</p></Card>;
  }

  const t = detail?.task;
  return (
    <div className="space-y-5">
      {/* Composer */}
      <Card className="p-5">
        <label htmlFor="agent-request" className="text-sm font-semibold">What should your agents work on?</label>
        <textarea
          id="agent-request" value={request} onChange={(e) => setRequest(e.target.value)} rows={3} maxLength={4000}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) delegate(); }}
          placeholder="e.g. Who owes us the most, and draft reminders for anything over 60 days"
          className="mt-2 w-full rounded-lg border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={!canDelegate}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Team" className="flex flex-wrap gap-1.5">
            {[{ id: "auto", name: "Auto" }, ...teams].map((tm) => (
              <button key={tm.id} type="button" role="radio" aria-checked={team === tm.id} onClick={() => setTeam(tm.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${team === tm.id ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}>{tm.name}</button>
            ))}
          </div>
          <select aria-label="How many agents" value={mode} onChange={(e) => setMode(e.target.value as any)} className="h-8 rounded-lg border bg-background px-2 text-xs">
            <option value="auto">Cortex decides</option>
            <option value="single">One agent</option>
            <option value="team" disabled={usage ? !usage.limits.teamTasks : false}>A team of agents{usage && !usage.limits.teamTasks ? " (Growth plan and up)" : ""}</option>
          </select>
          <div className="ml-auto">
            <Button onClick={() => delegate()} disabled={busy || !canDelegate}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Delegate</Button>
          </div>
        </div>
        {!canDelegate && <p className="mt-2 text-xs text-muted-foreground">Delegating needs the analyst role or higher. You can still read every task.</p>}
        {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
        {examples.length > 0 && canDelegate && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {examples.map((ex) => <button key={ex} type="button" onClick={() => setRequest(ex)} className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground text-left">{ex}</button>)}
          </div>
        )}
        {usage && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {usage.active}/{usage.limits.activeTasks} tasks running · {usage.limits.teamTasks ? "team tasks included" : "one agent per task on this plan"} · {usage.limits.background ? "keeps working when you close this tab" : "works while this page is open"} · each task stops and asks before spending more than {usage.limits.taskCeiling} credits · actions always wait on <Link href="/approvals" className="underline">Approvals</Link> unless you set an Autopilot rule
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,340px)_1fr]">
        {/* Task list */}
        <Card className="p-3 h-fit">
          <div className="flex items-center justify-between px-2 py-1"><h2 className="text-sm font-semibold">Tasks</h2><span className="text-xs text-muted-foreground">{tasks.length}</span></div>
          {!loaded ? <p className="px-2 py-4 text-sm text-muted-foreground">Loading…</p>
            : !tasks.length ? <p className="px-2 py-4 text-sm text-muted-foreground">No tasks yet. Delegate something above, or pick an example.</p>
            : (
              <ul className="space-y-1">
                {tasks.map((tk) => (
                  <li key={tk.id}>
                    <button type="button" onClick={() => setSelected(tk.id)} className={`w-full rounded-lg px-2 py-2 text-left hover:bg-accent ${selected === tk.id ? "bg-accent" : ""}`}>
                      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium line-clamp-1">{tk.title}</span><StatusPill status={tk.status} /></div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                        <span>{tk.mode === "team" ? <><Users className="inline h-3 w-3" /> {agentName[tk.agent_id || ""] || "Team"}</> : agentName[tk.agent_id || ""] || "Agent"}</span>
                        {tk.schedule_id && <span><CalendarClock className="inline h-3 w-3" /> scheduled</span>}
                        <span>{new Date(tk.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </Card>

        {/* Task detail */}
        <Card className="p-5 min-h-[300px]">
          {!t ? <p className="text-sm text-muted-foreground">Select a task to see its steps, its answer and what was checked.</p> : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{t.title}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.mode === "team" ? "Team task" : "Single agent"} · {agentName[t.agent_id || ""] || t.team} · {t.credits_used}/{t.credit_ceiling} credits</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={t.status} />
                  {LIVE.has(t.status) && canDelegate && <Button size="sm" variant="outline" onClick={() => control("pause")}><Pause className="h-3.5 w-3.5" /> Pause</Button>}
                  {t.status === "paused" && canDelegate && <Button size="sm" onClick={() => control("resume")}><Play className="h-3.5 w-3.5" /> Resume</Button>}
                  {(LIVE.has(t.status) || t.status === "paused") && canDelegate && <Button size="sm" variant="ghost" onClick={() => control("cancel")}><X className="h-3.5 w-3.5" /> Cancel</Button>}
                </div>
              </div>
              {t.status_reason && (
                <p className={`text-sm flex items-start gap-1.5 ${t.status === "paused" || t.status === "failed" ? "text-warning-foreground" : "text-muted-foreground"}`}>
                  {t.status === "done" ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" /> : t.status === "paused" || t.status === "failed" ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> : <Clock className="h-4 w-4 mt-0.5 shrink-0" />}
                  {t.status_reason}
                </p>
              )}
              {t.proposals > 0 && (
                <Link href="/approvals" className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10">
                  <Inbox className="h-4 w-4" /> {t.proposals} action{t.proposals === 1 ? "" : "s"} waiting for your approval
                </Link>
              )}
              {t.result && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Answer</h3>
                  <div className="rounded-lg border bg-background p-4"><AgentMarkdown text={t.result} /></div>
                  <VeritasBadge v={t.verification} />
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold mb-2">What the agents did</h3>
                <ol className="space-y-3">{(detail?.steps || []).map((s) => <StepRow key={s.id} s={s} />)}</ol>
              </div>
              <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">The request</summary><p className="mt-1 whitespace-pre-wrap">{t.request}</p></details>
            </div>
          )}
        </Card>
      </div>

      {/* Schedules */}
      <Card className="p-5">
        <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /><h2 className="text-sm font-semibold">Scheduled agents</h2>
          {usage && <span className="text-xs text-muted-foreground">{usage.schedules}/{usage.limits.schedules} on your plan</span>}</div>
        {schedules.length > 0 && (
          <ul className="mt-3 divide-y">
            {schedules.map((s) => (
              <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0"><p className="font-medium line-clamp-1">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.cadence === "daily" ? "Every day" : s.cadence === "weekly" ? `Every ${DAYS[s.weekday]}` : `Monthly on day ${s.monthday}`} at {String(s.hour_ist).padStart(2, "0")}:00 IST · {s.enabled ? `next ${new Date(s.next_run_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "paused"}</p></div>
                {canSchedule && <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => scheduleAction(s.id, s.enabled ? "pause" : "resume")}>{s.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{s.enabled ? "Pause" : "Resume"}</Button>
                  <Button size="sm" variant="ghost" aria-label="Delete schedule" onClick={() => scheduleAction(s.id, "delete")}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>}
              </li>
            ))}
          </ul>
        )}
        {canSchedule ? (
          usage && usage.limits.schedules === 0
            ? <p className="mt-2 text-sm text-muted-foreground">Scheduled agents start on the Growth plan. <Link href="/billing" className="underline">See plans</Link>.</p>
            : (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto] items-end">
                <input aria-label="What should run" value={sched.request} onChange={(e) => setSched({ ...sched, request: e.target.value })} placeholder="e.g. Review overdue receivables and draft reminders" className="h-9 rounded-lg border bg-background px-3 text-sm" />
                <select aria-label="How often" value={sched.cadence} onChange={(e) => setSched({ ...sched, cadence: e.target.value })} className="h-9 rounded-lg border bg-background px-2 text-sm">
                  <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                </select>
                {sched.cadence === "weekly" && <select aria-label="Day" value={sched.weekday} onChange={(e) => setSched({ ...sched, weekday: Number(e.target.value) })} className="h-9 rounded-lg border bg-background px-2 text-sm">{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>}
                {sched.cadence === "monthly" && <select aria-label="Day of month" value={sched.monthday} onChange={(e) => setSched({ ...sched, monthday: Number(e.target.value) })} className="h-9 rounded-lg border bg-background px-2 text-sm">{Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select>}
                <select aria-label="Hour (IST)" value={sched.hourIst} onChange={(e) => setSched({ ...sched, hourIst: Number(e.target.value) })} className="h-9 rounded-lg border bg-background px-2 text-sm">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
                <Button onClick={addSchedule}><CalendarClock className="h-4 w-4" /> Schedule</Button>
              </div>
            )
        ) : <p className="mt-2 text-xs text-muted-foreground">Managers and above can schedule agents.</p>}
        {schedMsg && <p className="mt-2 text-xs text-muted-foreground">{schedMsg}</p>}
      </Card>
    </div>
  );
}
