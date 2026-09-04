import "server-only";

/**
 * WhatsApp, for collections only — and deliberately stricter than the rest of
 * the product.
 *
 * TWO THINGS WERE WRONG, AND THEY COMPOUND.
 *
 * (1) IT SENT AS US.
 *
 * `whatsappConfigFor(orgId)` falls back to `whatsappConfig()`, the PLATFORM
 * credentials, when a workspace has not connected its own Meta account. That
 * fallback is right for our own product notifications and completely wrong
 * here. It meant a debtor of Sharma Steel received a demand for money from MNB
 * Research's WhatsApp number — a business they have never dealt with, about a
 * debt they do not owe us. Two consequences follow:
 *
 *   - Their reply ("already paid, UTR 4471") arrives on OUR number. The owner
 *     never sees it, so Cortex chases again. That is the complaint.
 *   - Every workspace's dunning leaves one number. Meta rates WhatsApp senders
 *     on recipient blocks and reports. A handful of strangers marking one
 *     number as spam takes that number's quality rating down, and a low rating
 *     throttles or bans it — for every customer at once, including their OTPs.
 *
 * Collections therefore requires the workspace's OWN credentials. No fallback.
 * If they have not connected Meta, the reminder does not go by WhatsApp.
 *
 * (2) IT USED FREE-FORM TEXT, WHICH CANNOT WORK FOR THIS.
 *
 * The send path called `sendText`. Meta permits free-form only inside a
 * 24-hour window that the RECIPIENT opened by messaging the business first. A
 * debtor being chased has, by definition, not done that. So every send returned
 * error 131047 and failed — and because the breaker trips on
 * `failed > 0 && sent === 0`, a permanently-impossible WhatsApp send switched
 * the whole policy off, taking EMAIL down with it. The one channel that worked
 * was disabled by the one that never could.
 *
 * A conversation with a cold recipient can only be opened with a template Meta
 * approved in advance. We cannot create that template for a customer — it is
 * submitted from their own Business Manager and reviewed by Meta — so the
 * honest thing is to require them to name theirs, tell them exactly how to get
 * one, and refuse to pretend in the meantime.
 *
 * WHAT A REFUSAL MUST NOT DO.
 *
 * "You have not set this up" is not a delivery failure. It will be true on
 * every run until the customer acts, so counting it toward the breaker would
 * guarantee the policy switches itself off. Refusals here are returned as
 * `setup: true` and the caller records them as `skipped`, which the breaker
 * does not count. Only real transport failures count.
 */

import type { SendResult } from "@/lib/whatsapp";

export type WaGate =
  | { ok: true; template: string; lang: string }
  | { ok: false; setup: true; reason: string };

/**
 * The template's approved body must contain the four things a reminder needs,
 * in this order, because Meta templates are positional: {{1}}..{{4}}.
 *
 * Documented here and in SETUP.md so a customer submits a template that this
 * code can actually fill. The suggested body:
 *
 *   "Hello {{1}}, this is a payment reminder from {{2}}. Invoice {{3}} for
 *    {{4}} is now past its due date. If you have already paid, please ignore
 *    this message or reply with the payment reference."
 *
 * Utility category, not Marketing — a payment reminder for an existing
 * transaction is a utility message, it is cheaper, and it is far less likely to
 * be rejected on review.
 */
export const TEMPLATE_VARIABLES = ["party", "businessName", "invoiceNo", "amount"] as const;

export const TEMPLATE_HELP =
  "WhatsApp will not let any business message someone who has not messaged them first, " +
  "unless the message uses a template Meta approved in advance. Create one in Meta " +
  "Business Manager → WhatsApp Manager → Message templates, category Utility, with four " +
  "variables in this order: customer name, your business name, invoice number, amount. " +
  "Once Meta approves it (usually under an hour), put its exact name in Collections → " +
  "Settings. See SETUP.md → WhatsApp for the full walkthrough.";

/**
 * May this workspace send collections messages over WhatsApp, and with what?
 *
 * Checks the workspace's own credentials directly rather than going through
 * `whatsappConfigFor`, because that function's platform fallback is the bug.
 */
export async function collectionsWhatsAppGate(
  orgId: string,
  templateName?: string | null,
  lang?: string | null,
): Promise<WaGate> {
  const template = String(templateName || "").trim();

  let own = false;
  try {
    const { credentialsFor } = await import("@/lib/credentials");
    const c = await credentialsFor(orgId, "whatsapp");
    own = Boolean(String(c?.api_key || c?.token || "").trim() && String(c?.phone_number_id || "").trim());
  } catch {
    /* Credential store unreachable. Treat as not connected: refusing to send is
       always recoverable, sending from the platform number is not. */
    own = false;
  }

  if (!own) {
    return {
      ok: false, setup: true,
      reason:
        "WhatsApp reminders need your own WhatsApp Business account. Cortex will not send " +
        "these from its own number — your customer would receive a demand for money from a " +
        "company they have never dealt with, and their reply would come to us instead of you. " +
        "Connect Meta on the Integrations page, or send this reminder by email.",
    };
  }

  if (!template) {
    return { ok: false, setup: true, reason: `No approved WhatsApp template is set. ${TEMPLATE_HELP}` };
  }

  /* Meta template names are lowercase alphanumeric with underscores. Catching
     this here turns a confusing API error into a fixable sentence. */
  if (!/^[a-z0-9_]{1,512}$/.test(template)) {
    return {
      ok: false, setup: true,
      reason: `"${template}" is not a valid template name. Meta allows only lowercase letters, numbers and underscores — copy the name exactly as it appears in WhatsApp Manager.`,
    };
  }

  return { ok: true, template, lang: String(lang || "en").trim() || "en" };
}

/**
 * Send one reminder as an approved template.
 *
 * `amount` is passed pre-formatted: template parameters may not contain
 * newlines or runs of more than four spaces, and Meta rejects the whole send
 * (error 132000) rather than trimming.
 */
export async function sendReminderTemplate(opts: {
  orgId: string;
  to: string;
  template: string;
  lang: string;
  party: string;
  businessName: string;
  invoiceNo: string;
  amount: string;
}): Promise<SendResult> {
  const { sendTemplate } = await import("@/lib/whatsapp");
  const clean = (s: string) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 200) || "-";
  return sendTemplate(
    opts.to,
    opts.template,
    [clean(opts.party), clean(opts.businessName), clean(opts.invoiceNo), clean(opts.amount)],
    opts.lang,
    opts.orgId,
  );
}
