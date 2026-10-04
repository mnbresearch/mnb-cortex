import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/server";
import { buildWorkbook, type Dataset } from "@/lib/engine/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  Download the workbook for a completed export_xlsx proposal.

  The file is produced NOW, from live data, because this product deliberately
  stores no files. The ledger row is the authorisation: it must belong to the
  caller's workspace (resolved from the session, never from the URL), be an
  export_xlsx, and be done. Anyone who can read the workspace may download its
  own exports — that is the same information they can already see on screen.
*/
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { orgId, user } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: "Service role not configured." }, { status: 503 });

  const { data: p } = await svc.from("action_proposals")
    .select("id, action, status, args").eq("id", params.id).eq("org_id", orgId).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if ((p as any).action !== "export_xlsx" || (p as any).status !== "done") {
    return NextResponse.json({ error: "That proposal has no file to download." }, { status: 409 });
  }

  const { data: org } = await svc.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const args = ((p as any).args || {}) as Record<string, unknown>;
  const { buffer, filename } = await buildWorkbook(
    String(args.dataset) as Dataset, orgId, Number(args.days) || 365, String((org as any)?.name || "Workspace"),
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      /* Filename is built from the org name through a [^a-z0-9]+ → "-" slug in buildWorkbook, so no header injection. */
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
