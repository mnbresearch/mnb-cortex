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

/** What the UI shows when it isn't set up. Names the missing pieces exactly. */
export function whatsappSetupHint(): string {
  const missing: string[] = [];
  if (!envKey("WHATSAPP_TOKEN")) missing.push("WHATSAPP_TOKEN");
  if (!(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim()) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  return missing.length
    ? `WhatsApp sending needs ${missing.join(" and ")}. Create a Meta WhatsApp Business app, then see SETUP.md → WhatsApp.`
    : "WhatsApp is configured.";
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
  if (!cfg) return { sent: false, needsSetup: true, error: whatsappSetupHint() };
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
  if (!cfg) return { sent: false, needsSetup: true, error: whatsappSetupHint() };
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

/** Verify the credentials actually work, for the integrations "Test" button. */
export async function verifyWhatsApp(): Promise<{ ok: boolean; detail: string }> {
  const cfg = whatsappConfig();
  if (!cfg) return { ok: false, detail: whatsappSetupHint() };
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
