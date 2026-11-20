"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, Loader2, ShieldCheck, Eye, Inbox, Brain, Ban, BadgeCheck, Pause, Play, Trash2, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { permissionCard, LIMITS, type ToolInfo } from "@/lib/agents/studio";

/*
  AGENT STUDIO — build an agent in plain words, then govern it.

  1. Describe the job. Cortex drafts the agent (metered, refunded on failure).
  2. Review every field — above all the tools. The permission card beside the
     form is computed from the ticked tools, live, so what you see is what the
     agent will be allowed to do.
  3. Save. The agent joins its team: the lead can plan it in, the router can
     pick it, and it runs under the same approvals, credit ceilings and Veritas
     checks as every built-in agent.
*/

type Team = "finance" | "operations" | "growth";
type Spec = { team: Team; name: string; role: string; instructions: string; tools: string[]; keywords: string[] };
type Row = Spec & { id: string; active: boolean; runnerId: string; card: ReturnType<typeof permissionCard> };
type Data = { ok: boolean; ready: boolean; limit: number; canEdit: boolean; tools: ToolInfo[]; agents: Row[]; error?: string };

const TEAM_LABEL: Record<Team, string> = { finance: "Finance", operations: "Operations", growth: "Sales & Growth" };
const EMPTY: Spec = { team: "finance", name: "", role: "", instructions: "", tools: [], keywords: [] };
const EXAMPLES = [
  "Every Monday, find distributors in Gujarat more than 60 days overdue and draft a polite reminder for each.",
  "Before each GST due date, check our purchase register against what suppliers filed and list the mismatches.",
  "Read the bank's emails about our credit limit and tell me what documents are still pending.",
];

function PermissionCard({ tools, compact = false }: { tools: string[]; compact?: boolean }) {
  const c = permissionCard({ tools });
  return (
    <div className={`rounded-xl border bg-background/60 ${compact ? "p-3 text-xs" : "p-4 text-sm"} space-y-3`}>
      <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Permission card</div>
      <div>
        <p className="flex items-center gap-1.5 font-medium"><Eye className="h-3.5 w-3.5 text-muted-foreground" /> May read</p>
        {c.reads.length ? <ul className="mt-1 space-y-0.5 text-muted-foreground">{c.reads.map((r) => <li key={r}>· {r}</li>)}</ul> : <p className="mt-1 text-muted-foreground">Nothing yet — tick at least one tool.</p>}
      </div>
      <p className="flex items-center gap-1.5"><Inbox className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium">May propose:</span> <span className="text-muted-foreground">{c.proposes ? "reminders, alerts and exports — each waits for approval" : "nothing"}</span></p>
      <p className="flex items-center gap-1.5"><Brain className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium">May remember:</span> <span className="text-muted-foreground">{c.remembers ? "facts, labelled AI-inferred" : "nothing"}</span></p>
      {!compact && (
        <>
          <div>
            <p className="flex items-center gap-1.5 font-medium"><Ban className="h-3.5 w-3.5 text-muted-foreground" /> Can never</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">{c.never.map((r) => <li key={r}>· {r}</li>)}</ul>
          </div>
          <div>
            <p className="flex items-center gap-1.5 font-medium"><BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" /> Always</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">{c.checks.map((r) => <li key={r}>· {r}</li>)}</ul>
          </div>
        </>
      )}
    </div>
  );
}

export function AgentStudio() {
  const [d, setD] = useState<Data | null>(null);
  const [desc, setDesc] = useState("");
  const [form, setForm] = useState<Spec | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "draft" | "save">("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const j = await (await fetch("/api/agents/studio", { cache: "no-store" })).json(); setD(j); } catch { setD({ ok: false, error: "Could not load Agent Studio." } as any); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const g: Record<string, ToolInfo[]> = {};
    for (const t of d?.tools || []) (g[t.group] ||= []).push(t);
    return g;
  }, [d]);

  async function draft() {
    setBusy("draft"); setMsg(null);
    try {
      const j = await (await fetch("/api/agents/studio/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: desc }) })).json();
      if (!j.ok) { setMsg(j.error || "Could not draft the agent."); return; }
      setForm({ ...EMPTY, ...j.draft, keywords: j.draft.keywords || [], tools: j.draft.tools || [] }); setEditing(null);
      if (j.problem) setMsg(`Check the draft: ${j.problem}`);
    } finally { setBusy(""); }
  }

  async function save() {
    if (!form) return;
    setBusy("save"); setMsg(null);
    try {
      const j = await (await fetch("/api/agents/studio", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { id: editing, ...form } : form) })).json();
      if (!j.ok) { setMsg(j.error || "Could not save the agent."); return; }
      setForm(null); setEditing(null); setDesc(""); setMsg(`${j.agent.name} saved. It has joined the ${TEAM_LABEL[j.agent.team as Team]} team.`); load();
    } finally { setBusy(""); }
  }

  async function act(id: string, kind: "pause" | "resume" | "delete") {
    if (kind === "delete" && !confirm("Delete this agent? Tasks it already finished keep their results.")) return;
    await fetch("/api/agents/studio", { method: kind === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "delete" ? { id } : { id, active: kind === "resume" }) });
    load();
  }

  if (!d) return <Card className="p-5 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading Agent Studio…</Card>;
  if (!d.ok) return <Card className="p-5 text-sm text-muted-foreground">{d.error}</Card>;

  const used = d.agents.length;
  const toggleTool = (n: string) => form && setForm({ ...form, tools: form.tools.includes(n) ? form.tools.filter((t) => t !== n) : [...form.tools, n].slice(0, LIMITS.tools) });

  return (
    <section className="space-y-4" aria-labelledby="studio-h">
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[16rem]">
            <h2 id="studio-h" className="text-base font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Agent Studio</h2>
            <p className="text-sm text-muted-foreground mt-1">Build your own agent in plain words. You choose exactly what it may read and propose; it joins its team and works under the same approvals, credit limits and Veritas checks as every built-in agent.</p>
          </div>
          <span className="text-xs text-muted-foreground rounded-full border px-3 py-1">{used} of {d.limit} used on your plan</span>
        </div>

        {!d.ready && <p className="text-sm rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">Agent Studio needs its table: run <code>supabase/RUN-2026-11-20-workspace-agents.sql</code> in Supabase.</p>}

        {d.ready && d.canEdit && !form && (
          <div className="space-y-2">
            <label htmlFor="studio-desc" className="text-sm font-medium">Describe the job</label>
            <textarea id="studio-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={1500}
              placeholder="What should it look at, for whom, how often, and what should it hand back?"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setDesc(x)} className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent text-left">{x}</button>)}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={draft} disabled={busy !== "" || desc.trim().length < 15 || used >= d.limit}>{busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Draft the agent</Button>
              <Button variant="outline" onClick={() => { setForm({ ...EMPTY }); setEditing(null); }} disabled={used >= d.limit}><Plus className="h-4 w-4" /> Start blank</Button>
              <span className="text-[11px] text-muted-foreground">Drafting costs one planning step in credits and is refunded if it fails. Nothing is saved until you press Save.</span>
            </div>
            {used >= d.limit && <p className="text-xs text-muted-foreground">You have used every Agent Studio slot on your plan. <Link href="/billing" className="underline">See plans</Link>.</p>}
          </div>
        )}
        {d.ready && !d.canEdit && <p className="text-xs text-muted-foreground">Managers and above can build and change agents.</p>}

        {form && (
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-2">
                <input aria-label="Agent name" value={form.name} maxLength={LIMITS.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name, e.g. Gujarat Collections Agent" className="h-9 rounded-lg border bg-background px-3 text-sm" />
                <select aria-label="Team" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value as Team })} className="h-9 rounded-lg border bg-background px-2 text-sm">
                  {(Object.keys(TEAM_LABEL) as Team[]).map((t) => <option key={t} value={t}>Joins the {TEAM_LABEL[t]} team</option>)}
                </select>
              </div>
              <input aria-label="Role" value={form.role} maxLength={LIMITS.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="One line: what it does" className="h-9 w-full rounded-lg border bg-background px-3 text-sm" />
              <textarea aria-label="Instructions" value={form.instructions} maxLength={LIMITS.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} rows={6}
                placeholder="What to look up, how to judge it, what to report, when to propose an action." className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              <div>
                <p className="text-sm font-medium">Tools it may use</p>
                <div className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-3">
                  {Object.entries(groups).map(([g, ts]) => (
                    <fieldset key={g}>
                      <legend className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{g}</legend>
                      {ts.map((t) => (
                        <label key={t.name} className="mt-1 flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={form.tools.includes(t.name)} onChange={() => toggleTool(t.name)} />
                          {t.label}{t.access === "propose" && <span className="text-[10px] text-primary">needs approval</span>}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              </div>
              <input aria-label="Keywords" value={form.keywords.join(", ")} onChange={(e) => setForm({ ...form, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
                placeholder="Words that should route a request to it, comma-separated" className="h-9 w-full rounded-lg border bg-background px-3 text-sm" />
              <div className="flex flex-wrap gap-2">
                <Button onClick={save} disabled={busy !== ""}>{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {editing ? "Save changes" : "Save agent"}</Button>
                <Button variant="ghost" onClick={() => { setForm(null); setEditing(null); }}><X className="h-4 w-4" /> Cancel</Button>
              </div>
            </div>
            <PermissionCard tools={form.tools} />
          </div>
        )}
        {msg && <p className="text-sm" role="status">{msg}</p>}
      </Card>

      {d.agents.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.agents.map((a) => (
            <Card key={a.id} className={`p-4 space-y-2 ${a.active ? "" : "opacity-70"}`}>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm flex-1 min-w-0 truncate">{a.name}</h3>
                <span className="text-[10px] rounded-full border border-primary/30 text-primary px-2 py-0.5">Built by you</span>
              </div>
              <p className="text-xs text-muted-foreground">{TEAM_LABEL[a.team]} team · {a.active ? "active" : "paused"}</p>
              <p className="text-sm text-muted-foreground">{a.role}</p>
              <PermissionCard tools={a.tools} compact />
              {d.canEdit && (
                <div className="flex flex-wrap gap-1 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => { setForm({ team: a.team, name: a.name, role: a.role, instructions: a.instructions, tools: a.tools, keywords: a.keywords }); setEditing(a.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(a.id, a.active ? "pause" : "resume")}>{a.active ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(a.id, "delete")}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                  <Link href={`/workspace?team=${a.team}`} className="ml-auto self-center text-xs font-medium text-primary underline">Delegate</Link>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
