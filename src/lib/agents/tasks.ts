import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { runCortex, isEngineFailure } from "@/lib/ai/cortex";
import { FAST, STANDARD } from "@/lib/ai/generation";
import { withOrgAiKeys } from "@/lib/ai/byo";
import { runInAgentScope, type AgentToolCall } from "@/lib/ai/agent-scope";
import { chargeOrgForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";
import { agentLimits, creditCost } from "@/lib/config";
import { recallContext } from "@/lib/memory";
import { declarationsFor, runAgentTool } from "@/lib/agents/toolkit";
import { CORE_AGENTS_BY_ID, leadOf, type TeamId } from "@/lib/agents/teams";
import { routeRequest, fallbackPlan, parsePlan, planningPrompt, synthesisPrompt, agentById, type PlanStep } from "@/lib/agents/orchestration";
import { workspaceAgents } from "@/lib/agents/workspace-agents";
import { verifyAnswer, type Verification } from "@/lib/veritas";
import { nextRunAt, type Cadence } from "@/lib/agents/schedule";

/*
  THE TASK RUNNER.

  A task is a row; its work is a list of step rows; each step is checkpointed.
  advanceTask() claims the task with a lease, runs the next pending step (or
  plans the steps, for a team task), writes the result, and releases the lease.
  It is called by two runners and is safe under both at once:

    - the Workspace page, which ticks the task while the owner watches, and
    - the sweeper (/api/cron/agents), which advances background tasks when the
      tab is closed — every 5 minutes from GitHub Actions, daily from Vercel.

  Nothing here holds a task across function invocations. A step that is cut
  off by a timeout leaves its row 'running' with an expired lease; the next
  runner sees the lease has lapsed and runs that step again (attempts + 1, at
  most MAX_ATTEMPTS). A step that finished is never run twice.

  Money: every model-backed step is charged BEFORE it runs, through the same
  chargeOrgForMode() every other AI path uses (pooling, BYO keys, lapsed plans
  and all), and refunded if the model never answered. The task stops before a
  step that would take it past its credit ceiling and asks the owner.

  Actions: agents can only PROPOSE (propose_action → the ledger). Approve-first
  holds on every plan unless the owner set an Autopilot rule.
*/

export const LEASE_MS = 70_000;
const STEP_BUDGET_MS = 40_000;
const MAX_ATTEMPTS = 3;
const RUNNABLE = ["queued", "running"] as const;

export type TaskStatus = "queued" | "running" | "paused" | "done" | "failed" | "cancelled";
export type TaskRow = {
  id: string; org_id: string; created_by: string | null; title: string; request: string; team: TeamId;
  mode: "single" | "team"; agent_id: string | null; status: TaskStatus; status_reason: string | null;
  plan: PlanStep[] | null; result: string | null; verification: Verification | null; proposals: number;
  credits_used: number; credit_ceiling: number; background: boolean; schedule_id: string | null;
  lease_until: string | null; attempts: number; created_at: string; updated_at: string;
  started_at: string | null; finished_at: string | null;
};
export type StepRow = {
  id: string; task_id: string; org_id: string; seq: number; kind: "plan" | "agent" | "synthesis" | "verify";
  agent_id: string | null; agent_name: string | null; instruction: string | null;
  status: "pending" | "running" | "done" | "failed" | "skipped"; output: string | null;
  tool_calls: AgentToolCall[]; credits: number; error: string | null; attempts: number;
  started_at: string | null; finished_at: string | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

const db = () => serviceClient() as any;
const nowIso = () => new Date().toISOString();

/** True when the migration has been run. Every entry point checks it and says so plainly. */
export async function agentTablesReady(): Promise<boolean> {
  const sb = db(); if (!sb) return false;
  try { const { error } = await sb.from("agent_tasks").select("id").limit(1); return !error; } catch { return false; }
}

export const SETUP_MESSAGE = "The Agent Workspace needs its database tables. Run supabase/RUN-2026-11-20-agent-workspace.sql in the Supabase SQL editor, then reload.";

async function planOf(orgId: string): Promise<string> {
  const { data } = await db().from("organizations").select("plan").eq("id", orgId).maybeSingle();
  return String((data as any)?.plan || "").toLowerCase();
}

function titleFrom(request: string): string {
  const t = request.replace(/\s+/g, " ").trim();
  return t.length > 80 ? t.slice(0, 77).trimEnd() + "…" : t;
}

/* ============================================================== create */

export async function createTask(input: {
  orgId: string; userId: string | null; request: string; team?: TeamId | "auto"; mode?: "single" | "team" | "auto";
  agentId?: string | null; scheduleId?: string | null; title?: string;
}): Promise<Result<TaskRow>> {
  const sb = db(); if (!sb) return { ok: false, error: "The database is not configured." };
  const request = String(input.request || "").trim().slice(0, 4000);
  if (request.length < 4) return { ok: false, error: "Say what you want the agents to do." };

  const plan = await planOf(input.orgId);
  const limits = agentLimits(plan);

  /* Active-task limit, counted from the table, not a counter. */
  const { count } = await sb.from("agent_tasks").select("id", { count: "exact", head: true })
    .eq("org_id", input.orgId).in("status", ["queued", "running"]);
  if ((count ?? 0) >= limits.activeTasks) {
    return { ok: false, code: "limit", error: `Your plan runs ${limits.activeTasks} agent task${limits.activeTasks === 1 ? "" : "s"} at a time and that many are already running. Wait for one to finish, cancel one, or upgrade for more.` };
  }

  /* The workspace's own Agent Studio agents join routing alongside the built-ins. */
  const extra = await workspaceAgents(input.orgId);
  const pinned = input.agentId ? agentById(input.agentId, extra) : undefined;
  const route = routeRequest(request, pinned?.team ?? input.team ?? "auto",
    input.mode === "single" || input.mode === "team" ? input.mode : undefined, extra);
  let mode = pinned ? "single" as const : route.mode;
  if (mode === "team" && !limits.teamTasks) mode = "single";   // downgrade, never refuse: one agent still answers
  const agent = pinned ?? (mode === "team" ? leadOf(route.team) : route.agent);

  const { data: task, error } = await sb.from("agent_tasks").insert({
    org_id: input.orgId, created_by: input.userId, title: (input.title || titleFrom(request)).slice(0, 200), request,
    team: agent.team, mode, agent_id: agent.id, status: "queued",
    status_reason: mode === "team" ? `${route.reason}. ${agent.name} will plan the work.` : `${agent.name} — ${route.reason.toLowerCase()}.`,
    plan: mode === "single" ? [{ agent: agent.id, instruction: request }] : null,
    credit_ceiling: limits.taskCeiling, background: limits.background, schedule_id: input.scheduleId ?? null,
  }).select("*").single();
  if (error || !task) return { ok: false, error: error?.message || "Could not create the task." };

  const steps = mode === "single"
    ? [
        { seq: 1, kind: "agent", agent_id: agent.id, agent_name: agent.name, instruction: request },
        { seq: 2, kind: "verify", agent_id: null, agent_name: "Veritas v1", instruction: "Check every rupee figure against what the agent read." },
      ]
    : [{ seq: 0, kind: "plan", agent_id: agent.id, agent_name: agent.name, instruction: "Plan which specialists to use." }];
  const { error: stepErr } = await sb.from("agent_task_steps").insert(steps.map((s) => ({ ...s, task_id: task.id, org_id: input.orgId })));
  if (stepErr) {
    await sb.from("agent_tasks").update({ status: "failed", status_reason: `Could not create its steps: ${stepErr.message}` }).eq("id", task.id);
    return { ok: false, error: stepErr.message };
  }
  return { ok: true, data: task as TaskRow };
}

/* ============================================================== read */

export async function listTasks(orgId: string, limit = 30): Promise<TaskRow[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("agent_tasks").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
  return (data as TaskRow[]) || [];
}

export async function getTask(orgId: string, id: string): Promise<{ task: TaskRow; steps: StepRow[] } | null> {
  const sb = db(); if (!sb) return null;
  const { data: task } = await sb.from("agent_tasks").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!task) return null;
  const { data: steps } = await sb.from("agent_task_steps").select("*").eq("task_id", id).eq("org_id", orgId).order("seq", { ascending: true });
  return { task: task as TaskRow, steps: (steps as StepRow[]) || [] };
}

/* ============================================================== control */

export async function controlTask(orgId: string, id: string, action: "pause" | "resume" | "cancel"): Promise<Result<TaskRow>> {
  const sb = db(); if (!sb) return { ok: false, error: "The database is not configured." };
  const found = await getTask(orgId, id);
  if (!found) return { ok: false, error: "No such task in this workspace." };
  const t = found.task;
  let patch: Record<string, unknown> | null = null;
  if (action === "cancel" && !["done", "failed", "cancelled"].includes(t.status)) {
    patch = { status: "cancelled", status_reason: "Cancelled by you. Finished steps were charged; nothing else will run.", finished_at: nowIso(), lease_until: null };
    await sb.from("agent_task_steps").update({ status: "skipped" }).eq("task_id", id).eq("status", "pending");
  } else if (action === "pause" && RUNNABLE.includes(t.status as any)) {
    patch = { status: "paused", status_reason: "Paused by you. Resume to carry on from the next step." };
  } else if (action === "resume" && t.status === "paused") {
    /* A ceiling pause resumes with room for one more ceiling's worth — the owner just said yes to spending it. */
    const atCeiling = /credit ceiling/i.test(String(t.status_reason || ""));
    const limits = agentLimits(await planOf(orgId));
    patch = { status: "running", status_reason: "Resumed.", lease_until: null, ...(atCeiling ? { credit_ceiling: t.credits_used + limits.taskCeiling } : {}) };
  }
  if (!patch) return { ok: false, error: `This task is ${t.status}; it cannot be ${action}d.` };
  const { data } = await sb.from("agent_tasks").update({ ...patch, updated_at: nowIso() }).eq("id", id).eq("org_id", orgId).select("*").single();
  return { ok: true, data: (data as TaskRow) || t };
}

/* ============================================================== run */

/** Claim a task for this runner. Returns the row only if THIS call got the lease. */
async function claim(id: string, orgId?: string): Promise<TaskRow | null> {
  const sb = db(); if (!sb) return null;
  const now = nowIso();
  let q = sb.from("agent_tasks")
    .update({ lease_until: new Date(Date.now() + LEASE_MS).toISOString(), updated_at: now })
    .eq("id", id).in("status", RUNNABLE as unknown as string[])
    .or(`lease_until.is.null,lease_until.lt.${now}`);
  if (orgId) q = q.eq("org_id", orgId);
  const { data } = await q.select("*");
  const rows = (data as TaskRow[]) || [];
  return rows.length === 1 ? rows[0] : null;
}

async function release(id: string, patch: Record<string, unknown> = {}) {
  await db().from("agent_tasks").update({ ...patch, lease_until: null, updated_at: nowIso() }).eq("id", id);
}

/**
 * Advance a task by as many steps as fit in the budget.
 * `orgId` is passed by session-driven callers so a member can only tick their own workspace's tasks.
 */
export async function advanceTask(id: string, opts: { orgId?: string; budgetMs?: number } = {}): Promise<{ status: string; advanced: number }> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 20_000;
  let advanced = 0;
  let task = await claim(id, opts.orgId);
  if (!task) {
    const { data } = await db().from("agent_tasks").select("status").eq("id", id).maybeSingle();
    return { status: String((data as any)?.status || "unknown"), advanced };
  }
  try {
    while (task && Date.now() - started < budget) {
      const outcome = await runNextUnit(task);
      advanced++;
      if (outcome !== "continue") break;
      /* Re-read: the owner may have paused or cancelled while that step ran. */
      const { data } = await db().from("agent_tasks").select("*").eq("id", id).single();
      task = data as TaskRow;
      if (!task || !RUNNABLE.includes(task.status as any)) break;
      await db().from("agent_tasks").update({ lease_until: new Date(Date.now() + LEASE_MS).toISOString() }).eq("id", id);
    }
  } finally {
    await release(id);
  }
  const { data } = await db().from("agent_tasks").select("status").eq("id", id).maybeSingle();
  return { status: String((data as any)?.status || "unknown"), advanced };
}

/** Charge for one model-backed unit, honouring the task's credit ceiling. */
async function chargeUnit(task: TaskRow, mode: string): Promise<{ gate: ChargeResult } | { stop: string }> {
  const cost = creditCost(mode);
  if (task.credits_used + cost > task.credit_ceiling) {
    return { stop: `Reached its credit ceiling of ${task.credit_ceiling} (${task.credits_used} used; the next step costs ${cost}). Resume to allow more.` };
  }
  const gate = await chargeOrgForMode(task.org_id, mode, { userId: task.created_by });
  if (!gate.ok) {
    const why = gate.reason === "insufficient" ? "Not enough credits for the next step. Top up or upgrade, then resume."
      : gate.reason === "lapsed" ? "The plan has lapsed. Renew, then resume."
      : "Credits could not be charged right now. Resume to try again.";
    return { stop: why };
  }
  return { gate };
}

async function markStep(stepId: string, patch: Record<string, unknown>) {
  await db().from("agent_task_steps").update(patch).eq("id", stepId);
}

async function bumpTask(task: TaskRow, patch: Record<string, unknown>) {
  await db().from("agent_tasks").update({ ...patch, updated_at: nowIso() }).eq("id", task.id);
}

async function stepsOf(task: TaskRow): Promise<StepRow[]> {
  const { data } = await db().from("agent_task_steps").select("*").eq("task_id", task.id).order("seq", { ascending: true });
  return (data as StepRow[]) || [];
}

/** Run one unit of work. "continue" when there is more to do now. */
async function runNextUnit(task: TaskRow): Promise<"continue" | "stop"> {
  const steps = await stepsOf(task);
  const lease = Date.now();
  /* A step left 'running' by a runner that died: retry it, up to the limit. */
  const next = steps.find((s) => s.status === "running") ?? steps.find((s) => s.status === "pending");

  if (task.status === "queued") await bumpTask(task, { status: "running", started_at: task.started_at ?? nowIso() });

  if (!next) {
    /* Nothing left: the result is whatever the last answering step produced. */
    await finish(task, steps);
    return "stop";
  }
  if (next.attempts >= MAX_ATTEMPTS) {
    await markStep(next.id, { status: "failed", error: next.error || "Gave up after repeated timeouts.", finished_at: nowIso() });
    await bumpTask(task, { status: "failed", status_reason: `${next.agent_name || "A step"} failed ${MAX_ATTEMPTS} times. Finished steps are kept.`, finished_at: nowIso() });
    return "stop";
  }
  await markStep(next.id, { status: "running", attempts: next.attempts + 1, started_at: next.started_at ?? nowIso() });

  try {
    if (next.kind === "plan") return await runPlanStep(task, next);
    if (next.kind === "agent") return await runSpecialistStep(task, next, steps);
    if (next.kind === "synthesis") return await runSynthesisStep(task, next, steps);
    if (next.kind === "verify") { await runVerifyStep(task, next, steps); return "continue"; }
  } catch (e: any) {
    await markStep(next.id, { status: "pending", error: String(e?.message || e).slice(0, 500) });
    console.error(`[agents] task ${task.id} step ${next.seq} threw after ${Date.now() - lease}ms:`, e?.message);
    return "stop";
  }
  return "stop";
}

async function pauseFor(task: TaskRow, step: StepRow, why: string): Promise<"stop"> {
  await markStep(step.id, { status: "pending", attempts: Math.max(0, step.attempts) });
  await bumpTask(task, { status: "paused", status_reason: why });
  return "stop";
}

/** The workspace context every step sees: its KPIs and what memory knows about the request. */
async function contextFor(task: TaskRow, focus: string): Promise<string> {
  const sb = db();
  let lines: string[] = [];
  try {
    const { data } = await sb.from("health_metrics").select("label, value, unit, delta_pct, status").eq("org_id", task.org_id).limit(25);
    lines = ((data as any[]) || []).map((m) => `- ${m.label}: ${m.value}${m.unit === "INR" ? " INR" : " " + (m.unit || "")}${typeof m.delta_pct === "number" ? ` (${m.delta_pct > 0 ? "+" : ""}${m.delta_pct}%)` : ""}, status ${m.status}`);
  } catch { lines = []; }
  const mem = await recallContext(task.org_id, focus.slice(0, 300), 5).catch(() => "");
  const head = lines.length
    ? `KEY METRICS (computed from the workspace's own data):\n${lines.join("\n")}`
    : "NO KPIs HAVE BEEN COMPUTED FOR THIS WORKSPACE YET. Do not invent figures; use your tools, and say plainly when there is no data.";
  return [head, mem].filter(Boolean).join("\n\n");
}

async function runModel(task: TaskRow, opts: { brief: string; tools: string[]; prompt: string; context: string; profile?: typeof STANDARD }): Promise<{ text: string; calls: AgentToolCall[] }> {
  const calls: AgentToolCall[] = [];
  const userId = task.created_by;
  const scope = {
    orgId: task.org_id, userId, brief: opts.brief,
    declarations: declarationsFor(opts.tools), calls, serviceDb: true,
    run: (name: string, args: any, guard: any) => runAgentTool(name, args, { orgId: task.org_id, userId, trace: calls }, guard),
  };
  const text = await withOrgAiKeys(task.org_id, () => runInAgentScope(scope, () =>
    runCortex([{ role: "user", content: opts.prompt }], opts.context, opts.profile ?? STANDARD, { tools: opts.tools.length > 0, deadlineAt: Date.now() + STEP_BUDGET_MS })));
  return { text, calls };
}

async function runPlanStep(task: TaskRow, step: StepRow): Promise<"continue" | "stop"> {
  const charged = await chargeUnit(task, "agent_plan");
  if ("stop" in charged) return pauseFor(task, step, charged.stop);
  const extra = await workspaceAgents(task.org_id);
  const lead = CORE_AGENTS_BY_ID[task.agent_id || ""] ?? leadOf(task.team);
  const route = routeRequest(task.request, task.team, "team", extra);

  let plan: PlanStep[] | null = null;
  let note = "";
  const { text } = await runModel(task, { brief: lead.brief, tools: [], prompt: planningPrompt(task.request, task.team, extra), context: "", profile: FAST });
  if (isEngineFailure(text)) { await refundIfCharged(charged.gate, "agent_plan"); note = "The planner did not answer, so the standard plan for this request was used (not charged)."; }
  else plan = parsePlan(text, task.team, extra);
  if (!plan) { plan = fallbackPlan(route, task.request); note = note || "The planner's answer was not a usable plan, so the standard plan for this request was used."; }

  const cost = isEngineFailure(text) ? 0 : creditCost("agent_plan");
  const rows = [
    ...plan.map((p, i) => ({ seq: i + 1, kind: "agent", agent_id: p.agent, agent_name: agentById(p.agent, extra)?.name || p.agent, instruction: p.instruction })),
    { seq: plan.length + 1, kind: "synthesis", agent_id: lead.id, agent_name: lead.name, instruction: "Combine the specialists' findings into one answer." },
    { seq: plan.length + 2, kind: "verify", agent_id: null, agent_name: "Veritas v1", instruction: "Check every rupee figure against what the agents read." },
  ].map((r) => ({ ...r, task_id: task.id, org_id: task.org_id }));
  await db().from("agent_task_steps").upsert(rows, { onConflict: "task_id,seq", ignoreDuplicates: true });
  await markStep(step.id, {
    status: "done", credits: cost, finished_at: nowIso(),
    output: `${lead.name} assigned ${plan.length} specialist(s): ${plan.map((p) => agentById(p.agent, extra)?.name || p.agent).join(", ")}.${note ? " " + note : ""}`,
  });
  await bumpTask(task, { plan, credits_used: task.credits_used + cost, status_reason: `${plan.length} specialist(s) working.` });
  return "continue";
}

async function runSpecialistStep(task: TaskRow, step: StepRow, steps: StepRow[]): Promise<"continue" | "stop"> {
  const agent = agentById(step.agent_id || "", await workspaceAgents(task.org_id));
  if (!agent) { await markStep(step.id, { status: "skipped", error: "This agent is not available — it may have been removed or paused in Agent Studio.", finished_at: nowIso() }); return "continue"; }
  const charged = await chargeUnit(task, "agent_step");
  if ("stop" in charged) return pauseFor(task, step, charged.stop);

  const earlier = steps.filter((s) => s.kind === "agent" && s.status === "done" && s.seq < step.seq)
    .map((s) => `- ${s.agent_name}: ${String(s.output || "").slice(0, 1200)}`).join("\n");
  const prompt = `${step.instruction}
${earlier ? `\nWHAT YOUR COLLEAGUES HAVE ALREADY FOUND (do not repeat their lookups):\n${earlier}\n` : ""}
Use your tools to look up what you need — do not answer from memory. Report specific findings: names, amounts, dates. If something needs doing, use propose_action so it waits on the Approvals page, and say that it is waiting. If there is no data, say so plainly.`;
  const { text, calls } = await runModel(task, { brief: agent.brief, tools: agent.tools, prompt, context: await contextFor(task, step.instruction || task.request) });

  if (isEngineFailure(text)) {
    await refundIfCharged(charged.gate, "agent_step");
    await markStep(step.id, { status: "pending", error: text.slice(0, 400), tool_calls: calls });
    await bumpTask(task, { status_reason: `${agent.name} could not reach the AI engine; it will retry (not charged).` });
    return "stop";
  }
  const proposals = calls.filter((c) => c.name === "propose_action" && c.ok).length;
  const cost = creditCost("agent_step");
  await markStep(step.id, { status: "done", output: text.slice(0, 20000), tool_calls: calls, credits: cost, error: null, finished_at: nowIso() });
  await bumpTask(task, { credits_used: task.credits_used + cost, proposals: task.proposals + proposals, status_reason: `${agent.name} finished.` });
  return "continue";
}

async function runSynthesisStep(task: TaskRow, step: StepRow, steps: StepRow[]): Promise<"continue" | "stop"> {
  const findings = steps.filter((s) => s.kind === "agent" && s.status === "done").map((s) => ({ agent: s.agent_id || "", output: s.output || "" }));
  if (!findings.length) {
    await markStep(step.id, { status: "skipped", finished_at: nowIso() });
    return "continue";
  }
  const charged = await chargeUnit(task, "agent_synthesis");
  if ("stop" in charged) return pauseFor(task, step, charged.stop);
  const lead = CORE_AGENTS_BY_ID[step.agent_id || ""] ?? leadOf(task.team);
  const { text } = await runModel(task, { brief: lead.brief, tools: [], prompt: synthesisPrompt(task.request, findings, await workspaceAgents(task.org_id)), context: "" });
  if (isEngineFailure(text)) {
    await refundIfCharged(charged.gate, "agent_synthesis");
    await markStep(step.id, { status: "pending", error: text.slice(0, 400) });
    return "stop";
  }
  const cost = creditCost("agent_synthesis");
  await markStep(step.id, { status: "done", output: text.slice(0, 20000), credits: cost, finished_at: nowIso() });
  await bumpTask(task, { credits_used: task.credits_used + cost, status_reason: `${lead.name} wrote the answer.` });
  return "continue";
}

/** The answer a task gives: the synthesis if there is one, else the last specialist's output. */
function answerOf(steps: StepRow[]): string {
  const synth = steps.find((s) => s.kind === "synthesis" && s.status === "done" && s.output);
  if (synth) return synth.output!;
  const agents = steps.filter((s) => s.kind === "agent" && s.status === "done" && s.output);
  return agents.length ? agents[agents.length - 1].output! : "";
}

async function runVerifyStep(task: TaskRow, step: StepRow, steps: StepRow[]) {
  const answer = answerOf(steps);
  const evidence: unknown[] = [];
  for (const s of steps) for (const c of (s.tool_calls || [])) evidence.push(c.summary, c.sample);
  try {
    const { data } = await db().from("health_metrics").select("label, value").eq("org_id", task.org_id).limit(25);
    evidence.push(data || []);
  } catch { /* no metrics — evidence is the tool calls alone */ }
  const v = verifyAnswer(answer, evidence);
  await markStep(step.id, { status: "done", output: v.note, finished_at: nowIso(), credits: 0 });
  await bumpTask(task, { verification: v });
}

async function finish(task: TaskRow, steps: StepRow[]) {
  const answer = answerOf(steps);
  const failed = !answer;
  await bumpTask(task, {
    status: failed ? "failed" : "done", finished_at: nowIso(), result: answer || null,
    status_reason: failed ? "No agent produced an answer." : task.proposals ? `Done. ${task.proposals} action(s) are waiting for you on Approvals.` : "Done.",
  });
  if (task.schedule_id) {
    await db().from("agent_schedules").update({ last_task_id: task.id }).eq("id", task.schedule_id);
  }
}

/* ============================================================== sweeper */

/**
 * Advance background tasks across every workspace, within a time budget.
 * Called by /api/cron/agents. Tasks whose plan does not include background
 * running are left for the owner's open Workspace to advance.
 */
export async function sweep(budgetMs = 45_000): Promise<{ scanned: number; advanced: number; scheduled: number }> {
  const sb = db(); if (!sb) return { scanned: 0, advanced: 0, scheduled: 0 };
  const started = Date.now();
  const scheduled = await startDueSchedules().catch(() => 0);
  const now = nowIso();
  const { data } = await sb.from("agent_tasks").select("id")
    .in("status", ["queued", "running"]).eq("background", true)
    .or(`lease_until.is.null,lease_until.lt.${now}`)
    .order("updated_at", { ascending: true }).limit(12);
  const ids = ((data as any[]) || []).map((r) => r.id);
  let advanced = 0;
  /* Four at a time: tasks are independent, and one slow model call must not starve the rest. */
  for (let i = 0; i < ids.length && Date.now() - started < budgetMs - 5_000; i += 4) {
    const left = budgetMs - (Date.now() - started);
    const batch = ids.slice(i, i + 4);
    const outs = await Promise.all(batch.map((id) => advanceTask(id, { budgetMs: Math.max(5_000, left - 8_000) }).catch(() => ({ advanced: 0 }))));
    advanced += outs.reduce((n, o) => n + (o.advanced || 0), 0);
  }
  return { scanned: ids.length, advanced, scheduled };
}

/* ============================================================== schedules */

export type ScheduleRow = {
  id: string; org_id: string; created_by: string | null; title: string; request: string; team: TeamId; mode: "single" | "team";
  cadence: Cadence; hour_ist: number; weekday: number; monthday: number; enabled: boolean;
  next_run_at: string; last_run_at: string | null; last_task_id: string | null; created_at: string;
};

export async function listSchedules(orgId: string): Promise<ScheduleRow[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("agent_schedules").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(100);
  return (data as ScheduleRow[]) || [];
}

export async function createSchedule(input: {
  orgId: string; userId: string | null; request: string; team?: TeamId | "auto"; mode?: "single" | "team";
  cadence: Cadence; hourIst: number; weekday?: number; monthday?: number;
}): Promise<Result<ScheduleRow>> {
  const sb = db(); if (!sb) return { ok: false, error: "The database is not configured." };
  const limits = agentLimits(await planOf(input.orgId));
  if (limits.schedules <= 0) return { ok: false, code: "limit", error: "Scheduled agents are not included in your plan. Upgrade to run agents on a schedule." };
  const { count } = await sb.from("agent_schedules").select("id", { count: "exact", head: true }).eq("org_id", input.orgId);
  if ((count ?? 0) >= limits.schedules) return { ok: false, code: "limit", error: `Your plan includes ${limits.schedules} scheduled agent task(s), and they are all in use.` };
  const request = String(input.request || "").trim().slice(0, 2000);
  if (request.length < 4) return { ok: false, error: "Say what the agents should do each time." };
  const route = routeRequest(request, input.team ?? "auto", input.mode, await workspaceAgents(input.orgId));
  const row = {
    org_id: input.orgId, created_by: input.userId, title: titleFrom(request), request, team: route.team, mode: route.mode,
    cadence: input.cadence, hour_ist: clampInt(input.hourIst, 0, 23, 9), weekday: clampInt(input.weekday, 0, 6, 1), monthday: clampInt(input.monthday, 1, 28, 1),
  };
  const next = nextRunAt({ cadence: row.cadence, hourIst: row.hour_ist, weekday: row.weekday, monthday: row.monthday });
  const { data, error } = await sb.from("agent_schedules").insert({ ...row, next_run_at: next.toISOString() }).select("*").single();
  if (error || !data) return { ok: false, error: error?.message || "Could not save the schedule." };
  return { ok: true, data: data as ScheduleRow };
}

export async function updateSchedule(orgId: string, id: string, action: "pause" | "resume" | "delete"): Promise<Result<null>> {
  const sb = db(); if (!sb) return { ok: false, error: "The database is not configured." };
  if (action === "delete") {
    const { error } = await sb.from("agent_schedules").delete().eq("id", id).eq("org_id", orgId);
    return error ? { ok: false, error: error.message } : { ok: true, data: null };
  }
  const { data: s } = await sb.from("agent_schedules").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (!s) return { ok: false, error: "No such schedule." };
  const patch: Record<string, unknown> = { enabled: action === "resume" };
  if (action === "resume") patch.next_run_at = nextRunAt({ cadence: s.cadence, hourIst: s.hour_ist, weekday: s.weekday, monthday: s.monthday }).toISOString();
  const { error } = await sb.from("agent_schedules").update(patch).eq("id", id).eq("org_id", orgId);
  return error ? { ok: false, error: error.message } : { ok: true, data: null };
}

function clampInt(n: unknown, lo: number, hi: number, d: number): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
}

/** Create a task for every schedule that is due, and move each schedule on. Claims before creating. */
export async function startDueSchedules(): Promise<number> {
  const sb = db(); if (!sb) return 0;
  const now = nowIso();
  const { data } = await sb.from("agent_schedules").select("*").eq("enabled", true).lte("next_run_at", now).limit(20);
  let started = 0;
  for (const s of ((data as ScheduleRow[]) || [])) {
    const next = nextRunAt({ cadence: s.cadence, hourIst: s.hour_ist, weekday: s.weekday, monthday: s.monthday }, new Date(Date.now() + 60_000));
    /* Claim: move next_run_at on only if nobody else has. The row count is the truth. */
    const { data: claimed } = await sb.from("agent_schedules").update({ next_run_at: next.toISOString(), last_run_at: now })
      .eq("id", s.id).eq("next_run_at", s.next_run_at).select("id");
    if (!claimed || (claimed as any[]).length !== 1) continue;
    const r = await createTask({ orgId: s.org_id, userId: s.created_by, request: s.request, team: s.team, mode: s.mode, scheduleId: s.id, title: `${s.title} (scheduled)` });
    if (r.ok) started++;
  }
  return started;
}

/** For the Workspace header: what this plan allows and what is in use. */
export async function usageFor(orgId: string) {
  const sb = db();
  const plan = await planOf(orgId);
  const limits = agentLimits(plan);
  let active = 0, schedules = 0;
  if (sb) {
    const a = await sb.from("agent_tasks").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", ["queued", "running"]);
    active = a.count ?? 0;
    const s = await sb.from("agent_schedules").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    schedules = s.count ?? 0;
  }
  return { plan, limits, active, schedules };
}
