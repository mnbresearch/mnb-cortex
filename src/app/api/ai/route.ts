import { NextResponse } from "next/server";
import { generateFor } from "@/lib/ai/cortex";
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
export async function POST(req: Request) {
  /*
    Both hoisted so the catch can refund. The mode matters as much as the gate:
    costs differ per mode (14-24 credits here), so refunding a hardcoded mode
    would give back the wrong amount.
  */
  let gate: ChargeResult | null = null;
  let m = "pulse";
  try {
    const { mode, input } = await req.json();
    m = String(mode || "pulse");
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
    const text = await generateFor(m, String(input || ""), fullContext);

    // An empty completion is a failure that does not throw: the provider
    // answered, it just answered with nothing. Billing for a blank panel is
    // the same as billing for an exception.
    if (!String(text || "").trim()) {
      await refundIfCharged(gate, m);
      return NextResponse.json({ ok: false, text: "The AI returned an empty answer — try running that again. Your credits have not been used." }, { status: 200 });
    }

    return NextResponse.json({ text, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    await refundIfCharged(gate, m);
    return NextResponse.json({ text: "Could not run the AI — check the API key. Your credits have not been used.", error: e?.message }, { status: 200 });
  }
}
