import { NextResponse } from "next/server";
import { analyzeGst } from "@/lib/ai/gst";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundForMode } from "@/lib/credits";
import { getUserAndOrg } from "@/lib/data";
import { persistGstAnalysis } from "@/lib/persist-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { text } = await req.json().catch(() => ({}));
    const t = String(text || "").trim();
    if (t.length < 30) return NextResponse.json({ ok: false, error: "Upload or paste a GST return / summary." }, { status: 200 });

    const gate = await chargeForMode("gst");
    if (!gate.ok) { const d = creditDenial(gate, "Reading a GST return"); return NextResponse.json(d.body, { status: d.status }); }

    const analysis = await analyzeGst(t);
    if (!analysis) {
      if (gate.enforced) await refundForMode("gst");
      return NextResponse.json({ ok: false, error: "Couldn't read that return — try a clearer export or paste the summary rows." }, { status: 200 });
    }
    // Persist the filed turnover so it reaches the dashboard and the AI context.
    const { orgId } = await getUserAndOrg();
    const saved = await persistGstAnalysis(orgId, analysis);

    return NextResponse.json({ ok: true, analysis, saved, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Analysis failed — check the AI key." }, { status: 200 });
  }
}
