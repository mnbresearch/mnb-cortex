import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { ADMIN_EMAIL } from "@/lib/operators";
import { renderBrandedEmail, brandFrom, brandReplyTo } from "@/lib/branded-email";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { clientIp, contactFormLimits, enforce } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTACT_URL = "https://www.mnbresearch.com/contactus";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cap = (v: any, n: number) => String(v ?? "").slice(0, n);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const name = cap(body.name, 120).trim();
    const email = cap(body.email, 200).trim();
    const company = cap(body.company, 160).trim();
    const phone = cap(body.phone, 30).trim();
    const message = cap(body.message, 2000);
    if (!name || !email) return NextResponse.json({ ok: false, error: "Name and email are required." }, { status: 200 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email address.", contactUrl: CONTACT_URL }, { status: 200 });

    // Unauthenticated and it sends mail from our verified domain — throttle it,
    // or it's a free spam relay against our sender reputation.
    const exceeded = await enforce(contactFormLimits(email, clientIp(req)));
    if (exceeded) {
      return NextResponse.json({
        ok: false, rateLimited: true, contactUrl: CONTACT_URL,
        error: "We've already received your request — our team will be in touch shortly.",
      }, { status: 429 });
    }

    const when = new Date().toLocaleString("en-IN");

    /*
      PERSIST THE LEAD — ALL OF IT, AND KNOW WHETHER IT LANDED.

      The comment here said "so nothing is lost even if email fails" while the
      row carried four of the six fields collected. `company` and `message` were
      parsed, length-capped, and written into the operator's notification email
      only — so the two fields that say WHO this is and WHAT they want existed
      solely in the prose of an email, where nothing can query them. The sibling
      route (api/inquiry) already persists company and note and carries a long
      comment about why dropping them was a bug; this route was never updated.

      The `catch {}` was the other half: a wholly failed insert was invisible,
      and the caller was still told ok:true. For a pre-revenue product the
      inbound lead is the single most valuable object in the system, so losing
      one silently is the worst affordable failure here.

      The two-step insert mirrors api/inquiry: try the full row, and if the
      column set is not migrated yet fall back to the original four rather than
      losing the lead entirely. A lead with less detail beats no lead.
    */
    let stored = false;
    if (hasSupabase()) {
      const row: Record<string, any> = {
        name, email, phone: phone || null,
        plan: "access-request", source: "access-request",
        company: company || null,
        note: message || null,
      };
      try {
        const { error } = await createClient().from("leads").insert(row);
        if (!error) {
          stored = true;
        } else {
          const { company: _c, note: _n, ...core } = row;
          const { error: e2 } = await createClient().from("leads").insert(core);
          stored = !e2;
          if (e2) console.error("[access-request] lead not stored —", e2.message, "(first attempt:", error.message, ")");
        }
      } catch (e: any) {
        console.error("[access-request] lead insert threw —", e?.message);
      }
    }

    // Notify the operator.
    const adminBody = `A new person has requested access to MNB Cortex.

Name: ${name}
Email: ${email}
Company: ${company || "—"}
Phone: ${phone || "—"}
Message: ${message || "—"}
Received: ${when}

Reply to this email to reach them directly.`;
    const adminHtml = renderBrandedEmail(adminBody, { preheader: `Access request from ${name}` });

    // Confirm to the requester.
    const userBody = `Hi ${name.split(" ")[0] || "there"},

Thanks for your interest in MNB Cortex — the AI COO for your business.

Our team has received your request and will reach out shortly with access. In the meantime, you can tell us more about your business here: ${CONTACT_URL}

Talk soon,
Team MNB Research`;
    const userHtml = renderBrandedEmail(userBody, { preheader: "We received your access request" });

    const [adminRes, userRes] = await Promise.all([
      sendEmail(ADMIN_EMAIL, `New access request: ${name}`, adminHtml, { from: brandFrom(), replyTo: email }),
      sendEmail(email, "Your MNB Cortex access request", userHtml, { from: brandFrom(), replyTo: brandReplyTo() }),
    ]);

    /*
      `ok` NOW MEANS "WE HAVE YOUR REQUEST", NOT "THE HANDLER REACHED ITS END".

      This returned a flat ok:true. sendEmail never throws — it returns
      { sent: false, reason } — so a request where BOTH emails failed and the
      database insert failed returned success, and contact-form.tsx renders
      "Thanks, {name}. A confirmation is on its way to {email}." on `ok` alone.
      The person walked away believing they had reached us when nothing had
      recorded them and nothing had been sent. That is the one outcome this form
      exists to prevent.

      Three states now, and they are distinguishable:

        - the operator was notified, or the lead is in the database → ok. We
          genuinely have it, whichever of the two worked.
        - neither → ok:false with the WhatsApp fallback, because the honest
          answer is that the message did not get through.
        - `confirmed` says whether the requester's own confirmation email sent,
          so the UI can stop promising one that did not. It was already returned
          and read by nobody.
    */
    const captured = adminRes.sent || stored;
    if (!captured) {
      console.error("[access-request] NOT captured — email:", adminRes.reason || "?", "| db:", hasSupabase() ? "insert failed" : "no supabase");
      return NextResponse.json({
        ok: false,
        error: "We could not record your request just now. Please message us on WhatsApp — that always reaches us.",
        contactUrl: CONTACT_URL,
      }, { status: 200 });
    }

    return NextResponse.json({
      ok: true,
      notified: adminRes.sent,
      stored,
      confirmed: userRes.sent,
      contactUrl: CONTACT_URL,
      adminReason: adminRes.reason,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed", contactUrl: CONTACT_URL }, { status: 200 });
  }
}
