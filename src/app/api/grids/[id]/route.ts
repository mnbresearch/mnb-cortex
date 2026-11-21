import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { getGrid, updateGrid, deleteGrid } from "@/lib/grids/store";
import { progress } from "@/lib/grids/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* One grid: read (members), edit rows/columns/name and delete (analyst+). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  const g = await getGrid(orgId, params.id);
  if (!g) return NextResponse.json({ ok: false, error: "Grid not found." }, { status: 404 });
  return NextResponse.json({ ok: true, grid: g, progress: progress(g), canEdit: await hasRole("analyst") });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Editing grids needs the analyst role or higher." }, { status: 403 });
  const b = await req.json().catch(() => ({} as any));
  const g = await updateGrid(orgId, params.id, {
    name: typeof b.name === "string" ? b.name : undefined,
    columns: b.columns,
    addItems: Array.isArray(b.addItems) ? b.addItems.map(String) : undefined,
    removeRows: Array.isArray(b.removeRows) ? b.removeRows.map(String) : undefined,
  });
  return g ? NextResponse.json({ ok: true, grid: g, progress: progress(g) }) : NextResponse.json({ ok: false, error: "Grid not found." }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Deleting grids needs the analyst role or higher." }, { status: 403 });
  return NextResponse.json({ ok: await deleteGrid(orgId, params.id) });
}
