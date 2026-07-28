import { streamCortex } from "@/lib/ai/cortex";
import { getBusinessContext } from "@/lib/data";
import { chargeForMode } from "@/lib/credits";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const gate = await chargeForMode("chat");
    if (!gate.ok) {
      return new Response(`You're out of AI credits (balance ${gate.balance}). Top up under Usage & Credits to keep chatting.`, {
        status: 402, headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    const context = await getBusinessContext();
    const stream = await streamCortex(messages, context);
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
  } catch (e: any) {
    return new Response("I hit an error reaching the AI provider. Check the API key.", { status: 200 });
  }
}
