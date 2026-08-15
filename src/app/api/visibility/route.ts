import { NextResponse } from "next/server";
import { runVisibility, draftAeoFix, defaultPrompts } from "@/lib/ai/visibility";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({} as any));
    const brand = String(b.brand || "").trim();
    if (!brand) return NextResponse.json({ ok: false, error: "Enter your brand name." }, { status: 200 });
    const category = String(b.category || "").trim();
    const location = String(b.location || "").trim();
    const competitors = Array.isArray(b.competitors) ? b.competitors.map((c: any) => String(c)) : [];
    const prompts: string[] = Array.isArray(b.prompts) && b.prompts.length ? b.prompts.map((p: any) => String(p)) : defaultPrompts(category, location);

    const gate = await chargeForMode("visibility");
    if (!gate.ok) { const d = creditDenial(gate, "An AI Visibility check"); return NextResponse.json(d.body, { status: d.status }); }

    const report = await runVisibility(brand, competitors, prompts, 8);
    let fix = "";
    try { fix = await draftAeoFix(brand, category, location, report.missing); } catch { /* fix optional */ }

    return NextResponse.json({ ok: true, report, fix, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Visibility check failed — check the AI key." }, { status: 200 });
  }
}
