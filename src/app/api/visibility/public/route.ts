import { NextResponse } from "next/server";
import { runVisibility, defaultPrompts } from "@/lib/ai/visibility";
import { sendEmail } from "@/lib/email";
import { ADMIN_EMAIL } from "@/lib/config";
import { renderBrandedEmail, brandFrom, brandReplyTo } from "@/lib/branded-email";
import { createClient, hasSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({} as any));
    const name = String(b.name || "").trim();
    const email = String(b.email || "").trim();
    const brand = String(b.brand || "").trim();
    const category = String(b.category || "").trim();
    const location = String(b.location || "").trim();
    if (!name || !email || !brand) return NextResponse.json({ ok: false, error: "Name, email and brand are required." }, { status: 200 });

    // Capture the lead (best-effort).
    if (hasSupabase()) {
      try { await createClient().from("leads").insert({ name, email, phone: null, plan: `AI Visibility · ${brand}`, source: "ai-visibility" }); } catch {}
    }

    // Teaser: 3 prompts only (keeps the public endpoint cheap).
    const report = await runVisibility(brand, [], defaultPrompts(category, location), 3);
    const shown = report.results.filter((r) => r.mentioned).length;

    // Notify the operator (best-effort) so warm leads surface immediately.
    try {
      const origin = (() => { try { return new URL(req.url).origin; } catch { return "https://cortex.mnbresearch.com"; } })();
      const body = `A prospect ran a free AI Visibility check.

Name: ${name}
Email: ${email}
Brand: ${brand}
Category: ${category || "—"}   Location: ${location || "—"}
AI Visibility score: ${report.score}/100 (${shown}/${report.results.length} answers)
Engine: ${report.engine}

See all leads: ${origin}/leads
Reply to this email to reach ${name.split(" ")[0] || "them"} directly.`;
      await sendEmail(process.env.LEAD_NOTIFY_EMAIL || ADMIN_EMAIL, `AI Visibility lead: ${brand} — ${name}`, renderBrandedEmail(body, { preheader: `AI Visibility check by ${name}` }), { from: brandFrom(), replyTo: email });
    } catch {}

    return NextResponse.json({
      ok: true,
      brand,
      score: report.score,
      engine: report.engine,
      grounded: report.grounded,
      shown, total: report.results.length,
      competitors: report.competitors.slice(0, 5),
      sample: report.results[0] ? { prompt: report.results[0].prompt, mentioned: report.results[0].mentioned, answer: (report.results[0].answer || "").slice(0, 320) } : null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Check failed — please try again." }, { status: 200 });
  }
}
