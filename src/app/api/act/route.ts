import { NextResponse } from "next/server";
import { draftOutreach } from "@/lib/ai/act";
import { creditDenial } from "@/lib/api-guard";
import { chargeForMode, refundIfCharged, type ChargeResult } from "@/lib/credits";
import { getUserAndOrg, getBusinessContext } from "@/lib/data";
import { sendEmail } from "@/lib/email";
import { brandFrom } from "@/lib/branded-email";
import { enforce } from "@/lib/ratelimit";
import { sendText, sendTemplate, hasWhatsAppFor, whatsappSetupHint } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
 * Executes an AI-chosen action; model call plus writes.
 *
 * Every other AI route in this app sets an explicit budget (30-300s); these
 * seven did not, so they silently inherited whatever the platform default
 * happens to be. That default is not ours to control and has changed between
 * Vercel plans and runtimes, which is a poor thing to hang the product's
 * headline feature on: the failure mode is a 504 with no log line, and the
 * user just sees a button that did nothing.
 */
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  /*
    ONE GATE, AT FUNCTION SCOPE, SO THE CATCH CAN REACH IT.

    Each of the three branches below declared its own `const gate`, which meant
    the outer catch had nothing to refund. draftOutreach(), sendEmail(),
    sendText() and sendTemplate() are all network calls that can throw after
    the charge, and every one of those throws kept the customer's credits and
    returned a bare "Failed." All three ops charge the same "act" mode, so a
    single hoisted gate covers them.
  */
  let gate: ChargeResult | null = null;
  try {
    const b = await req.json().catch(() => ({} as any));
    const op = String(b.op || "");

    if (op === "draft") {
      gate = await chargeForMode("act");
      if (!gate.ok) { const d = creditDenial(gate, "Drafting"); return NextResponse.json(d.body, { status: d.status }); }
      let context = "";
      try { context = await getBusinessContext(); } catch {}
      const draft = await draftOutreach(String(b.kind || "custom"), String(b.brief || ""), context);
      if (!draft) {
        // No draft is no product. This branch billed for it.
        await refundIfCharged(gate, "act");
        return NextResponse.json({ ok: false, error: "Couldn't draft that — check the AI key. Your credits have not been used." }, { status: 200 });
      }
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
      gate = await chargeForMode("act");
      if (!gate.ok) { const d = creditDenial(gate, "Sending an email"); return NextResponse.json(d.body, { status: d.status }); }

      const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;font-size:15px;line-height:1.65;color:#111">
        ${body.split("\n").map((l) => `<p style="margin:0 0 10px">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("")}
      </div>`;
      // This is a customer emailing THEIR customer, so replies must go to them.
      // `|| undefined` used to mean "no reply-to"; now that sendEmail defaults
      // to our own mailbox, that same expression would quietly route a tenant's
      // customer's reply to MNB Research. A signed-in Supabase user essentially
      // always has an email, but "essentially always" is not a basis for
      // routing someone else's correspondence, so it is explicit.
      const senderReplyTo = user.email || null;
      const res = await sendEmail(to, subject, html, { from: brandFrom(), replyTo: senderReplyTo });
      if (!res.sent) {
        await refundIfCharged(gate, "act"); // nothing left the building — don't bill
        return NextResponse.json({ ok: false, error: (res.reason || "Send failed. Check that email is configured (RESEND_API_KEY).") + " Your credits have not been used." }, { status: 200 });
      }
      return NextResponse.json({ ok: true, to, charged: gate.enforced ? gate.cost : 0, balance: gate.balance });
    }

    if (op === "whatsapp") {
      const { user, orgId } = await getUserAndOrg();
      if (!user || !orgId) return NextResponse.json({ ok: false, error: "Please sign in to send." }, { status: 200 });

      // Honest, actionable state when THIS workspace hasn't connected Meta yet.
      // Checked per workspace, not globally: WhatsApp is bring-your-own-account.
      if (!(await hasWhatsAppFor(orgId))) {
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

      gate = await chargeForMode("act");
      if (!gate.ok) { const d = creditDenial(gate, "Sending a WhatsApp message"); return NextResponse.json(d.body, { status: d.status }); }

      const res = template
        ? await sendTemplate(to, template, Array.isArray(b.variables) ? b.variables.map(String) : [], "en", orgId)
        : await sendText(to, text, orgId);

      if (!res.sent) {
        await refundIfCharged(gate, "act");
        return NextResponse.json({ ok: false, needsSetup: res.needsSetup, error: (res.error || "Could not send.") + " Your credits have not been used." }, { status: 200 });
      }
      return NextResponse.json({ ok: true, to, id: res.id, charged: gate.enforced ? gate.cost : 0 });
    }

    return NextResponse.json({ ok: false, error: "Unknown operation." }, { status: 400 });
  } catch (e: any) {
    await refundIfCharged(gate, "act");
    return NextResponse.json({ ok: false, error: (e?.message || "Failed.") + " Your credits have not been used." }, { status: 200 });
  }
}
