import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { advanceTask, getTask } from "@/lib/agents/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/*
  POST /api/agents/tasks/:id/tick — advance a task while the owner watches.

  The open Workspace page calls this in a loop. It claims the task's lease,
  runs as many steps as fit in ~50 seconds, and returns the fresh task. Safe
  to call while the background sweeper is also running: only one runner holds
  the lease, and the other simply gets the current state back.

  Scoped by the session's workspace — a member can only advance their own
  workspace's tasks. Ticking costs nothing; the steps it runs are charged.
*/
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  const id = String(params.id || "");
  const r = await advanceTask(id, { orgId, budgetMs: 50_000 });
  const found = await getTask(orgId, id);
  if (!found) return NextResponse.json({ ok: false, error: "No such task in this workspace." }, { status: 404 });
  return NextResponse.json({ ok: true, advanced: r.advanced, ...found });
}
