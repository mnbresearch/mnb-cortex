import { NextResponse } from "next/server";
import { analyzeBankStatement } from "@/lib/ai/bankstatement";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundForMode } from "@/lib/credits";
import { getUserAndOrg } from "@/lib/data";
import { persistBankAnalysis } from "@/lib/persist-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { text } = await req.json().catch(() => ({}));
    const t = String(text || "").trim();
    if (t.length < 40) return NextResponse.json({ ok: false, error: "Upload or paste a bank statement (CSV or PDF text)." }, { status: 200 });

    const gate = await chargeForMode("bankstatement");
    if (!gate.ok) { const d = creditDenial(gate, "Analysing a statement"); return NextResponse.json(d.body, { status: d.status }); }

    const analysis = await analyzeBankStatement(t);
    if (!analysis) {
      if (gate.enforced) await refundForMode("bankstatement");   // no result → don't bill
      return NextResponse.json({ ok: false, error: "Couldn't read that statement — try a clearer CSV export, or paste the transaction rows." }, { status: 200 });
    }

    // Persist the cash position so the dashboard, the runway KPI and the AI's
    // business context all reflect what the customer just paid to analyse.
    const { orgId } = await getUserAndOrg();
    const saved = await persistBankAnalysis(orgId, analysis);

    return NextResponse.json({ ok: true, analysis, saved, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Analysis failed — check the AI key." }, { status: 200 });
  }
}
