import { NextResponse } from "next/server";
import { generateReport } from "@/lib/ai/cortex";
import { getBusinessContext } from "@/lib/data";
import { chargeForMode, refundForMode } from "@/lib/credits";
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
    if (!report) {
      if (gate.enforced) await refundForMode("report");
      return NextResponse.json({ ok: false, report: "Could not generate the report — please try again." }, { status: 200 });
    }
    return NextResponse.json({ ok: true, report, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    if (gate.enforced) await refundForMode("report"); // failed run is never billed
    return NextResponse.json({ ok: false, report: "Could not generate the report — check the AI key.", error: e?.message }, { status: 200 });
  }
}
