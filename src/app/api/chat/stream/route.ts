import { streamCortex } from "@/lib/ai/cortex";
import { getBusinessContext, getUserAndOrg } from "@/lib/data";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";
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
  /*
    Hoisted for the refund in the catch.

    The scope is worth being precise about: this covers failures BEFORE the
    first byte, which is where a bad or expired provider key lands —
    streamCortex() does its fetch and throws while connecting, so nothing has
    been delivered and the charge is entirely unearned. A failure part-way
    through a stream is not refunded here, because the customer did receive an
    answer, just a truncated one; unwinding that correctly needs the stream
    itself to report how far it got, which is a larger change than this one.
  */
  let gate: ChargeResult | null = null;
  try {
    const { messages } = await req.json();
    gate = await chargeForMode("chat");
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
    await refundIfCharged(gate, "chat");
    return new Response("I hit an error reaching the AI provider. Check the API key — your credits have not been used.", { status: 200 });
  }
}
