import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { verifySvix } from "@/lib/svix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend Inbound webhook (email.received). The webhook carries METADATA ONLY,
 * so we fetch the full body from the Received Emails API before storing.
 * Public route — must be reachable without auth. Signature is verified when a
 * secret exists in app_settings; a forged/invalid signature is rejected (400).
 */
export async function POST(req: Request) {
  const raw = await req.text(); // raw body needed for signature verification
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ ok: true, note: "not configured" });

  // Load any stored webhook secrets (one per operator workspace).
  const { data: secrets } = await sb.from("app_settings").select("org_id,value").eq("key", "resend_webhook_secret");
  const secretRows = ((secrets as any[]) || []).filter((s) => s.value);

  const headers = {
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
  };

  let verified = false;
  let secretOrg: string | null = null;
  if (secretRows.length > 0) {
    for (const s of secretRows) {
      if (verifySvix(raw, headers, s.value)) { verified = true; secretOrg = s.org_id; break; }
    }
    if (!verified) {
      // A secret is configured but the signature didn't match → forged. Reject.
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 400 });
    }
  }

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); } // malformed → ack, don't retry-storm

  if (payload?.type !== "email.received") return NextResponse.json({ ok: true, ignored: payload?.type });

  const data = payload.data || {};
  const emailId: string = data.email_id || data.id || "";
  const fromEmail: string = (data.from?.address || data.from || "").toString().toLowerCase();
  const toEmail: string = (Array.isArray(data.to) ? data.to[0]?.address || data.to[0] : data.to?.address || data.to || "").toString();
  let subject: string = data.subject || "";
  let text = ""; let html = "";

  // Fetch the full message body.
  if (emailId && process.env.RESEND_API_KEY) {
    try {
      const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
      if (r.ok) { const j = await r.json(); text = j.text || ""; html = j.html || ""; subject = j.subject || subject; }
    } catch { /* store metadata even if body fetch fails */ }
  }

  // Link to the most recent campaign recipient with this sender address.
  let recipientId: string | null = null, campaignId: string | null = null, org: string | null = secretOrg;
  if (fromEmail) {
    const { data: rec } = await sb.from("campaign_recipients").select("id,campaign_id,org_id").ilike("email", fromEmail).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (rec) { recipientId = (rec as any).id; campaignId = (rec as any).campaign_id; org = (rec as any).org_id; }
  }

  // Idempotent insert on resend_email_id.
  try {
    await sb.from("email_replies").upsert({
      org_id: org, resend_email_id: emailId || `noid-${Date.now()}`, campaign_id: campaignId, recipient_id: recipientId,
      from_email: fromEmail, to_email: toEmail, subject, text, html, verified,
    }, { onConflict: "resend_email_id", ignoreDuplicates: true });
    if (recipientId) await sb.from("campaign_recipients").update({ status: "replied" }).eq("id", recipientId);
  } catch { /* never 500 the webhook */ }

  return NextResponse.json({ ok: true, verified, linked: Boolean(recipientId) });
}
