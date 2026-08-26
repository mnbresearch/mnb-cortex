import "server-only";
import { envKey } from "@/lib/env";
import { brandFrom, brandReplyTo } from "@/lib/branded-email";

/**
 * The single exit point for outbound email.
 *
 * The defaults here used to be a hardcoded "MNB Cortex <noreply@…>" with no
 * reply-to, while branded-email.ts separately defined the real sender
 * ("MNB Cortex by MNB Research <hello@…>", replies to contact@mnbresearch.com).
 * Most callers passed brandFrom() explicitly, but five did not — and one of
 * them was the workspace INVITE. So the single email most likely to be read by
 * someone who has never heard of us arrived from a no-reply address that
 * silently discards the obvious reply, "is this real?".
 *
 * Two senders on one domain also splits the sending reputation that Resend and
 * the receiving providers build up, which is exactly what you don't want in the
 * first months of a domain's life.
 *
 * Defaulting to the branded identity fixes every caller at once. An explicit
 * `from`/`replyTo` still wins, so the deliberate cases (replying to the person
 * who filled in a form) are unchanged.
 *
 * Returns { sent } rather than throwing: callers are usually mid-transaction
 * and a failed notification must not roll back the thing it was announcing.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  /**
   * `replyTo: null` means "send with NO reply-to header". That distinction
   * matters: on the one path where a customer emails their own customer, an
   * absent reply-to must not silently become ours, or we would receive
   * another company's correspondence.
   */
  opts?: { from?: string; replyTo?: string | null },
): Promise<{ sent: boolean; reason?: string; providerId?: string }> {
  const key = envKey("RESEND_API_KEY");
  if (!key || !to) return { sent: false, reason: "no RESEND_API_KEY" };
  try {
    const from = opts?.from || process.env.EMAIL_FROM || brandFrom();
    const replyTo = opts?.replyTo === null ? "" : (opts?.replyTo || brandReplyTo());
    const payload: any = { from, to: [to], subject, html };
    if (replyTo) payload.reply_to = replyTo;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({} as any));
    return { sent: r.ok, reason: r.ok ? undefined : (j?.message || `resend ${r.status}`), providerId: j?.id };
  } catch (e: any) { return { sent: false, reason: e?.message }; }
}
