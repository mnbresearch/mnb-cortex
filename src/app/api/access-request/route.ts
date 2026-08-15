import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { ADMIN_EMAIL } from "@/lib/config";
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

    // Persist as a lead (best-effort) so nothing is lost even if email fails.
    if (hasSupabase()) {
      try { await createClient().from("leads").insert({ name, email, phone: phone || null, plan: "access-request", source: "access-request" }); } catch {}
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

    return NextResponse.json({ ok: true, notified: adminRes.sent, confirmed: userRes.sent, contactUrl: CONTACT_URL, adminReason: adminRes.reason });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed", contactUrl: CONTACT_URL }, { status: 200 });
  }
}
