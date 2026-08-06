import { NextResponse } from "next/server";
import { runDeepDive } from "@/lib/ai/cortex";
import { getBusinessContext, getUserAndOrg } from "@/lib/data";
import { chargeForMode } from "@/lib/credits";
import { recallContext } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { focus, question } = await req.json().catch(() => ({}));
    const f = String(focus || "finance").toLowerCase();
    const q = String(question || "");

    const gate = await chargeForMode("deepdive");
    if (!gate.ok) {
      return NextResponse.json({
        ok: false, outOfCredits: true, cost: gate.cost, balance: gate.balance,
        error: `You're out of AI credits. A Deep Dive costs ${gate.cost} credits and your balance is ${gate.balance}. Top up under Usage & Credits.`,
      }, { status: 402 });
    }

    const context = await getBusinessContext();
    let full = context;
    try {
      const { orgId } = await getUserAndOrg();
      const mem = orgId ? await recallContext(orgId, q || f, 10) : "";
      if (mem) full = `${context}\n\n${mem}`;
    } catch { /* memory optional */ }

    const sections = await runDeepDive(f, q, full);
    return NextResponse.json({ ok: true, focus: f, question: q, sections, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Deep Dive failed — check the AI key." }, { status: 200 });
  }
}
