import { NextResponse } from "next/server";
import { runCortex } from "@/lib/ai/cortex";
import { getBusinessContext, getUserAndOrg } from "@/lib/data";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";
import { recallContext } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const gate = await chargeForMode("chat");
    if (!gate.ok) {
      const d = creditDenial(gate, "Chatting with your AI COO");
      return NextResponse.json({ ...d.body, reply: d.body.error }, { status: d.status });
    }
    const context = await getBusinessContext();
    const lastUser = Array.isArray(messages) ? [...messages].reverse().find((m: any) => m?.role === "user")?.content : "";
    const { orgId } = await getUserAndOrg();
    const mem = await recallContext(orgId, String(lastUser || ""), 8);
    const reply = await runCortex(messages, mem ? `${context}\n\n${mem}` : context);
    return NextResponse.json({ reply, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ reply: "I hit an error reaching the AI provider. Check your API keys in the environment.", error: e?.message }, { status: 200 });
  }
}
