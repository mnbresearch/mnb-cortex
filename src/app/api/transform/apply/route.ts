import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { parseUpload, buildTransformed, MAX_UPLOAD_BYTES } from "@/lib/engine/transform-server";
import { validatePlan } from "@/lib/engine/transform";
import { serviceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  POST multipart: file + ops (JSON) → the transformed .xlsx as a download.

  The ops are RE-VALIDATED against the file's columns here — the browser
  could send anything, and the plan it shows the person is only trustworthy
  if the thing that executes refuses what the planner would have refused.
  No model is involved on this path at all.

  A ledger row is recorded (source "user", status done, no undo — the person
  has the original and the output; nothing in the workspace changed) so the
  Approvals history shows what was transformed, when, and with which steps.
*/
export async function POST(req: Request) {
  const { orgId, user } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Transforming a workbook needs the analyst role or higher." }, { status: 403 });

  try {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "The file is missing." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ ok: false, error: "That file is over 5 MB." }, { status: 400 });
    let rawOps: unknown;
    try { rawOps = JSON.parse(String(fd.get("ops") || "[]")); } catch { return NextResponse.json({ ok: false, error: "The plan was not readable." }, { status: 400 }); }

    const parsed = await parseUpload(Buffer.from(await file.arrayBuffer()), file.name);
    if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

    const v = validatePlan(rawOps, parsed.table.columns);
    if (!v.ok) return NextResponse.json({ ok: false, error: "The plan does not match this file.", problems: v.problems }, { status: 400 });

    const { buffer, filename, diff } = await buildTransformed(parsed.table, v.ops, parsed.sheetName, file.name);

    /* Audit row. Best-effort: a failure to record must not withhold the file the person just approved. */
    try {
      const svc = serviceClient();
      if (svc) {
        await svc.from("action_proposals").insert({
          org_id: orgId, action: "transform_workbook", source: "user", proposed_by: user.id,
          args: { source: file.name, steps: v.describe, rows_before: diff.rowsBefore, rows_after: diff.rowsAfter, columns_after: diff.columnsAfter },
          rationale: "Approved on the Excel page.", evidence: [],
          status: "done", policy_verdict: "auto", policy_reason: "User-initiated transform of their own uploaded file; the download is the approval.",
          decided_by: user.id, decided_at: new Date().toISOString(), executed_at: new Date().toISOString(),
          result: { summary: `Transformed ${file.name}: ${diff.rowsBefore} → ${diff.rowsAfter} rows, ${v.describe.length} step${v.describe.length === 1 ? "" : "s"}.`, filename },
          undo: null,
          idempotency_key: `transform:${orgId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        });
      }
    } catch { /* recorded best-effort; see note above */ }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Could not apply the plan." }, { status: 500 });
  }
}
