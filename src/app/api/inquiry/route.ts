import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { ADMIN_EMAIL } from "@/lib/config";
import { createClient, hasSupabase } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { name, email, phone, plan } = await req.json();
    if (!name || !email) return NextResponse.json({ ok: false, error: "Name and email are required." }, { status: 200 });
    // Persist the lead (best-effort) so nothing is lost even if email fails
    if (hasSupabase()) { try { await createClient().from("leads").insert({ name, email, phone, plan, source: "pricing" }); } catch {} }
    const when = new Date().toLocaleString("en-IN");
    const adminHtml = `<h2>New pricing inquiry — MNB Cortex</h2>
      <p><b>Plan:</b> ${plan || "—"}</p>
      <p><b>Name:</b> ${name}</p>
      <p><b>Email:</b> ${email}</p>
      <p><b>Phone:</b> ${phone || "—"}</p>
      <p><b>Received:</b> ${when}</p>`;
    const userHtml = `<h2>Thanks, ${name}!</h2>
      <p>We've received your interest in the <b>${plan || "MNB Cortex"}</b> plan. Our team will reach out shortly.</p>
      <p>In the meantime, you can reply to this email or message us on WhatsApp.</p>
      <p>— Team MNB Cortex, the AI COO for SMEs</p>`;

    const [adminRes, userRes] = await Promise.all([
      sendEmail(ADMIN_EMAIL, `New inquiry: ${plan || "Cortex"} — ${name}`, adminHtml),
      sendEmail(email, "We received your MNB Cortex inquiry", userHtml),
    ]);
    return NextResponse.json({ ok: true, adminSent: adminRes.sent, userSent: userRes.sent, adminReason: adminRes.reason, userReason: userRes.reason });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 200 });
  }
}
