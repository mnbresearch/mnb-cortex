import "server-only";
// Sends real email via Resend when RESEND_API_KEY is set; otherwise reports not-sent.
export async function sendEmail(to: string, subject: string, html: string): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return { sent: false, reason: "no RESEND_API_KEY" };
  try {
    const from = process.env.EMAIL_FROM || "MNB Cortex <noreply@updates.mnbresearch.com>";
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    return { sent: r.ok, reason: r.ok ? undefined : `resend ${r.status}` };
  } catch (e: any) { return { sent: false, reason: e?.message }; }
}
