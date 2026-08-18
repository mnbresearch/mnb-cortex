import { NextResponse } from "next/server";
import { draftOutreach } from "@/lib/ai/act";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundForMode } from "@/lib/credits";
import { getUserAndOrg, getBusinessContext } from "@/lib/data";
import { sendEmail } from "@/lib/email";
import { brandFrom } from "@/lib/branded-email";
import { enforce } from "@/lib/ratelimit";
import { sendText, sendTemplate, hasWhatsApp, whatsappSetupHint } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({} as any));
    const op = String(b.op || "");

    if (op === "draft") {
      const gate = await chargeForMode("act");
      if (!gate.ok) { const d = creditDenial(gate, "Drafting"); return NextResponse.json(d.body, { status: d.status }); }
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
      if (!to || !EMAIL_RE.test(to) || !subject || !body.trim()) return NextResponse.json({ ok: false, error: "A valid recipient, subject and message are required." }, { status: 200 });

      // Outbound mail leaves on OUR verified domain, so a throwaway trial account
      // must not be able to use this as an unlimited bulk mailer. Cap per
      // workspace per day, then bill it like any other action.
      const overLimit = await enforce([{ key: `act:send:org:${orgId}`, limit: 50, windowSecs: 86_400 }]);
      if (overLimit) {
        return NextResponse.json({ ok: false, rateLimited: true, error: "You've reached the daily send limit for this workspace (50). It resets in 24 hours." }, { status: 429 });
      }
      const gate = await chargeForMode("act");
      if (!gate.ok) { const d = creditDenial(gate, "Sending an email"); return NextResponse.json(d.body, { status: d.status }); }

      const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;font-size:15px;line-height:1.65;color:#111">
        ${body.split("\n").map((l) => `<p style="margin:0 0 10px">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("")}
      </div>`;
      const res = await sendEmail(to, subject, html, { from: brandFrom(), replyTo: user.email || undefined });
      if (!res.sent) {
        if (gate.enforced) await refundForMode("act"); // nothing left the building — don't bill
        return NextResponse.json({ ok: false, error: res.reason || "Send failed. Check that email is configured (RESEND_API_KEY)." }, { status: 200 });
      }
      return NextResponse.json({ ok: true, to, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
    }

    if (op === "whatsapp") {
      const { user, orgId } = await getUserAndOrg();
      if (!user || !orgId) return NextResponse.json({ ok: false, error: "Please sign in to send." }, { status: 200 });

      // Honest, actionable state when the operator hasn't connected Meta yet.
      if (!hasWhatsApp()) {
        return NextResponse.json({ ok: false, needsSetup: true, error: whatsappSetupHint() }, { status: 200 });
      }

      const to = String(b.to || "").trim();
      const text = String(b.body || "").trim();
      const template = String(b.template || "").trim();
      if (!to || (!text && !template)) {
        return NextResponse.json({ ok: false, error: "A recipient and a message (or template name) are required." }, { status: 200 });
      }

      // Same per-workspace daily cap as email — this leaves on our number.
      const over = await enforce([{ key: `act:whatsapp:org:${orgId}`, limit: 100, windowSecs: 86_400 }]);
      if (over) return NextResponse.json({ ok: false, rateLimited: true, error: "Daily WhatsApp limit reached for this workspace (100)." }, { status: 429 });

      const gate = await chargeForMode("act");
      if (!gate.ok) { const d = creditDenial(gate, "Sending a WhatsApp message"); return NextResponse.json(d.body, { status: d.status }); }

      const res = template
        ? await sendTemplate(to, template, Array.isArray(b.variables) ? b.variables.map(String) : [])
        : await sendText(to, text);

      if (!res.sent) {
        if (gate.enforced) await refundForMode("act");
        return NextResponse.json({ ok: false, needsSetup: res.needsSetup, error: res.error }, { status: 200 });
      }
      return NextResponse.json({ ok: true, to, id: res.id, charged: gate.enforced ? gate.cost : 0 });
    }

    return NextResponse.json({ ok: false, error: "Unknown operation." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed." }, { status: 200 });
  }
}
