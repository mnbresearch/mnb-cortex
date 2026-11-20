import { apiAuth, apiError, apiOk } from "@/lib/api/auth";
import { createTask, getTask, listTasks, advanceTask, agentTablesReady } from "@/lib/agents/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  /api/v1/agents/tasks — the Agent Workspace over the API (scope agents:run).

    POST { request, team?: finance|operations|growth, mode?: single|team }
         Creates a task and works on it for up to ~40 seconds before replying,
         so short tasks come back finished. Longer ones keep running in the
         background; poll GET ?id=.
    GET  ?id=<task id>   one task with its steps
    GET                  the workspace's recent tasks

  A key has no person behind it, so agents started this way can look things
  up but cannot propose actions (propose_action needs a signed-in analyst).
  Steps are charged in credits exactly as in the app.
*/
const TEAMS = new Set(["finance", "operations", "growth"]);

export async function GET(req: Request) {
  const auth = await apiAuth(req, "agents:run", "read", "/api/v1/agents/tasks");
  if (!auth.ok) return auth.res;
  const { ctx } = auth;
  if (!(await agentTablesReady())) return apiError(ctx.rid, 503, "not_configured", "The Agent Workspace has not been set up in this deployment.");
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const found = await getTask(ctx.orgId, id.slice(0, 64));
    if (!found) return apiError(ctx.rid, 400, "bad_request", "No such task in this workspace.");
    return apiOk(ctx.rid, { task: publicTask(found.task), steps: found.steps.map(publicStep) });
  }
  const tasks = await listTasks(ctx.orgId, 50);
  return apiOk(ctx.rid, { data: tasks.map(publicTask) });
}

export async function POST(req: Request) {
  const auth = await apiAuth(req, "agents:run", "write", "/api/v1/agents/tasks");
  if (!auth.ok) return auth.res;
  const { ctx } = auth;
  if (!(await agentTablesReady())) return apiError(ctx.rid, 503, "not_configured", "The Agent Workspace has not been set up in this deployment.");
  let body: any = {};
  try { body = await req.json(); } catch { return apiError(ctx.rid, 400, "bad_request", "Body is not valid JSON."); }
  const request = String(body?.request ?? "");
  if (request.length > 4000) return apiError(ctx.rid, 413, "payload_too_large", "Requests are limited to 4,000 characters. Nothing was charged.");
  const r = await createTask({
    orgId: ctx.orgId, userId: null, request,
    team: TEAMS.has(String(body?.team)) ? body.team : "auto",
    mode: body?.mode === "single" || body?.mode === "team" ? body.mode : "auto",
  });
  if (!r.ok) return apiError(ctx.rid, r.code === "limit" ? 429 : 400, r.code === "limit" ? "rate_limited" : "bad_request", r.error);
  await advanceTask(r.data.id, { orgId: ctx.orgId, budgetMs: 40_000 }).catch(() => null);
  const found = await getTask(ctx.orgId, r.data.id);
  return apiOk(ctx.rid, { task: publicTask(found?.task ?? r.data), steps: (found?.steps ?? []).map(publicStep) });
}

/* What the API returns: no lease, no internal ids beyond the task's own. */
function publicTask(t: any) {
  return {
    id: t.id, title: t.title, request: t.request, team: t.team, mode: t.mode, agent: t.agent_id, status: t.status,
    status_reason: t.status_reason, result: t.result, verification: t.verification, credits_used: t.credits_used,
    credit_ceiling: t.credit_ceiling, created_at: t.created_at, finished_at: t.finished_at,
  };
}
function publicStep(s: any) {
  return {
    seq: s.seq, kind: s.kind, agent: s.agent_name, status: s.status, output: s.output, credits: s.credits,
    lookups: (s.tool_calls || []).map((c: any) => ({ tool: c.name, ok: c.ok, summary: c.summary })),
  };
}
