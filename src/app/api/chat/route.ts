import { NextResponse } from "next/server";
import { runCortex } from "@/lib/ai/cortex";
import { getBusinessContext } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const context = await getBusinessContext();
    const reply = await runCortex(messages, context);
    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ reply: "I hit an error reaching the AI provider. Check your API keys in the environment.", error: e?.message }, { status: 200 });
  }
}
