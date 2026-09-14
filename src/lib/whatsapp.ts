import "server-only";
import { envKey } from "@/lib/env";

/**
 * WhatsApp via the Meta Cloud API.
 *
 * "Real email / WhatsApp automations" is a Premium bullet, and the product only
 * ever produced wa.me links — which open WhatsApp on YOUR phone for you to
 * press send. That is not automation.
 *
 * This is the real send path. It cannot work until the operator supplies their
 * own Meta credentials, because WhatsApp Business requires a verified business,
 * a phone number and — for anything outside a 24-hour customer-initiated window
 * — message templates that Meta approves individually. No amount of code
 * removes that; see SETUP.md.
 *
 * Everything below is complete and will work the moment the two env vars exist.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type WhatsAppConfig = { token: string; phoneNumberId: string };

/**
 * Platform-wide credentials from the environment.
 *
 * This is the FALLBACK. WhatsApp is bring-your-own-account: each workspace
 * connects its own Meta app on /integrations so messages come from its own
 * business number. Use whatsappConfigFor(orgId) on any customer-facing path —
 * sending every tenant's messages from one shared number would be both wrong
 * and a fast route to a Meta ban.
 */
export function whatsappConfig(): WhatsAppConfig | null {
  const token = envKey("WHATSAPP_TOKEN");
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
}

export function hasWhatsApp(): boolean {
  return whatsappConfig() !== null;
}

/**
 * THE OPERATOR'S hint. Names the missing environment variables.
 *
 * Kept, and correct, for exactly one caller: /setup, which is super-admin only
 * and exists to tell ME which platform credentials are absent.
 *
 * It must NOT be shown to a customer, which is what it was doing — see
 * whatsappCustomerHint() below.
 */
export function whatsappSetupHint(): string {
  const missing: string[] = [];
  if (!envKey("WHATSAPP_TOKEN")) missing.push("WHATSAPP_TOKEN");
  if (!(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim()) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  return missing.length
    ? `WhatsApp sending needs ${missing.join(" and ")}. Create a Meta WhatsApp Business app, then see SETUP.md → WhatsApp.`
    : "WhatsApp is configured.";
}

/**
 * WHAT THE CUSTOMER SEES. Three things the operator hint got wrong for them.
 *
 * sendText() and sendTemplate() returned whatsappSetupHint() as their user-
 * facing `error`, so a tenant who tried to send a WhatsApp message was told:
 *
 *   "WhatsApp sending needs WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.
 *    Create a Meta WhatsApp Business app, then see SETUP.md → WhatsApp."
 *
 * Every clause of that is wrong for them:
 *
 *   - WHATSAPP_TOKEN is a server environment variable on OUR deployment. A
 *     customer cannot set it, so the message asks them to do the impossible
 *     and leaks our configuration naming while doing it.
 *   - SETUP.md is a file in this repository. They do not have it.
 *   - and the action they SHOULD take is different: this module's own header
 *     says "WhatsApp is bring-your-own-account: each workspace connects its
 *     own Meta app on /integrations". whatsappConfigFor() implements exactly
 *     that. The message just never described it.
 *
 * So the failure was telling the customer to fix a thing that is not their
 * thing, instead of the one thing that is.
 */
export function whatsappCustomerHint(): string {
  return "WhatsApp isn't connected for this workspace yet. Connect WhatsApp Business on the Integrations page "
    + "with your Meta permanent access token and phone number ID — messages then send from your own business number.";
}

/** E.164 without the plus, which is what the Graph API wants. Assumes India when no country code. */
export function normalisePhone(raw: string): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 && /^[6-9]/.test(d)) return "91" + d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export type SendResult = { sent: boolean; id?: string; error?: string; needsSetup?: boolean };

/**
 * The workspace's OWN WhatsApp credentials, falling back to the platform ones.
 *
 * /integrations already collected a "Permanent access token" and "Phone number
 * ID" for WhatsApp and encrypted them — and nothing ever read them back, so a
 * customer who connected their Meta account saw no change in behaviour. This is
 * what makes that connection actually do something.
 */
export async function whatsappConfigFor(orgId?: string | null): Promise<WhatsAppConfig | null> {
  if (orgId) {
    try {
      const { credentialsFor } = await import("@/lib/credentials");
      const c = await credentialsFor(orgId, "whatsapp");
      const token = String(c?.api_key || c?.token || "").trim();
      const phoneNumberId = String(c?.phone_number_id || "").trim();
      if (token && phoneNumberId) return { token, phoneNumberId };
    } catch { /* fall back to the platform account below */ }
  }
  return whatsappConfig();
}

/** True when THIS workspace can send — its own account, or the platform one. */
export async function hasWhatsAppFor(orgId?: string | null): Promise<boolean> {
  return (await whatsappConfigFor(orgId)) !== null;
}

async function post(cfg: WhatsAppConfig, body: any): Promise<SendResult> {
  try {
    const r = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok) {
      const msg = j?.error?.message || `HTTP ${r.status}`;
      console.error(`[whatsapp] ${r.status}: ${String(msg).slice(0, 200)}`);
      return { sent: false, error: msg };
    }
    return { sent: true, id: j?.messages?.[0]?.id };
  } catch (e: any) {
    return { sent: false, error: e?.message || "network error" };
  }
}

/**
 * Free-form text. Meta only permits this inside a 24-hour window opened by the
 * customer messaging you first — outside it, use sendTemplate().
 */
export async function sendText(to: string, body: string, orgId?: string | null): Promise<SendResult> {
  const cfg = await whatsappConfigFor(orgId);
  if (!cfg) return { sent: false, needsSetup: true, error: whatsappCustomerHint() };
  const num = normalisePhone(to);
  if (!num) return { sent: false, error: `"${to}" is not a valid phone number.` };
  return post(cfg, { to: num, type: "text", text: { preview_url: false, body: body.slice(0, 4000) } });
}

/**
 * An approved template — the only way to start a conversation.
 * `variables` fill the {{1}}, {{2}} … placeholders in the approved body.
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  variables: string[] = [],
  lang = "en",
  orgId?: string | null,
): Promise<SendResult> {
  const cfg = await whatsappConfigFor(orgId);
  if (!cfg) return { sent: false, needsSetup: true, error: whatsappCustomerHint() };
  const num = normalisePhone(to);
  if (!num) return { sent: false, error: `"${to}" is not a valid phone number.` };

  return post(cfg, {
    to: num,
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      ...(variables.length
        ? { components: [{ type: "body", parameters: variables.map((v) => ({ type: "text", text: String(v).slice(0, 900) })) }] }
        : {}),
    },
  });
}

/**
 * Verify a SPECIFIC pair of credentials against Meta.
 *
 * Split out and taking the config explicitly, because the integrations Test
 * button has the customer's freshly-entered credentials in hand and should
 * check THOSE — not read anything back, and certainly not test a different
 * account than the one being connected.
 */
export async function verifyWhatsAppCreds(cfg: WhatsAppConfig): Promise<{ ok: boolean; detail: string }> {
  if (!cfg.token || !cfg.phoneNumberId) {
    return { ok: false, detail: "Both the permanent access token and the phone number ID are required." };
  }
  try {
    const r = await fetch(`${GRAPH}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok) return { ok: false, detail: j?.error?.message || `HTTP ${r.status}` };
    return { ok: true, detail: `Connected to ${j?.verified_name || "your business"} (${j?.display_phone_number || cfg.phoneNumberId})` };
  } catch (e: any) {
    return { ok: false, detail: e?.message || "Could not reach the Meta Graph API." };
  }
}

/**
 * Verify whichever credentials THIS WORKSPACE would actually send with.
 *
 * WAS PLATFORM-ONLY, AND HAD NO CALLERS AT ALL.
 *
 * It read `whatsappConfig()` — the environment fallback — so on the one
 * surface it was written for (the integrations Test button) it would have
 * tested our shared account rather than the credentials the customer had just
 * entered. A green tick proving somebody else's number works is worse than no
 * tick.
 *
 * It was also unreachable: WhatsApp has no `case` in testCredentials(), so it
 * fell to the `default` branch. Now there is one, and it goes through
 * verifyWhatsAppCreds() with the customer's own pair.
 */
export async function verifyWhatsApp(orgId?: string | null): Promise<{ ok: boolean; detail: string }> {
  const cfg = await whatsappConfigFor(orgId);
  if (!cfg) return { ok: false, detail: orgId ? whatsappCustomerHint() : whatsappSetupHint() };
  return verifyWhatsAppCreds(cfg);
}

/* The platform-only body that used to live here is gone rather than kept as a
   deprecated stub. verifyWhatsApp(null) reaches the same code path through
   whatsappConfigFor(), and an unused function retained "just in case" is the
   thing three dead server actions in lib/actions.ts taught me not to leave. */
