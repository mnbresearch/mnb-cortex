import { NextResponse } from "next/server";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";
import { runCortex } from "@/lib/ai/cortex";
import { FAST, STANDARD } from "@/lib/ai/generation";
import { buildGbpPrompt, GBP_KINDS, type GbpKind } from "@/lib/gbp";
import { recallContext } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
 * Generates Google Business Profile content through the model, so it takes as
 * long as any other AI route. Every AI route in this app declares its own
 * budget rather than inheriting a platform default that has changed between
 * Vercel plans.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  let gate: ChargeResult | null = null;
  try {
    const b = await req.json().catch(() => ({} as any));
    const kind = String(b.kind || "") as GbpKind;
    if (!GBP_KINDS.some((k) => k.id === kind)) {
      return NextResponse.json({ ok: false, error: "Unknown content type." }, { status: 200 });
    }

    gate = await chargeForMode("gbp");
    if (!gate.ok) {
      const d = creditDenial(gate, "Google Business Profile content");
      return NextResponse.json({ ...d.body, text: d.body.error }, { status: d.status });
    }

    const [{ orgId }, profile] = await Promise.all([getUserAndOrg(), getOrgProfile().catch(() => null)]);
    const business = String(b.business || (profile as any)?.name || "").trim();
    if (!business) {
      /*
        A VALIDATION failure, billed. The charge happens above, and this check
        needs the profile that is only loaded below it, so a workspace that had
        not filled in its company name was charged for the privilege of being
        told to go and fill it in — repeatedly, since the button stays there.
      */
      await refundIfCharged(gate, "gbp");
      return NextResponse.json({ ok: false, error: "Set your company name in Settings first — nothing was generated, so your credits have not been used." }, { status: 200 });
    }

    const prompt = buildGbpPrompt({
      kind,
      business,
      industry: (profile as any)?.industry,
      city: String(b.city || "").trim() || null,
      detail: String(b.detail || ""),
      rating: typeof b.rating === "number" ? b.rating : undefined,
    });

    /*
      Grounded in the workspace's memory like every other AI surface, so the
      description talks about what this business actually sells rather than a
      generic version of its industry.
    */
    const mem = await recallContext(orgId, `${kind} ${business}`, 6).catch(() => "");
    const context = mem ? `Business memory:\n${mem}` : "";

    // A description or a review reply is short and the user is waiting; the
    // services and Q&A lists are longer and worth a little more room.
    const profileToUse = kind === "services" || kind === "qanda" ? STANDARD : FAST;
    const text = await runCortex([{ role: "user", content: prompt }], context, profileToUse);

    if (!String(text || "").trim()) {
      await refundIfCharged(gate, "gbp");
      return NextResponse.json({ ok: false, error: "The AI returned nothing — try again. Your credits have not been used." }, { status: 200 });
    }

    return NextResponse.json({ ok: true, text, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    await refundIfCharged(gate, "gbp");
    return NextResponse.json({ ok: false, error: (e?.message || "Could not generate.") + " Your credits have not been used." }, { status: 200 });
  }
}
