import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { createSchedule, listSchedules, updateSchedule, agentTablesReady, SETUP_MESSAGE } from "@/lib/agents/tasks";
import type { TeamId } from "@/lib/agents/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/*
  Scheduled agent tasks.
    GET    — this workspace's schedules
    POST   — { request, cadence: daily|weekly|monthly, hourIst, weekday?, monthday?, team?, mode? }
    PATCH  — { id, action: pause|resume|delete }
  Creating and changing schedules is manager and above: a schedule spends
  credits every time it runs, with nobody pressing a button.
*/
export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await agentTablesReady())) return NextResponse.json({ ok: false, setup: true, error: SETUP_MESSAGE });
  return NextResponse.json({ ok: true, schedules: await listSchedules(orgId) });
}

export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("manager"))) return NextResponse.json({ ok: false, error: "Scheduling agents needs the manager role or higher." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const cadence = ["daily", "weekly", "monthly"].includes(String(b.cadence)) ? b.cadence : "weekly";
  const team = ["finance", "operations", "growth"].includes(String(b.team)) ? (b.team as TeamId) : "auto";
  const r = await createSchedule({
    orgId, userId: user.id, request: String(b.request || ""), team, mode: b.mode === "team" ? "team" : b.mode === "single" ? "single" : undefined,
    cadence, hourIst: Number(b.hourIst ?? 9), weekday: Number(b.weekday ?? 1), monthday: Number(b.monthday ?? 1),
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, code: r.code }, { status: r.code === "limit" ? 429 : 400 });
  return NextResponse.json({ ok: true, schedule: r.data });
}

export async function PATCH(req: Request) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("manager"))) return NextResponse.json({ ok: false, error: "Changing schedules needs the manager role or higher." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const action = String(b.action || "");
  if (!["pause", "resume", "delete"].includes(action)) return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  const r = await updateSchedule(orgId, String(b.id || ""), action as "pause" | "resume" | "delete");
  return NextResponse.json(r.ok ? { ok: true } : { ok: false, error: r.error }, { status: r.ok ? 200 : 400 });
}
