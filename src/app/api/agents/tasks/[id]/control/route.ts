import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { controlTask } from "@/lib/agents/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/* POST /api/agents/tasks/:id/control — { action: "pause" | "resume" | "cancel" }. Analyst and above. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Controlling agent tasks needs the analyst role or higher." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const action = String(b.action || "");
  if (!["pause", "resume", "cancel"].includes(action)) return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  const r = await controlTask(orgId, String(params.id || ""), action as "pause" | "resume" | "cancel");
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, task: r.data });
}
