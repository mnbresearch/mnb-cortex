import { NextResponse } from "next/server";
import { getUserAndOrg, getOrgProfile } from "@/lib/data";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";
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
  try {
    const b = await req.json().catch(() => ({} as any));
    const kind = String(b.kind || "") as GbpKind;
    if (!GBP_KINDS.some((k) => k.id === kind)) {
      return NextResponse.json({ ok: false, error: "Unknown content type." }, { status: 200 });
    }

    const gate = await chargeForMode("gbp");
    if (!gate.ok) {
      const d = creditDenial(gate, "Google Business Profile content");
      return NextResponse.json({ ...d.body, text: d.body.error }, { status: d.status });
    }

    const [{ orgId }, profile] = await Promise.all([getUserAndOrg(), getOrgProfile().catch(() => null)]);
    const business = String(b.business || (profile as any)?.name || "").trim();
    if (!business) {
      return NextResponse.json({ ok: false, error: "Set your company name in Settings first." }, { status: 200 });
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

    return NextResponse.json({ ok: true, text, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Could not generate." }, { status: 200 });
  }
}
