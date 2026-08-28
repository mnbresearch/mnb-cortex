import { streamCortex } from "@/lib/ai/cortex";
import { getBusinessContext, getUserAndOrg } from "@/lib/data";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";
import { recallContext } from "@/lib/memory";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
 * Streaming still counts against the total function budget, not just
 * time-to-first-byte.
 *
 * Every other AI route in this app sets an explicit budget (30-300s); these
 * seven did not, so they silently inherited whatever the platform default
 * happens to be. That default is not ours to control and has changed between
 * Vercel plans and runtimes, which is a poor thing to hang the product's
 * headline feature on: the failure mode is a 504 with no log line, and the
 * user just sees a button that did nothing.
 */
export const maxDuration = 60;
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
