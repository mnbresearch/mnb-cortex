import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { ADMIN_EMAIL } from "@/lib/operators";
import { renderBrandedEmail, brandFrom, brandReplyTo } from "@/lib/branded-email";
import { createClient, hasSupabase } from "@/lib/supabase/server";
import { clientIp, contactFormLimits, enforce } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cap = (v: any, n: number) => String(v ?? "").slice(0, n);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const name = cap(body.name, 120).trim();
    const email = cap(body.email, 200).trim();
    const phone = cap(body.phone, 30).trim();
    const { plan, currency, cycle, source } = body;
    const note = cap(body.note, 2000);
    if (!name || !email) return NextResponse.json({ ok: false, error: "Name and email are required." }, { status: 200 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 200 });

    // Unauthenticated and it sends mail from our verified domain — throttle it,
    // or it's a free spam relay against our sender reputation.
    const exceeded = await enforce(contactFormLimits(email, clientIp(req)));
    if (exceeded) {
      return NextResponse.json({
        ok: false, rateLimited: true,
        error: "We've already received your request. Our team will be in touch shortly — or message us on WhatsApp for a faster reply.",
      }, { status: 429 });
    }

    const src = cap(source || "pricing", 40);

    // Where the operator gets notified (defaults to ADMIN_EMAIL; override with LEAD_NOTIFY_EMAIL).
    const notifyTo = process.env.LEAD_NOTIFY_EMAIL || ADMIN_EMAIL;
    const origin = (() => { try { return new URL(req.url).origin; } catch { return "https://cortex.mnbresearch.com"; } })();
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const cur = (currency || "INR").toString().toUpperCase();
    const cyc = cycle === "annual" ? "Annual" : "Monthly";

    // Persist the lead first (best-effort) so nothing is lost even if email fails.
    if (hasSupabase()) {
      try {
        await createClient().from("leads").insert({
          name, email, phone: phone || null,
          plan: `${plan || "Cortex"} · ${cur} · ${cyc}`,
          source: src,
        });
      } catch {}
    }

    const adminBody = `A new prospect requested pricing / access on the MNB Cortex site.

Source: ${src}
Plan requested: ${plan || "—"}
Currency: ${cur}   Billing: ${cyc}
Name: ${name}
Email: ${email}
Phone: ${phone || "—"}${note ? `\nNotes: ${note}` : ""}
Received: ${when} IST

WHAT TO DO NEXT
1. Open your Leads inbox: ${origin}/leads
2. Once they sign up (or you invite them), open Super Admin: ${origin}/superadmin
3. Find their workspace and set the plan + grant credits from the customer manager.

Reply to this email to reach ${name.split(" ")[0] || "them"} directly.`;
    const adminHtml = renderBrandedEmail(adminBody, { preheader: `${plan || "Cortex"} request from ${name} (${cur})` });

    const userBody = `Hi ${name.split(" ")[0] || "there"},

Thanks for your interest in MNB Cortex — the AI COO for your business.

We've received your request for the ${plan || "MNB Cortex"} plan (${cur}, ${cyc}). Our team will reach out shortly to set up your access and answer any questions.

In the meantime, just reply to this email or message us on WhatsApp: https://wa.me/919711488480

Talk soon,
Team MNB Cortex · MNB Research`;
    const userHtml = renderBrandedEmail(userBody, { preheader: "We received your MNB Cortex request" });

    const [adminRes, userRes] = await Promise.all([
      sendEmail(notifyTo, `New request: ${plan || "Cortex"} (${cur}) — ${name}`, adminHtml, { from: brandFrom(), replyTo: email }),
      sendEmail(email, "We received your MNB Cortex request", userHtml, { from: brandFrom(), replyTo: brandReplyTo() }),
    ]);

    return NextResponse.json({ ok: true, notified: adminRes.sent, confirmed: userRes.sent, adminReason: adminRes.reason, userReason: userRes.reason });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 200 });
  }
}
