import { NextResponse } from "next/server";
import { generateFor } from "@/lib/ai/cortex";
import { getBusinessContext } from "@/lib/data";
import { chargeForMode } from "@/lib/credits";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { mode, input } = await req.json();
    const m = String(mode || "pulse");
    const gate = await chargeForMode(m);
    if (!gate.ok) {
      return NextResponse.json({
        text: `You're out of AI credits. This action costs ${gate.cost} credit${gate.cost === 1 ? "" : "s"} and your balance is ${gate.balance}. Top up under Usage & Credits to continue.`,
        outOfCredits: true, cost: gate.cost, balance: gate.balance,
      }, { status: 402 });
    }
    const context = await getBusinessContext();
    const text = await generateFor(m, String(input || ""), context);
    return NextResponse.json({ text, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ text: "Could not run the AI — check the API key.", error: e?.message }, { status: 200 });
  }
}
