import { NextResponse } from "next/server";
import { runCortex } from "@/lib/ai/cortex";
import { getBusinessContext } from "@/lib/data";
import { chargeForMode } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const gate = await chargeForMode("chat");
    if (!gate.ok) {
      return NextResponse.json({
        reply: `You're out of AI credits (balance ${gate.balance}). Top up under Usage & Credits to keep chatting with your AI COO.`,
        outOfCredits: true,
      }, { status: 402 });
    }
    const context = await getBusinessContext();
    const reply = await runCortex(messages, context);
    return NextResponse.json({ reply, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ reply: "I hit an error reaching the AI provider. Check your API keys in the environment.", error: e?.message }, { status: 200 });
  }
}
