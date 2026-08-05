import { NextResponse } from "next/server";
import { draftOutreach } from "@/lib/ai/act";
import { chargeForMode } from "@/lib/credits";
import { getUserAndOrg, getBusinessContext } from "@/lib/data";
import { sendEmail } from "@/lib/email";
import { brandFrom } from "@/lib/branded-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({} as any));
    const op = String(b.op || "");

    if (op === "draft") {
      const gate = await chargeForMode("act");
      if (!gate.ok) return NextResponse.json({ ok: false, outOfCredits: true, cost: gate.cost, balance: gate.balance,
        error: `You're out of AI credits. Drafting costs ${gate.cost} credits (balance ${gate.balance}).` }, { status: 402 });
      let context = "";
      try { context = await getBusinessContext(); } catch {}
      const draft = await draftOutreach(String(b.kind || "custom"), String(b.brief || ""), context);
      if (!draft) return NextResponse.json({ ok: false, error: "Couldn't draft that — check the AI key." }, { status: 200 });
      return NextResponse.json({ ok: true, draft, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
    }

    if (op === "send") {
      // Any authenticated workspace member may send from their own workspace.
      const { user, orgId } = await getUserAndOrg();
      if (!user || !orgId) return NextResponse.json({ ok: false, error: "Please sign in to send." }, { status: 200 });
      const to = String(b.to || "").trim();
      const subject = String(b.subject || "").trim();
      const body = String(b.body || "");
      if (!to || !to.includes("@") || !subject || !body.trim()) return NextResponse.json({ ok: false, error: "A valid recipient, subject and message are required." }, { status: 200 });

      const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;font-size:15px;line-height:1.65;color:#111">
        ${body.split("\n").map((l) => `<p style="margin:0 0 10px">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("")}
      </div>`;
      const res = await sendEmail(to, subject, html, { from: brandFrom(), replyTo: user.email || undefined });
      if (!res.sent) return NextResponse.json({ ok: false, error: res.reason || "Send failed. Check that email is configured (RESEND_API_KEY)." }, { status: 200 });
      return NextResponse.json({ ok: true, to });
    }

    return NextResponse.json({ ok: false, error: "Unknown operation." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed." }, { status: 200 });
  }
}
