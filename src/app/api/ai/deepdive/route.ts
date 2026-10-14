import { NextResponse } from "next/server";
import { runDeepDive } from "@/lib/ai/cortex";
import { getBusinessContext, getUserAndOrg } from "@/lib/data";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";
import { recallContext } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* The question is interpolated into all three paid passes. */
const MAX_QUESTION = 2_000;

export async function POST(req: Request) {
  /*
    The deadline is taken at the very top: the three passes must finish — or
    give up and refund — before maxDuration, because a function the platform
    kills never runs the refund below. 50s of 60 leaves room to answer.
  */
  const deadlineAt = Date.now() + 50_000;
  /* The gate itself, not a boolean: refundIfCharged sends the refund to whoever paid (a Practice firm, for a pooled client) and never twice. */
  let gate: ChargeResult | null = null;
  try {
    const { focus, question } = await req.json().catch(() => ({}));
    const f = String(focus || "finance").toLowerCase();
    const q = String(question || "").slice(0, MAX_QUESTION);

    gate = await chargeForMode("deepdive");
    if (!gate.ok) { const d = creditDenial(gate, "A Deep Dive"); return NextResponse.json(d.body, { status: d.status }); }

    const context = await getBusinessContext();
    let full = context;
    try {
      const { orgId } = await getUserAndOrg();
      const mem = orgId ? await recallContext(orgId, q || f, 10) : "";
      if (mem) full = `${context}\n\n${mem}`;
    } catch { /* memory optional */ }

    const sections = await runDeepDive(f, q, full, { deadlineAt });
    /* runDeepDive returns [] when any pass failed or time ran out — all three or nothing. */
    if (!sections || sections.length < 3) {
      await refundIfCharged(gate, "deepdive");   // nothing (complete) generated → don't bill
      return NextResponse.json({ ok: false, error: "Deep Dive couldn't complete all three passes — the AI engine did not answer, or not in time. Please try again in a moment. Your credits have not been used." }, { status: 200 });
    }
    return NextResponse.json({ ok: true, focus: f, question: q, sections, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    await refundIfCharged(gate, "deepdive");
    return NextResponse.json({ ok: false, error: (e?.message || "Deep Dive failed — check the AI key.") + " Your credits have not been used." }, { status: 200 });
  }
}
