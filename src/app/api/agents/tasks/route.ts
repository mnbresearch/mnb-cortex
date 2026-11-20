import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { createTask, listTasks, agentTablesReady, usageFor, SETUP_MESSAGE } from "@/lib/agents/tasks";
import type { TeamId } from "@/lib/agents/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
  GET  /api/agents/tasks — this workspace's recent tasks, plus plan usage.
  POST /api/agents/tasks — delegate work: { request, team?, mode?, agentId? }.

  Creating a task spends nothing by itself; each step is charged as it runs
  (lib/agents/tasks.ts). Analyst and above, like every other action that can
  lead to proposals. Viewers can read tasks but not start them.
*/
const TEAMS = new Set(["finance", "operations", "growth", "auto"]);

export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await agentTablesReady())) return NextResponse.json({ ok: false, setup: true, error: SETUP_MESSAGE });
  const [tasks, usage] = await Promise.all([listTasks(orgId, 40), usageFor(orgId)]);
  return NextResponse.json({ ok: true, tasks, usage });
}

export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Delegating to agents needs the analyst role or higher." }, { status: 403 });
  if (!(await agentTablesReady())) return NextResponse.json({ ok: false, setup: true, error: SETUP_MESSAGE });
  const b = await req.json().catch(() => ({} as any));
  const team = TEAMS.has(String(b.team)) ? (String(b.team) as TeamId | "auto") : "auto";
  const mode = b.mode === "single" || b.mode === "team" ? b.mode : "auto";
  const r = await createTask({
    orgId, userId: user.id, request: String(b.request || ""), team, mode,
    agentId: b.agentId ? String(b.agentId).slice(0, 40) : null,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, code: r.code }, { status: r.code === "limit" ? 429 : 400 });
  return NextResponse.json({ ok: true, task: r.data });
}
