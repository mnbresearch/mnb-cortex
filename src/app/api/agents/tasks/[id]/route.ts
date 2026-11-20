import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { getTask } from "@/lib/agents/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/* GET /api/agents/tasks/:id — the task and every step, scoped to the signed-in workspace. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  const found = await getTask(orgId, String(params.id || ""));
  if (!found) return NextResponse.json({ ok: false, error: "No such task in this workspace." }, { status: 404 });
  return NextResponse.json({ ok: true, ...found });
}
