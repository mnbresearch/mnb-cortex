import { NextResponse } from "next/server";
import { generateFor } from "@/lib/ai/cortex";
import { getBusinessContext, getUserAndOrg } from "@/lib/data";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";
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
  try {
    const { mode, input } = await req.json();
    const m = String(mode || "pulse");
    const gate = await chargeForMode(m);
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
    return NextResponse.json({ text, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ text: "Could not run the AI — check the API key.", error: e?.message }, { status: 200 });
  }
}
