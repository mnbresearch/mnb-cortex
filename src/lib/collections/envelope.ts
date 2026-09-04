import "server-only";

/**
 * The envelope a payment reminder goes out in.
 *
 * THE BUG THIS FIXES, WHICH WOULD HAVE BEEN THE FIRST COMPLAINT.
 *
 * Collections was sending through `brandFrom()` and `renderBrandedEmail()` —
 * the same wrapper as our own product mail. So a debtor of a Cortex customer
 * received a demand for money that:
 *
 *   - came from "MNB Cortex by MNB Research", a company they have never heard of
 *   - carried our marketing header, our badges and our tagline
 *   - said "you can reply to this email — it reaches a real person at
 *     contact@mnbresearch.com"
 *
 * while the body was signed "Regards, Sharma Steel". Three things follow, all
 * bad. The debtor's reply — usually "already paid, UTR 1234" — lands in OUR
 * inbox and the owner never sees it, so Cortex chases again. Every customer's
 * dunning mail leaves one shared domain, so a stranger's spam complaint burns
 * deliverability for every other customer's transactional mail. And the page
 * promises the message goes out "in your name", which it did not.
 *
 * WHAT THIS DOES INSTEAD.
 *
 * The sender identifies the CUSTOMER'S business, the reply-to is the customer's
 * own address, and the body is their text with a single quiet line saying it was
 * sent via Cortex. No badges, no tagline, no marketing.
 *
 * Where the workspace has connected its own verified sending domain, the mail
 * leaves as them entirely. Where it has not, we send on their behalf from a
 * clearly-labelled address — "Sharma Steel (via Cortex)" — which is honest
 * about the relay and still puts the right name in the inbox.
 */

export type Envelope = { from: string; replyTo: string | null; html: string };

/** Strip anything that could break an RFC 5322 display name. */
function safeName(raw: string): string {
  return String(raw || "")
    .replace(/[<>"\\\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Accounts";
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Build the envelope for one reminder.
 *
 * `ownFrom` is the workspace's own verified sender, when it has connected one.
 * `replyTo` is the address the owner wants replies at — their own, always.
 */
export function reminderEnvelope(opts: {
  businessName: string;
  body: string;
  ownFrom?: string | null;
  replyTo?: string | null;
}): Envelope {
  const name = safeName(opts.businessName);

  /*
    Relay address. Deliberately a distinct subdomain from our product mail, so a
    spam complaint about one customer's dunning cannot take down another
    customer's password reset or weekly brief.
  */
  const relay = process.env.COLLECTIONS_FROM_ADDRESS || "reminders@updates.mnbresearch.com";

  const from = opts.ownFrom?.trim()
    ? opts.ownFrom.trim()
    : `${name} (via Cortex) <${relay}>`;

  /*
    A reply-to we do not control is better than one we do. If the workspace has
    given no address, send with NO reply-to rather than defaulting to ours —
    lib/email.ts documents that `null` means exactly that, and receiving another
    company's debt correspondence is the outcome to avoid.
  */
  const replyTo = opts.replyTo?.trim() || null;

  const paragraphs = escapeHtml(opts.body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;white-space:pre-wrap">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  /*
    Plain, and plain on purpose.

    This is a letter from one business to another about money. A branded
    template with someone else's logo on it reads as a mass mailing, which is
    both less likely to be paid and more likely to be reported. The only thing
    added is one line of provenance, because a recipient is entitled to know why
    an unfamiliar domain is in the headers.
  */
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:28px;font:15px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111">
    ${paragraphs}
    <hr style="border:0;border-top:1px solid #eee;margin:22px 0 12px"/>
    <p style="margin:0;font-size:12px;color:#888">
      Sent by ${escapeHtml(name)} using Cortex. If you believe you received this in error or have already paid,
      please reply to this email and ${escapeHtml(name)} will pick it up.
    </p>
  </div></body></html>`;

  return { from, replyTo, html };
}
