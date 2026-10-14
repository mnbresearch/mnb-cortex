import { NextResponse } from "next/server";
import { generateFor, hasModePrompt, isEngineFailure } from "@/lib/ai/cortex";
import { getBusinessContext, getUserAndOrg } from "@/lib/data";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";
import { recallContext } from "@/lib/memory";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
 * The busiest AI route in the product: the dashboard pulse, every 'ask the
 * AI COO' button, RFM advice and churn plans all land here. Measured at ~28s
 * against a real workspace.
 *
 * Every other AI route in this app sets an explicit budget (30-300s); these
 * seven did not, so they silently inherited whatever the platform default
 * happens to be. That default is not ours to control and has changed between
 * Vercel plans and runtimes, which is a poor thing to hang the product's
 * headline feature on: the failure mode is a 504 with no log line, and the
 * user just sees a button that did nothing.
 */
export const maxDuration = 60;

/*
  The input goes straight into a paid prompt. 12,000 characters is room for a
  pasted contract, transcript or document (the AIPanel file reader keeps
  20,000, of which this is the part a single call can sensibly use) without
  letting one request carry an unbounded body to the model on our bill.
*/
const MAX_INPUT = 12_000;

export async function POST(req: Request) {
  /*
    Both hoisted so the catch can refund. The mode matters as much as the gate:
    costs differ per mode (14-24 credits here), so refunding a hardcoded mode
    would give back the wrong amount.
  */
  let gate: ChargeResult | null = null;
  let m = "pulse";
  try {
    const { mode, input: rawInput } = await req.json();
    m = String(mode || "pulse");
    /*
      THE CLIENT PICKS THE MODE, AND THE MODE PICKS THE PRICE. generateFor()
      quietly answers any unknown mode with the 3-sentence pulse prompt, so an
      unknown mode was charged whatever creditCost() said for it and delivered
      a pulse. Refused before anything is charged.
    */
    if (!hasModePrompt(m)) {
      return NextResponse.json({ ok: false, text: "That analysis type is not available. Nothing was charged.", error: "Unknown mode." }, { status: 400 });
    }
    const input = String(rawInput || "").slice(0, MAX_INPUT);
    gate = await chargeForMode(m);
    if (!gate.ok) {
      const d = creditDenial(gate, "This action");
      return NextResponse.json({ ...d.body, text: d.body.error }, { status: d.status });
    }
    /*
      These two were awaited one after the other, and neither depends on the
      other — the request paid two sequential database round trips before the
      model was even asked anything. Only the memory recall genuinely has to
      wait, because it needs the org id.
    */
    const [context, { orgId }] = await Promise.all([getBusinessContext(), getUserAndOrg()]);
    const mem = await recallContext(orgId, String(input || m), 8);
    const fullContext = mem ? `${context}\n\n${mem}` : context;
    const text = await generateFor(m, input, fullContext);

    // An empty completion is a failure that does not throw: the provider
    // answered, it just answered with nothing. Billing for a blank panel is
    // the same as billing for an exception.
    if (!String(text || "").trim()) {
      await refundIfCharged(gate, m);
      return NextResponse.json({ ok: false, text: "The AI returned an empty answer — try running that again. Your credits have not been used." }, { status: 200 });
    }

    /*
      NO PROVIDER ANSWERED. runCortex returns that as a sentence ("I couldn't
      reach the AI engine…", or the no-key setup hint), and this route used to
      bill it as an answer because it was not empty. Refund it and say so;
      the cause in the sentence is still shown.
    */
    if (isEngineFailure(text)) {
      await refundIfCharged(gate, m);
      return NextResponse.json({ ok: false, engineFailure: true, text: `${text}\n\nYour credits have not been used.`, error: "The AI engine did not answer." }, { status: 200 });
    }

    return NextResponse.json({ ok: true, text, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    await refundIfCharged(gate, m);
    return NextResponse.json({ ok: false, text: "Could not run the AI — check the API key. Your credits have not been used.", error: e?.message }, { status: 200 });
  }
}
