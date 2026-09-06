import { NextResponse } from "next/server";
import { analyzeBankStatement } from "@/lib/ai/bankstatement";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";
import { getUserAndOrg } from "@/lib/data";
import { persistBankAnalysis } from "@/lib/persist-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  /*
    Hoisted for the catch. Both failure BRANCHES already refunded — the
    branch where the model returns nothing, and the branch where the save
    fails — but the surrounding catch did not, so a provider timeout or a
    throw inside the persist path kept the charge. The two careful refunds
    a few lines above made that gap easy to miss.
  */
  let gate: ChargeResult | null = null;
  try {
    const { text } = await req.json().catch(() => ({}));
    const t = String(text || "").trim();
    if (t.length < 40) return NextResponse.json({ ok: false, error: "Upload or paste a bank statement (CSV or PDF text)." }, { status: 200 });

    gate = await chargeForMode("bankstatement");
    if (!gate.ok) { const d = creditDenial(gate, "Analysing a statement"); return NextResponse.json(d.body, { status: d.status }); }

    const analysis = await analyzeBankStatement(t);
    if (!analysis) {
      await refundIfCharged(gate, "bankstatement");   // no result → don't bill
      return NextResponse.json({ ok: false, error: "Couldn't read that statement — try a clearer CSV export, or paste the transaction rows." }, { status: 200 });
    }

    // Persist the cash position so the dashboard, the runway KPI and the AI's
    // business context all reflect what the customer just paid to analyse.
    const { orgId } = await getUserAndOrg();
    const persisted = await persistBankAnalysis(orgId, analysis);

    // The analysis succeeded but WE could not store it. The customer must not
    // pay for a result that vanished, and must not be left wondering why the
    // dashboard did not move. Previously this returned ok:true with saved:0
    // and charged in full.
    if (!persisted.ok) {
      await refundIfCharged(gate, "bankstatement");
      return NextResponse.json({ ok: false, error: persisted.error, analysis }, { status: 200 });
    }

    return NextResponse.json({ ok: true, analysis, saved: persisted.saved, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    await refundIfCharged(gate, "bankstatement");
    return NextResponse.json({ ok: false, error: (e?.message || "Analysis failed — check the AI key.") + " Your credits have not been used." }, { status: 200 });
  }
}
