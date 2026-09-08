import { NextResponse } from "next/server";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { improveVisualBrief } from "@/lib/ai/improve-prompt";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
  A FAST single-pass call, but still declared explicitly. Every AI route in this
  app sets its own budget rather than inheriting a platform default that has
  changed between Vercel plans — and the refund below only runs if the function
  lives long enough to reach its own catch.
*/
export const maxDuration = 60;

export async function POST(req: Request) {
  let gate: ChargeResult | null = null;
  try {
    const { orgId } = await getUserAndOrg();
    if (!orgId) return NextResponse.json({ ok: false, error: "Sign in to use this." }, { status: 200 });

    const b = await req.json().catch(() => ({} as any));
    const brief = String((b as any).brief || "").trim();
    const kind = (b as any).kind === "video" ? "video" : "image";

    /*
      Validate BEFORE charging. improveVisualBrief() returns "" for empty input
      without calling a model, so charging first would bill for pressing the
      button on an empty box — the same mistake found in four other routes.
    */
    if (brief.length < 3) {
      return NextResponse.json({
        ok: false,
        error: "Write a few words about what you want first — even 'gold ring on marble' is enough to work with.",
      }, { status: 200 });
    }

    gate = await chargeForMode("improve_prompt");
    if (!gate.ok) {
      const d = creditDenial(gate, "Improving a prompt");
      return NextResponse.json(d.body, { status: d.status });
    }

    const profile = await getOrgProfile().catch(() => null);
    const improved = await improveVisualBrief(brief, kind, (profile as any)?.industry);

    /*
      "" means the model returned nothing usable, or returned something no
      longer than what the customer already had. Either way they got no
      improvement, so they are not charged for one.
    */
    if (!improved) {
      await refundIfCharged(gate, "improve_prompt");
      return NextResponse.json({
        ok: false,
        error: "Couldn't improve that one — try adding a detail or two yourself and run it again. Your credits have not been used.",
      }, { status: 200 });
    }

    return NextResponse.json({ ok: true, improved, original: brief, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    await refundIfCharged(gate, "improve_prompt");
    return NextResponse.json({
      ok: false,
      error: (e?.message || "Could not improve that prompt.") + " Your credits have not been used.",
    }, { status: 200 });
  }
}
