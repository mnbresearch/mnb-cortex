import { NextResponse } from "next/server";
import { runVisibility, draftAeoFix, defaultPrompts } from "@/lib/ai/visibility";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  /*
    Hoisted so the catch below can give the credits back. This is the most
    expensive single action in the product — 89 credits, more than three times
    the next one — and until now every failure kept the money.
  */
  let gate: ChargeResult | null = null;
  try {
    const b = await req.json().catch(() => ({} as any));
    const brand = String(b.brand || "").trim();
    if (!brand) return NextResponse.json({ ok: false, error: "Enter your brand name." }, { status: 200 });
    const category = String(b.category || "").trim();
    const location = String(b.location || "").trim();
    const competitors = Array.isArray(b.competitors) ? b.competitors.map((c: any) => String(c)) : [];
    const prompts: string[] = Array.isArray(b.prompts) && b.prompts.length ? b.prompts.map((p: any) => String(p)) : defaultPrompts(category, location);

    gate = await chargeForMode("visibility");
    if (!gate.ok) { const d = creditDenial(gate, "An AI Visibility check"); return NextResponse.json(d.body, { status: d.status }); }

    const report = await runVisibility(brand, competitors, prompts, 8);

    /*
      THE WORST FAILURE IN THIS FILE, and it never threw.

      askEngine() returns `{ answer: "", engine: "none" }` when no provider key
      works or every request fails. runVisibility then finds the brand
      "mentioned" in none of the empty answers, so it returns a complete,
      confident-looking report: score 0%, and every prompt listed under
      `missing` — the section the UI renders as "AI engines are not recommending
      you here".

      So a customer whose GEMINI key had expired paid 89 credits to be told
      their brand is invisible across the web. It is not a degraded answer, it
      is a fabricated one, derived from zero data and indistinguishable from a
      real zero. Refuse it, say plainly that the check could not run, and give
      the credits back.
    */
    if (report.engine === "none") {
      await refundIfCharged(gate, "visibility");
      return NextResponse.json({
        ok: false,
        error: "No answer engine responded, so there is nothing to score — a 0% here would be misleading, not a result. Check the AI provider key in Settings and run it again. Your credits have not been used.",
      }, { status: 200 });
    }

    let fix = "";
    try { fix = await draftAeoFix(brand, category, location, report.missing); } catch { /* fix optional */ }

    return NextResponse.json({ ok: true, report, fix, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    await refundIfCharged(gate, "visibility");
    return NextResponse.json({ ok: false, error: e?.message || "Visibility check failed — check the AI key. Your credits have not been used." }, { status: 200 });
  }
}
