import { NextResponse } from "next/server";
import { analyzeGst } from "@/lib/ai/gst";
import { chargeForMode } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { text } = await req.json().catch(() => ({}));
    const t = String(text || "").trim();
    if (t.length < 30) return NextResponse.json({ ok: false, error: "Upload or paste a GST return / summary." }, { status: 200 });

    const gate = await chargeForMode("gst");
    if (!gate.ok) return NextResponse.json({ ok: false, outOfCredits: true, cost: gate.cost, balance: gate.balance,
      error: `You're out of AI credits. Reading a GST return costs ${gate.cost} credits (balance ${gate.balance}).` }, { status: 402 });

    const analysis = await analyzeGst(t);
    if (!analysis) return NextResponse.json({ ok: false, error: "Couldn't read that return — try a clearer export or paste the summary rows." }, { status: 200 });
    return NextResponse.json({ ok: true, analysis, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Analysis failed — check the AI key." }, { status: 200 });
  }
}
