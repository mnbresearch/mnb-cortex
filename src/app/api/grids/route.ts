import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { listGrids, createGrid, gridsReady } from "@/lib/grids/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Grids: list (members) and create (analyst+). */
export async function GET() {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  const ready = await gridsReady();
  return NextResponse.json({ ok: true, ready, canEdit: await hasRole("analyst"), grids: ready ? await listGrids(orgId) : [] });
}

export async function POST(req: Request) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Creating grids needs the analyst role or higher." }, { status: 403 });
  if (!(await gridsReady())) return NextResponse.json({ ok: false, error: "Grids needs its table: run supabase/RUN-2026-11-20-grids.sql." }, { status: 503 });
  const b = await req.json().catch(() => ({} as any));
  const g = await createGrid(orgId, user.id, b.name, b.columns);
  return g ? NextResponse.json({ ok: true, grid: g }) : NextResponse.json({ ok: false, error: "Could not create the grid." }, { status: 500 });
}
