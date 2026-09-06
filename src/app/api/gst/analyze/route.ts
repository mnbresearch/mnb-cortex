import { NextResponse } from "next/server";
import { analyzeGst } from "@/lib/ai/gst";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";
import { getUserAndOrg } from "@/lib/data";
import { persistGstAnalysis } from "@/lib/persist-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  /*
    Hoisted for the catch. Both failure BRANCHES already refunded — the
    branch where the model returns nothing, and the branch where the save
    fails — but the surrounding catch did not, so a provider timeout or a
    throw inside the persist path kept the charge. The two careful refunds
    a few lines above made that gap easy to miss.
  */
  let gate: ChargeResult | null = null;
  try {
    const { text } = await req.json().catch(() => ({}));
    const t = String(text || "").trim();
    if (t.length < 30) return NextResponse.json({ ok: false, error: "Upload or paste a GST return / summary." }, { status: 200 });

    gate = await chargeForMode("gst");
    if (!gate.ok) { const d = creditDenial(gate, "Reading a GST return"); return NextResponse.json(d.body, { status: d.status }); }

    const analysis = await analyzeGst(t);
    if (!analysis) {
      await refundIfCharged(gate, "gst");
      return NextResponse.json({ ok: false, error: "Couldn't read that return — try a clearer export or paste the summary rows." }, { status: 200 });
    }
    // Persist the filed turnover so it reaches the dashboard and the AI context.
    const { orgId } = await getUserAndOrg();
    const persisted = await persistGstAnalysis(orgId, analysis);

    // Same rule as the bank reader: if the save was OUR failure, refund and say
    // so rather than billing for a result that never reached the workspace.
    if (!persisted.ok) {
      await refundIfCharged(gate, "gst");
      return NextResponse.json({ ok: false, error: persisted.error, analysis }, { status: 200 });
    }

    return NextResponse.json({ ok: true, analysis, saved: persisted.saved, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    await refundIfCharged(gate, "gst");
    return NextResponse.json({ ok: false, error: (e?.message || "Analysis failed — check the AI key.") + " Your credits have not been used." }, { status: 200 });
  }
}
