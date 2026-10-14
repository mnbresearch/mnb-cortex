import { NextResponse } from "next/server";
import { generateReport, isEngineFailure } from "@/lib/ai/cortex";
import { getBusinessContext } from "@/lib/data";
import { chargeForMode, refundIfCharged } from "@/lib/credits";
import { creditDenial } from "@/lib/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  // Metered: a full MIS report is one of the most expensive generations we run.
  const gate = await chargeForMode("report");
  if (!gate.ok) {
    const d = creditDenial(gate, "A monthly business review");
    return NextResponse.json({ ...d.body, report: d.body.error }, { status: d.status });
  }
  try {
    const context = await getBusinessContext();
    const report = await generateReport(context);
    /*
      generateReport() reports an engine failure as TEXT (unreachable, or the
      no-key setup hint), never as "" — so `!report` alone billed the customer
      for an error message and handed it back as ok:true, where the page shows
      it (and can save it) as their monthly review. isEngineFailure catches
      both. Refund to whoever paid (refundIfCharged follows gate.payerOrgId).
    */
    if (!report || !report.trim() || isEngineFailure(report)) {
      await refundIfCharged(gate, "report");
      return NextResponse.json({
        ok: false,
        report: "Could not generate the report — please try again.",
        ...(report && isEngineFailure(report) ? { error: report.trim().slice(0, 400) } : {}),
      }, { status: 200 });
    }
    return NextResponse.json({ ok: true, report, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    await refundIfCharged(gate, "report"); // failed run is never billed
    return NextResponse.json({ ok: false, report: "Could not generate the report — check the AI key.", error: e?.message }, { status: 200 });
  }
}
