import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { runGridBatch } from "@/lib/grids/store";
import { progress } from "@/lib/grids/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  Run the next batch of pending cells. The page calls this repeatedly until it
  answers stopped: "done" (or "credits"), so no single request runs long.
  Each cell is charged at the document price and refunded if it fails.
*/
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, orgId } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ ok: false, error: "Sign in to a workspace." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Running grids needs the analyst role or higher." }, { status: 403 });
  const r = await runGridBatch(orgId, user.id, params.id);
  if (!r.grid) return NextResponse.json({ ok: false, error: "Grid not found." }, { status: 404 });
  return NextResponse.json({ ok: true, grid: r.grid, progress: progress(r.grid), stopped: r.stopped });
}
