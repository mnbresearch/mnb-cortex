import { streamCortex } from "@/lib/ai/cortex";
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
      return new Response(d.body.error, { status: d.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    const context = await getBusinessContext();
    const lastUser = Array.isArray(messages) ? [...messages].reverse().find((m: any) => m?.role === "user")?.content : "";
    const { orgId } = await getUserAndOrg();
    const mem = await recallContext(orgId, String(lastUser || ""), 8);
    const stream = await streamCortex(messages, mem ? `${context}\n\n${mem}` : context);
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
  } catch (e: any) {
    return new Response("I hit an error reaching the AI provider. Check the API key.", { status: 200 });
  }
}
