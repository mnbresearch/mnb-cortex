import { NextResponse } from "next/server";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";
import { parseUpload, planWithModel, MAX_UPLOAD_BYTES } from "@/lib/engine/transform-server";
import { applyPlan } from "@/lib/engine/transform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  POST multipart: file + instruction → { plan (in words), ops, diff (preview) }.

  Nothing is stored. The file is read, summarised for the model, the plan is
  validated against the sheet's own columns, and the transform is run in
  memory to produce the preview the person approves against. The browser
  holds the file and sends it again with the approved ops to /apply.

  Charged as transform_plan (FAST). Refunded if the model produced nothing
  the engine would accept — the person got no plan, so they pay for none.
*/
export async function POST(req: Request) {
  const { orgId, user } = await getUserAndOrg();
  if (!orgId || !user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!(await hasRole("analyst"))) return NextResponse.json({ ok: false, error: "Transforming a workbook needs the analyst role or higher." }, { status: 403 });

  let gate: ChargeResult | null = null;
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    const instruction = String(fd.get("instruction") || "").trim();
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Attach a .xlsx or .csv file." }, { status: 200 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ ok: false, error: "That file is over 5 MB." }, { status: 200 });
    if (instruction.length < 4) return NextResponse.json({ ok: false, error: "Say what you want changed — e.g. 'remove rows where Status is Paid and sort by Amount, largest first'." }, { status: 200 });

    const parsed = await parseUpload(Buffer.from(await file.arrayBuffer()), file.name);
    if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 200 });

    gate = await chargeForMode("transform_plan");
    if (!gate.ok) { const d = creditDenial(gate, "Planning a workbook change"); return NextResponse.json(d.body, { status: d.status }); }

    const plan = await planWithModel(parsed.table, instruction);
    if (!plan.ok) {
      await refundIfCharged(gate, "transform_plan");
      return NextResponse.json({ ok: false, error: plan.error, problems: plan.problems || [], note: plan.note || "" }, { status: 200 });
    }

    const { diff } = applyPlan(parsed.table, plan.ops);
    return NextResponse.json({
      ok: true,
      sheet: parsed.sheetName, columns: parsed.table.columns, rows: parsed.table.rows.length,
      ops: plan.ops, describe: plan.describe, note: plan.note,
      diff: {
        ...diff,
        sample: diff.sample.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v]))),
      },
      charged: gate.enforced ? gate.cost : 0,
    });
  } catch (e: any) {
    await refundIfCharged(gate, "transform_plan");
    return NextResponse.json({ ok: false, error: `${e?.message || "Could not plan that."} Your credits have not been used.` }, { status: 200 });
  }
}
