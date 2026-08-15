import { NextResponse } from "next/server";
import { runDeepDive } from "@/lib/ai/cortex";
import { getBusinessContext, getUserAndOrg } from "@/lib/data";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundForMode } from "@/lib/credits";
import { recallContext } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let charged = false;
  try {
    const { focus, question } = await req.json().catch(() => ({}));
    const f = String(focus || "finance").toLowerCase();
    const q = String(question || "");

    const gate = await chargeForMode("deepdive");
    if (!gate.ok) { const d = creditDenial(gate, "A Deep Dive"); return NextResponse.json(d.body, { status: d.status }); }
    charged = gate.enforced;

    const context = await getBusinessContext();
    let full = context;
    try {
      const { orgId } = await getUserAndOrg();
      const mem = orgId ? await recallContext(orgId, q || f, 10) : "";
      if (mem) full = `${context}\n\n${mem}`;
    } catch { /* memory optional */ }

    const sections = await runDeepDive(f, q, full);
    if (!sections || !sections.length) {
      if (charged) await refundForMode("deepdive");   // nothing generated → don't bill
      return NextResponse.json({ ok: false, error: "Deep Dive couldn't generate anything — please try again in a moment." }, { status: 200 });
    }
    return NextResponse.json({ ok: true, focus: f, question: q, sections, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    if (charged) { try { await refundForMode("deepdive"); } catch { /* ignore */ } }
    return NextResponse.json({ ok: false, error: e?.message || "Deep Dive failed — check the AI key." }, { status: 200 });
  }
}
