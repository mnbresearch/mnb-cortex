import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { TOOL_CATALOG, permissionCard, toCoreAgent } from "@/lib/agents/studio";
import { listWorkspaceAgents, createWorkspaceAgent, updateWorkspaceAgent, deleteWorkspaceAgent, studioReady, studioLimit } from "@/lib/agents/workspace-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/*
  Agent Studio.
    GET    — this workspace's agents (with each one's permission card), the tool
             catalogue and the plan's limit. Every member can read.
    POST   — { team, name, role, instructions, tools[], keywords[] } create
    PATCH  — { id, ...fields, active? } update, pause or resume
    DELETE — { id }
  Changing agents is manager and above, as for schedules: an agent spends
  credits whenever the team plans it in.
*/
export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  const ready = await studioReady();
  const rows = ready ? await listWorkspaceAgents(orgId) : [];
  return NextResponse.json({
    ok: true, ready,
    limit: await studioLimit(orgId),
    canEdit: await hasRole("manager"),
    tools: TOOL_CATALOG,
    agents: rows.map((r) => ({ ...r, runnerId: toCoreAgent(r).id, card: permissionCard(r) })),
  });
}

async function guard() {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId || !user) return { res: NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 }) };
  if (!(await hasRole("manager"))) return { res: NextResponse.json({ ok: false, error: "Building and changing agents needs the manager role or higher." }, { status: 403 }) };
  return { user, orgId };
}

export async function POST(req: Request) {
  const g = await guard(); if ("res" in g) return g.res;
  const b = await req.json().catch(() => ({} as any));
  const r = await createWorkspaceAgent(g.orgId, g.user.id, b);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, code: r.code }, { status: r.code === "limit" ? 429 : 400 });
  return NextResponse.json({ ok: true, agent: { ...r.data, runnerId: toCoreAgent(r.data).id, card: permissionCard(r.data) } });
}

export async function PATCH(req: Request) {
  const g = await guard(); if ("res" in g) return g.res;
  const b = await req.json().catch(() => ({} as any));
  const id = String(b.id || ""); if (!id) return NextResponse.json({ ok: false, error: "Which agent?" }, { status: 400 });
  const { id: _drop, ...fields } = b;
  const r = await updateWorkspaceAgent(g.orgId, id, fields);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, agent: { ...r.data, runnerId: toCoreAgent(r.data).id, card: permissionCard(r.data) } });
}

export async function DELETE(req: Request) {
  const g = await guard(); if ("res" in g) return g.res;
  const b = await req.json().catch(() => ({} as any));
  const r = await deleteWorkspaceAgent(g.orgId, String(b.id || ""));
  return NextResponse.json(r.ok ? { ok: true } : { ok: false, error: r.error }, { status: r.ok ? 200 : 400 });
}
