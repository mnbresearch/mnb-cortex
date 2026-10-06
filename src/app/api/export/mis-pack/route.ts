import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/server";
import { buildWorkbook } from "@/lib/engine/xlsx";
import { propose } from "@/lib/engine/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  GET → the monthly MIS pack as .xlsx, for the signed-in workspace.

  Read-only over rows every member can already see, so any member may
  download it. It is also recorded in the Actions ledger as an export_xlsx
  proposal (auto by default for exports; if the owner has set that action to
  approve or blocked, the rule wins and this route says so instead of
  handing over the file) — so "what did Cortex produce, when, for whom" has
  one answer, on /approvals, for files made here and files made in chat.
*/
export async function GET() {
  const { orgId, user } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const svc = serviceClient();
  if (!svc) return NextResponse.json({ error: "Service role not configured." }, { status: 503 });

  /* Each download is its own ledger row — the default idempotency key folds a
     day's identical proposals into one, which is right for a cron and wrong
     for a person pressing Download twice. */
  const { currentRole } = await import("@/lib/roles");
  const { role } = await currentRole();
  const r = await propose({
    actorRole: role,
    orgId, action: "export_xlsx", args: { dataset: "mis_pack" }, source: "user", proposedBy: user.id,
    rationale: "MIS pack downloaded from Reports.", idempotencyKey: `mis_pack:${orgId}:${Date.now()}:${user.id.slice(0, 8)}`,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  if (r.executed && !r.executed.ok) {
    return NextResponse.json({ error: `The export was recorded but failed: ${r.executed.error || "unknown error"}` }, { status: 500 });
  }
  if (!r.executed) {
    const msg = r.verdict.verdict === "blocked" ? `Exports are blocked in this workspace: ${r.verdict.reason}` : `${r.verdict.reason} It is now waiting on the Approvals page.`;
    return NextResponse.json({ error: msg, proposalId: r.proposal.id }, { status: 409 });
  }

  const { data: org } = await svc.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const { buffer, filename } = await buildWorkbook("mis_pack", orgId, 365, String((org as any)?.name || "Workspace"));
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
