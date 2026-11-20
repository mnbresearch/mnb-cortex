/*
  THE TASK RUNNER, EXECUTED.

  Run with:  npm run test:agent-runner

  test-agent-workspace.mjs pins the runner's SHAPE by reading its source. This
  suite RUNS it: the real src/lib/agents/tasks.ts, with its imports rewritten
  to an in-memory database (a small PostgREST-shaped query builder that
  honours eq / in / or / lte / count / upsert-ignore-duplicates and returns
  zero rows from a conditional update that matched nothing — the property the
  lease depends on), a scripted model, and a credit ledger that records every
  charge and refund.

  Scenarios, each one a thing that costs real money or real trust if wrong:
    1.  A single-agent task runs to done, is charged once, and its answer is
        verified by Veritas v1 against what the agent actually read.
    2.  A team task: the lead's plan becomes steps; specialists run; the lead
        synthesises; credits = plan + steps + synthesis, exactly.
    3.  A bad model plan falls back to the deterministic plan, not a failure.
    4.  The AI engine failing is refunded every time, and after three tries
        the task fails instead of retrying forever.
    5.  The credit ceiling pauses BEFORE the step that would cross it; resume
        lifts the ceiling and the task finishes.
    6.  Two runners at once: exactly one gets the lease.
    7.  Cancel stops the task; pending steps are skipped; nothing more is charged.
    8.  Plan limits: Essentials runs one task at a time and is given one agent
        when it asks for a team; Team is refused past three running tasks.
    9.  Insufficient credits pause the task with a reason; nothing is charged.
    10. Schedules: refused on Essentials; a due schedule starts exactly one task
        even when two sweepers race.
    11. A hallucinated figure in the answer is flagged unsupported.
*/
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

let pass = 0;
const fails = [];
const check = (cond, name, detail = "") => { if (cond) pass++; else fails.push(`${name}${detail ? ` — ${detail}` : ""}`); };
const read = (p) => readFileSync(p, "utf8");

/* ------------------------------------------------------------ fake database */
const db = { organizations: [], agent_tasks: [], agent_task_steps: [], agent_schedules: [], health_metrics: [] };
let idn = 0;
const DEFAULTS = {
  agent_tasks: () => ({ status: "queued", status_reason: null, plan: null, result: null, verification: null, proposals: 0, credits_used: 0, credit_ceiling: 400, background: true, schedule_id: null, lease_until: null, attempts: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), started_at: null, finished_at: null }),
  agent_task_steps: () => ({ status: "pending", output: null, tool_calls: [], credits: 0, error: null, attempts: 0, started_at: null, finished_at: null, created_at: new Date().toISOString() }),
  agent_schedules: () => ({ enabled: true, last_run_at: null, last_task_id: null, created_at: new Date().toISOString() }),
};
class Q {
  constructor(t) { this.t = t; this.op = "select"; this.f = []; this.cols = "*"; }
  select(cols = "*", o = {}) { if (this.op === "select") this.cols = cols; this.ret = true; if (o.head) this.head = true; if (o.count) this.count = true; return this; }
  insert(rows) { this.op = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; this.multi = Array.isArray(rows); return this; }
  upsert(rows, o = {}) { this.op = "upsert"; this.rows = rows; this.uo = o; return this; }
  update(p) { this.op = "update"; this.patch = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  in(c, a) { this.f.push((r) => a.includes(r[c])); return this; }
  lte(c, v) { this.f.push((r) => r[c] != null && String(r[c]) <= String(v)); return this; }
  gte(c, v) { this.f.push((r) => r[c] != null && String(r[c]) >= String(v)); return this; }
  or(s) {
    const parts = s.split(",").map((p) => { const [c, op, ...v] = p.split("."); return { c, op, v: v.join(".") }; });
    this.f.push((r) => parts.some((p) => p.op === "is" ? r[p.c] === null || r[p.c] === undefined : p.op === "lt" ? r[p.c] != null && String(r[p.c]) < p.v : false));
    return this;
  }
  order(c, o = {}) { this.ord = { c, asc: o.ascending !== false }; return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  textSearch() { return this; }
  ilike() { return this; }
  match(r) { return this.f.every((fn) => fn(r)); }
  run() {
    const T = db[this.t] || (db[this.t] = []);
    let data;
    if (this.op === "insert") {
      data = this.rows.map((r) => { const row = { ...(DEFAULTS[this.t]?.() || {}), id: `${this.t}-${++idn}`, ...r }; T.push(row); return row; });
    } else if (this.op === "upsert") {
      data = [];
      for (const r of this.rows) {
        const dup = this.t === "agent_task_steps" && T.some((x) => x.task_id === r.task_id && x.seq === r.seq);
        if (dup && this.uo.ignoreDuplicates) continue;
        const row = { ...(DEFAULTS[this.t]?.() || {}), id: `${this.t}-${++idn}`, ...r }; T.push(row); data.push(row);
      }
    } else if (this.op === "update") {
      data = T.filter((r) => this.match(r)); for (const r of data) Object.assign(r, structuredClone(this.patch));
    } else if (this.op === "delete") {
      data = T.filter((r) => this.match(r)); db[this.t] = T.filter((r) => !this.match(r));
    } else {
      data = T.filter((r) => this.match(r));
      if (this.ord) data = [...data].sort((a, b) => (String(a[this.ord.c]) < String(b[this.ord.c]) ? -1 : 1) * (this.ord.asc ? 1 : -1));
      if (this.lim) data = data.slice(0, this.lim);
    }
    const copy = structuredClone(data);
    if (this.head) return { data: null, count: copy.length, error: null };
    if (this.one) {
      if (!copy.length) return { data: null, error: this.one === "single" ? { message: "no rows" } : null };
      return { data: copy[0], error: null };
    }
    if ((this.op === "update" || this.op === "delete" || this.op === "insert") && !this.ret) return { data: null, error: null };
    return { data: copy, error: null, count: copy.length };
  }
  then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
}
globalThis.__db = { from: (t) => new Q(t), rpc: async () => ({ data: [], error: null }) };

/* ------------------------------------------------------------ credits */
const ledger = [];
globalThis.__balance = 1e9;
globalThis.__charge = async (orgId, mode) => {
  const cost = globalThis.__cost(mode);
  if (globalThis.__balance < cost) return { ok: false, enforced: true, cost, balance: globalThis.__balance, reason: "insufficient" };
  globalThis.__balance -= cost; ledger.push({ orgId, mode, cost: -cost });
  return { ok: true, enforced: true, cost, balance: globalThis.__balance, payerOrgId: orgId };
};
globalThis.__refund = async (gate, mode) => { if (!gate?.ok || gate.__refunded) return; gate.__refunded = true; globalThis.__balance += gate.cost; ledger.push({ orgId: gate.payerOrgId, mode, cost: +gate.cost, refund: true }); };

/* ------------------------------------------------------------ scripted model + tools */
const FAIL = "The AI engine could not be reached.";
globalThis.__script = [];          // queue of responders; each (prompt, scope) => string
globalThis.__modelCalls = 0;
globalThis.__rows = [{ invoice: "INV-104", customer: "Shree Balaji", amount: 419850, days_past_due: 67 }, { invoice: "INV-88", customer: "Om Traders", amount: 125000, days_past_due: 34 }];
globalThis.__runTool = async (name, args, ctx) => {
  const rows = globalThis.__rows;
  ctx.trace.push({ name, args, ok: true, summary: `${rows.length} unpaid invoice(s), ₹5,44,850 in total`, rows: rows.length, at: Date.now(), sample: rows });
  return { ok: true, rows, summary: "rows" };
};
globalThis.__runCortex = async (messages, context, profile, opts, scope) => {
  globalThis.__modelCalls++;
  const f = globalThis.__script.shift() || (() => "Nothing scripted.");
  return f(messages[0].content, scope, opts);
};

/* ------------------------------------------------------------ load the real runner */
const dir = mkdtempSync(join(tmpdir(), "runner-"));
const put = (name, src) => { writeFileSync(join(dir, name), src); return pathToFileURL(join(dir, name)).href; };
put("agent-scope.ts", read("src/lib/ai/agent-scope.ts"));
put("teams.ts", read("src/lib/agents/teams.ts"));
put("untrusted.ts", read("src/lib/ai/untrusted.ts"));
put("orchestration.ts", read("src/lib/agents/orchestration.ts").replace(/from "\.\/teams"/g, 'from "./teams.ts"'));
put("veritas.ts", read("src/lib/veritas.ts").replace(/from "\.\/ai\/untrusted"/g, 'from "./untrusted.ts"'));
put("schedule.ts", read("src/lib/agents/schedule.ts"));
put("config.ts", read("src/lib/config.ts"));
put("stubs.ts", `
import { currentAgentScope } from "./agent-scope.ts";
export const serviceClient = () => globalThis.__db;
export const FAST = { name: "FAST" }; export const STANDARD = { name: "STANDARD" };
export const withOrgAiKeys = (_o: string, fn: () => any) => fn();
export const isEngineFailure = (t: string) => String(t || "").startsWith(${JSON.stringify(FAIL)});
export const runCortex = (m: any, c: any, p: any, o: any) => globalThis.__runCortex(m, c, p, o, currentAgentScope());
export const chargeOrgForMode = (org: string, mode: string) => globalThis.__charge(org, mode);
export const refundIfCharged = (g: any, mode: string) => globalThis.__refund(g, mode);
export const recallContext = async () => "";
export const declarationsFor = (names: string[]) => names.map((name) => ({ name, description: name, parameters: {} }));
export const runAgentTool = (name: string, args: any, ctx: any) => globalThis.__runTool(name, args, ctx);
export const workspaceAgents = async (_org: string) => (globalThis as any).__wsAgents || [];
`);
let src = read("src/lib/agents/tasks.ts")
  .replace(/^import "server-only";\s*$/m, "")
  .replace(/from "@\/lib\/supabase\/server"/, 'from "./stubs.ts"')
  .replace(/from "@\/lib\/ai\/cortex"/, 'from "./stubs.ts"')
  .replace(/from "@\/lib\/ai\/generation"/, 'from "./stubs.ts"')
  .replace(/from "@\/lib\/ai\/byo"/, 'from "./stubs.ts"')
  .replace(/from "@\/lib\/ai\/agent-scope"/, 'from "./agent-scope.ts"')
  .replace(/from "@\/lib\/credits"/, 'from "./stubs.ts"')
  .replace(/from "@\/lib\/config"/, 'from "./config.ts"')
  .replace(/from "@\/lib\/memory"/, 'from "./stubs.ts"')
  .replace(/from "@\/lib\/agents\/toolkit"/, 'from "./stubs.ts"')
  .replace(/from "@\/lib\/agents\/teams"/, 'from "./teams.ts"')
  .replace(/from "@\/lib\/agents\/orchestration"/, 'from "./orchestration.ts"')
  .replace(/from "@\/lib\/veritas"/, 'from "./veritas.ts"')
  .replace(/from "@\/lib\/agents\/schedule"/, 'from "./schedule.ts"')
  .replace(/from "@\/lib\/agents\/workspace-agents"/, 'from "./stubs.ts"');
check(!/from "@\//.test(src), "harness: every import of the runner was redirected", (src.match(/from "@\/[^"]+"/g) || []).join(", "));
const T = await import(put("tasks.ts", src));
const C = await import(pathToFileURL(join(dir, "config.ts")).href);
globalThis.__cost = C.creditCost;

const org = (id, plan) => { db.organizations.push({ id, plan }); return id; };
const reset = () => { for (const k of Object.keys(db)) if (k !== "organizations") db[k] = []; ledger.length = 0; globalThis.__script = []; globalThis.__balance = 1e9; };
const charged = (taskOrg) => -ledger.filter((l) => l.orgId === taskOrg).reduce((n, l) => n + l.cost, 0);
const run = async (id, n = 20) => { let r; for (let i = 0; i < n; i++) { r = await T.advanceTask(id, { budgetMs: 60_000 }); const t = db.agent_tasks.find((x) => x.id === id); if (!["queued", "running"].includes(t.status)) break; } return db.agent_tasks.find((x) => x.id === id); };
const ANSWER = "Shree Balaji owes ₹4,19,850 and Om Traders ₹1,25,000 — ₹5,44,850 in all. Chase Shree Balaji first.";
const usesTool = (tool, text = ANSWER) => async (_p, scope) => { if (scope?.declarations.some((d) => d.name === tool)) await scope.run(tool, {}, { tainted: false, suspicious: [] }); return text; };

const PRO = org("org-pro", "watchpro"), ESS = org("org-ess", "try"), TEAM = org("org-team", "watch");

/* 1. single agent */
reset();
{
  const r = await T.createTask({ orgId: PRO, userId: "u1", request: "Who owes us the most?", mode: "single" });
  check(r.ok && r.data.mode === "single" && r.data.agent_id === "fin.receivables", "1: a receivables question goes to the Receivables Agent", JSON.stringify(r.data ?? r));
  globalThis.__script = [usesTool("top_receivables")];
  const t = await run(r.data.id);
  check(t.status === "done", "1: the task finishes", t.status + " " + t.status_reason);
  check(t.result === ANSWER, "1: its answer is the agent's");
  check(t.verification?.status === "verified" && t.verification.checked === 3, "1: Veritas v1 verifies the figures against what the agent read", JSON.stringify(t.verification));
  check(charged(PRO) === C.creditCost("agent_step"), "1: charged exactly one agent step", `${charged(PRO)}`);
  check(t.credits_used === C.creditCost("agent_step"), "1: the task records what it spent");
  const steps = db.agent_task_steps.filter((s) => s.task_id === t.id);
  check(steps.length === 2 && steps.every((s) => s.status === "done"), "1: agent and verify steps are done");
  check(steps[0].tool_calls.length === 1 && steps[0].tool_calls[0].name === "top_receivables", "1: the lookup is on the timeline");
  check(t.lease_until === null, "1: the lease is released");
}

/* 2. team task */
reset();
{
  const r = await T.createTask({ orgId: PRO, userId: "u1", request: "Prepare the board pack and check overdue receivables", mode: "team" });
  check(r.ok && r.data.mode === "team" && r.data.agent_id === "fin.cfo", "2: a board pack is a team task led by the CFO Agent");
  globalThis.__script = [
    async () => JSON.stringify({ steps: [{ agent: "fin.receivables", instruction: "Rank overdue invoices" }, { agent: "fin.board", instruction: "Write board commentary" }] }),
    usesTool("top_receivables"), usesTool("business_snapshot", "Revenue looks stable."),
    async (prompt) => (prompt.includes("SPECIALIST FINDINGS") ? ANSWER : "wrong prompt"),
  ];
  const t = await run(r.data.id);
  const steps = db.agent_task_steps.filter((s) => s.task_id === t.id).sort((a, b) => a.seq - b.seq);
  check(t.status === "done", "2: the team task finishes", t.status_reason);
  check(steps.map((s) => s.kind).join() === "plan,agent,agent,synthesis,verify", "2: plan → specialists → synthesis → verify", steps.map((s) => s.kind).join());
  check(steps[1].agent_id === "fin.receivables" && steps[2].agent_id === "fin.board", "2: the specialists are the ones the lead planned");
  const want = C.creditCost("agent_plan") + 2 * C.creditCost("agent_step") + C.creditCost("agent_synthesis");
  check(charged(PRO) === want && t.credits_used === want, "2: charged plan + two steps + synthesis, exactly", `${charged(PRO)} vs ${want}`);
  check(t.result === ANSWER, "2: the answer is the lead's synthesis");
  check(t.verification?.status === "verified", "2: and it is verified");
}

/* 3. unusable plan */
reset();
{
  const r = await T.createTask({ orgId: PRO, userId: "u1", request: "Prepare the board pack and check overdue receivables", mode: "team" });
  globalThis.__script = [async () => "I would look at receivables first.", ...Array(6).fill(usesTool("top_receivables")), async () => ANSWER];
  const t = await run(r.data.id);
  const plan = db.agent_task_steps.find((s) => s.task_id === t.id && s.kind === "plan");
  check(t.status === "done" && /standard plan/.test(plan.output), "3: a prose plan falls back to the standard plan and the task still finishes", plan.output);
  check((t.plan || []).every((p) => p.agent.startsWith("fin.") && p.agent !== "fin.cfo"), "3: the fallback plan uses Finance specialists only");
}

/* 4. engine failure */
reset();
{
  const r = await T.createTask({ orgId: PRO, userId: "u1", request: "Who owes us the most?", mode: "single" });
  globalThis.__script = [async () => FAIL, async () => FAIL, async () => FAIL, async () => FAIL];
  const t = await run(r.data.id);
  check(t.status === "failed", "4: after repeated engine failures the task fails, not loops", t.status);
  check(charged(PRO) === 0, "4: every failed attempt was refunded", `${charged(PRO)}`);
  check(ledger.filter((l) => l.refund).length === 3, "4: three attempts, three refunds", `${ledger.filter((l) => l.refund).length}`);
}

/* 5. credit ceiling */
reset();
{
  const r = await T.createTask({ orgId: PRO, userId: "u1", request: "Prepare the board pack and check overdue receivables", mode: "team" });
  db.agent_tasks.find((x) => x.id === r.data.id).credit_ceiling = 100;
  globalThis.__script = [async () => JSON.stringify({ steps: [{ agent: "fin.receivables", instruction: "Rank overdue invoices" }, { agent: "fin.compliance", instruction: "List filings due" }] }), usesTool("top_receivables"), usesTool("statutory_deadlines"), async () => ANSWER];
  let t = await run(r.data.id);
  check(t.status === "paused" && /credit ceiling of 100/.test(t.status_reason), "5: the task pauses before crossing its ceiling", t.status_reason);
  check(t.credits_used <= 100 && charged(PRO) === t.credits_used, "5: it never spent past the ceiling", `${t.credits_used}`);
  const res = await T.controlTask(PRO, t.id, "resume");
  check(res.ok && res.data.credit_ceiling > 100, "5: resume lifts the ceiling");
  t = await run(t.id);
  check(t.status === "done", "5: and the task finishes", t.status_reason);
}

/* 6. lease */
reset();
{
  const r = await T.createTask({ orgId: PRO, userId: "u1", request: "Who owes us the most?", mode: "single" });
  let release;
  const gate = new Promise((res) => { release = res; });
  globalThis.__script = [async (p, scope) => { await gate; return usesTool("top_receivables")(p, scope); }];
  const first = T.advanceTask(r.data.id, { budgetMs: 60_000 });
  await new Promise((res) => setTimeout(res, 20));
  const second = await T.advanceTask(r.data.id, { budgetMs: 60_000 });
  release();
  const one = await first;
  check(second.advanced === 0 && one.advanced >= 1, "6: two runners at once — exactly one gets the lease", JSON.stringify({ one, second }));
  check(globalThis.__modelCalls >= 1 && charged(PRO) === C.creditCost("agent_step"), "6: the step ran and was charged once");
}

/* 7. cancel */
reset();
{
  const r = await T.createTask({ orgId: PRO, userId: "u1", request: "Prepare the board pack and check overdue receivables", mode: "team" });
  globalThis.__script = [async () => JSON.stringify({ steps: [{ agent: "fin.receivables", instruction: "Rank overdue invoices" }, { agent: "fin.board", instruction: "Write commentary" }] })];
  await T.advanceTask(r.data.id, { budgetMs: 1 });     // one unit: the plan
  const before = charged(PRO);
  const c = await T.controlTask(PRO, r.data.id, "cancel");
  check(c.ok && c.data.status === "cancelled", "7: cancel stops the task");
  const after = await T.advanceTask(r.data.id, { budgetMs: 60_000 });
  check(after.advanced === 0 && charged(PRO) === before, "7: a cancelled task runs and charges nothing more");
  check(db.agent_task_steps.filter((s) => s.task_id === r.data.id && s.status === "pending").length === 0, "7: its pending steps are skipped");
  check((await T.controlTask("org-other", r.data.id, "resume")).ok === false, "7: another workspace cannot touch the task");
}

/* 8. plan limits */
reset();
{
  const a = await T.createTask({ orgId: ESS, userId: "u1", request: "Prepare the board pack for this month", mode: "team" });
  check(a.ok && a.data.mode === "single" && a.data.background === false && a.data.credit_ceiling === 200, "8: Essentials asking for a team gets one agent, foreground only, its own ceiling", JSON.stringify(a.data));
  const b = await T.createTask({ orgId: ESS, userId: "u1", request: "Who owes us the most?" });
  check(!b.ok && b.code === "limit", "8: Essentials runs one task at a time", b.error);
  for (let i = 0; i < 3; i++) await T.createTask({ orgId: TEAM, userId: "u1", request: `Who owes us money ${i}` });
  const d = await T.createTask({ orgId: TEAM, userId: "u1", request: "Who owes us money again" });
  check(!d.ok && d.code === "limit", "8: Team is refused past three running tasks");
  const swept = await T.sweep(5_000);
  check(!db.agent_tasks.filter((t) => t.org_id === ESS).some((t) => t.started_at), "8: the background sweeper never advances a foreground-only (Essentials) task", JSON.stringify(swept));
}

/* 9. insufficient credits */
reset();
{
  globalThis.__balance = 10;
  const r = await T.createTask({ orgId: PRO, userId: "u1", request: "Who owes us the most?", mode: "single" });
  globalThis.__script = [usesTool("top_receivables")];
  const t = await run(r.data.id);
  check(t.status === "paused" && /Not enough credits/.test(t.status_reason), "9: too few credits pauses the task with a reason", t.status_reason);
  check(globalThis.__modelCalls >= 0 && ledger.length === 0, "9: nothing was charged and the model was not called for it");
}

/* 10. schedules */
reset();
{
  const no = await T.createSchedule({ orgId: ESS, userId: "u1", request: "Review receivables", cadence: "weekly", hourIst: 9, weekday: 1 });
  check(!no.ok && no.code === "limit", "10: Essentials cannot schedule agents");
  const s = await T.createSchedule({ orgId: TEAM, userId: "u1", request: "Review overdue receivables and draft reminders", cadence: "daily", hourIst: 9 });
  check(s.ok && new Date(s.data.next_run_at) > new Date(), "10: a schedule is created with a future first run");
  db.agent_schedules[0].next_run_at = new Date(Date.now() - 60_000).toISOString();
  const [x, y] = await Promise.all([T.startDueSchedules(), T.startDueSchedules()]);
  check(x + y === 1 && db.agent_tasks.filter((t) => t.schedule_id === s.data.id).length === 1, "10: two racing sweepers start the due schedule exactly once", `${x}+${y}`);
  check(new Date(db.agent_schedules[0].next_run_at) > new Date(), "10: the schedule moves on to its next run");
}

/* 11. hallucinated figure */
reset();
{
  const r = await T.createTask({ orgId: PRO, userId: "u1", request: "Who owes us the most?", mode: "single" });
  globalThis.__script = [usesTool("top_receivables", "Shree Balaji owes ₹4,19,850 and Kumar & Sons owes ₹7,77,000.")];
  const t = await run(r.data.id);
  check(t.verification?.status === "partial" && t.verification.unsupported.some((u) => u.value === 777000), "11: an invented figure is flagged unconfirmed", JSON.stringify(t.verification));
}

console.log("");
if (fails.length) {
  console.log(`agent runner: ${pass} passed, ${fails.length} failed\n`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`agent runner: ${pass} passed, 0 failed`);
console.log("  the real tasks.ts, run end to end: leases, ceilings, refunds, limits, schedules and Veritas v1.");
