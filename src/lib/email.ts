import "server-only";

// Sends real email via Resend when RESEND_API_KEY is set; otherwise reports not-sent.
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts?: { from?: string; replyTo?: string },
): Promise<{ sent: boolean; reason?: string; providerId?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return { sent: false, reason: "no RESEND_API_KEY" };
  try {
    const from = opts?.from || process.env.EMAIL_FROM || "MNB Cortex <noreply@updates.mnbresearch.com>";
    const payload: any = { from, to: [to], subject, html };
    if (opts?.replyTo) payload.reply_to = opts.replyTo;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({} as any));
    return { sent: r.ok, reason: r.ok ? undefined : (j?.message || `resend ${r.status}`), providerId: j?.id };
  } catch (e: any) { return { sent: false, reason: e?.message }; }
}
