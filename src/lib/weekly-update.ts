import "server-only";
import crypto from "crypto";
import { serviceClient } from "@/lib/supabase/server";
import { brandFrom } from "@/lib/branded-email";
import { RELEASES, releasesSince, type Release } from "@/lib/changelog";

/* =========================================================================
   Weekly product-update email for MNB Cortex.

   - APP_NAME    : MNB Cortex
   - APP_URL     : cortex.mnbresearch.com
   - FROM        : brandFrom() — the Resend-verified sender (updates.mnbresearch.com)
   - RECIPIENTS  : confirmed auth users of THIS app, minus anyone who opted out

   What ships is pulled from the real changelog (src/lib/changelog.ts), so the
   email never announces anything that isn't live. If nothing new shipped since
   the last email, we skip the send entirely.
   ========================================================================= */

const APP_NAME = "MNB Cortex";
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://cortex.mnbresearch.com").replace(/\/$/, "");
const CONTACT = "contact@mnbresearch.com";
const BATCH_ENDPOINT = "https://api.resend.com/emails/batch";
const C_FROM = "#1f4a3b";
const C_TO = "#2f6b54";

type Recipient = { email: string; firstName: string };
type Bullet = { title: string; detail: string };
export type WeeklyResult = {
  skipped: boolean; reason?: string; version?: string;
  recipients?: number; sent?: number; failed?: number; test?: boolean; bullets?: number;
};

/* ---- unsubscribe tokens (HMAC so links can't be forged) ------------------ */
function unsubSecret(): string {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "cortex-weekly-fallback";
}
export function unsubToken(email: string): string {
  return crypto.createHmac("sha256", unsubSecret()).update(email.toLowerCase().trim()).digest("base64url").slice(0, 24);
}
export function verifyUnsub(email: string, token: string): boolean {
  const expected = unsubToken(email);
  try {
    return token.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch { return false; }
}
function unsubUrl(email: string): string {
  return `${APP_URL}/api/unsub?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`;
}

/* ---- helpers ------------------------------------------------------------- */
function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function firstNameOf(email: string, meta?: any): string {
  const n = String(meta?.full_name || meta?.name || "").trim();
  if (n) return n.split(/\s+/)[0];
  const p = String(email.split("@")[0] || "").replace(/[._\-+]+/g, " ").trim();
  const w = p.split(" ")[0];
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : "there";
}

/** Split changelog items into <b>title</b> — detail, capped. */
export function gatherBullets(rels: Release[], cap = 6): Bullet[] {
  const out: Bullet[] = [];
  for (const r of rels) {
    for (const it of r.items) {
      const m = it.match(/^(.*?)\s[—–-]\s(.*)$/);
      out.push(m ? { title: m[1].trim(), detail: m[2].trim() } : { title: it.trim(), detail: "" });
      if (out.length >= cap) return out;
    }
  }
  return out;
}

/* ---- rendering ----------------------------------------------------------- */
export function renderWeeklyHtml(firstName: string, bullets: Bullet[], unsub: string): string {
  const rows = bullets.map((b) =>
    `<tr><td style="padding:7px 0;color:#1a2420;font-size:15px;line-height:1.55;vertical-align:top">` +
    `<b style="color:#12281f">${esc(b.title)}</b>${b.detail ? " — " + esc(b.detail) : ""}</td></tr>`
  ).join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <tr><td style="background:linear-gradient(135deg,${C_FROM},${C_TO});padding:24px 28px">
    <div style="font-size:21px;font-weight:800;color:#ffffff;letter-spacing:-.01em">MNB Cortex<span style="font-size:12px;font-weight:500;color:#cfe4da"> by MNB Research</span></div>
    <div style="font-size:13px;color:#d9ece3;margin-top:3px">What's new this week</div>
  </td></tr>
  <tr><td style="padding:26px 28px 4px;color:#1a2420;font-size:15px;line-height:1.6">
    <p style="margin:0 0 6px">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 10px">Here's what we shipped in ${APP_NAME} this week.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </td></tr>
  <tr><td style="padding:12px 28px 20px" align="left">
    <a href="${APP_URL}" style="display:inline-block;background:${C_TO};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:9px">Open ${APP_NAME} →</a>
  </td></tr>
  <tr><td style="padding:0 28px;color:#1a2420;font-size:14px;line-height:1.6">
    <p style="margin:0">— The ${APP_NAME} team, MNB Research</p>
  </td></tr>
  <tr><td style="padding:4px 28px 26px">
    <hr style="border:none;border-top:1px solid #e6e9ef;margin:24px 0" />
    <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:0">
      <strong>${APP_NAME}</strong> is a product of <strong>MNB Research</strong>, operated by
      <strong>Abrobot Technologies</strong>, Delhi, India.<br />
      Web: <a href="https://abrobot.ai" style="color:#12315c">abrobot.ai</a> ·
      <a href="https://mnbresearch.com" style="color:#12315c">mnbresearch.com</a><br />
      Email: <a href="mailto:contact@mnbresearch.com" style="color:#12315c">contact@mnbresearch.com</a> ·
      WhatsApp/Phone: +91 97114 88481<br />
      You're receiving this because you have an account with ${APP_NAME}.
      <a href="${unsub}" style="color:#12315c">Unsubscribe</a> at any time.<br />
      © 2026 Abrobot Technologies. All rights reserved.
    </p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

export function renderWeeklyText(firstName: string, bullets: Bullet[], unsub: string): string {
  const lines = bullets.map((b) => `• ${b.title}${b.detail ? " — " + b.detail : ""}`).join("\n");
  return [
    `Hi ${firstName},`, "",
    `Here's what we shipped in ${APP_NAME} this week.`, "",
    lines, "",
    `Open ${APP_NAME}: ${APP_URL}`, "",
    `— The ${APP_NAME} team, MNB Research`, "",
    "————————————————————————————————",
    `${APP_NAME} is a product of MNB Research, operated by Abrobot Technologies, Delhi, India.`,
    "Web: abrobot.ai · mnbresearch.com",
    "Email: contact@mnbresearch.com · WhatsApp/Phone: +91 97114 88481",
    `You're receiving this because you have an account with ${APP_NAME}.`,
    `Unsubscribe: ${unsub}`,
    "© 2026 Abrobot Technologies. All rights reserved.",
  ].join("\n");
}

/* ---- recipients ---------------------------------------------------------- */
async function listUserRecipients(sb: any): Promise<Recipient[]> {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users: any[] = data?.users || [];
    for (const u of users) {
      const email = String(u?.email || "").toLowerCase().trim();
      if (!email || seen.has(email)) continue;
      // Only real, confirmed accounts — never invited-but-unconfirmed shells.
      if (!u?.email_confirmed_at && !u?.confirmed_at) continue;
      seen.add(email);
      out.push({ email, firstName: firstNameOf(email, u?.user_metadata) });
    }
    if (users.length < 200) break;
  }
  return out;
}
async function optedOutSet(sb: any): Promise<Set<string>> {
  try {
    const { data } = await sb.from("email_optouts").select("email");
    return new Set((data as any[] || []).map((r) => String(r.email || "").toLowerCase()));
  } catch { return new Set(); }
}

/* ---- Resend batch send --------------------------------------------------- */
async function batchSend(chunk: any[]): Promise<{ ok: number; fail: number }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: 0, fail: chunk.length };
  try {
    const r = await fetch(BATCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(chunk),
    });
    if (r.ok) return { ok: chunk.length, fail: 0 };
    return { ok: 0, fail: chunk.length };
  } catch { return { ok: 0, fail: chunk.length }; }
}

/* ---- main ---------------------------------------------------------------- */
export async function sendWeeklyUpdate(opts?: { test?: boolean; force?: boolean }): Promise<WeeklyResult> {
  const test = !!opts?.test;
  const sb = serviceClient();
  if (!sb) return { skipped: true, reason: "no SUPABASE_SERVICE_ROLE_KEY" };
  if (!process.env.RESEND_API_KEY) return { skipped: true, reason: "no RESEND_API_KEY" };

  const latest = RELEASES[0];

  // What was the last real (non-test) send?
  let lastVersion: string | null = null;
  try {
    const { data } = await sb.from("weekly_email_sends").select("version").eq("test", false)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    lastVersion = (data as any)?.version || null;
  } catch { /* table may not exist yet — treat as first send */ }

  // Nothing new since the last email → don't send a promotional blast.
  if (!test && !opts?.force && lastVersion && lastVersion === latest.v) {
    return { skipped: true, reason: "no update this week", version: latest.v };
  }

  const rels = releasesSince(test ? null : lastVersion, 5);
  const bullets = gatherBullets(rels.length ? rels : [latest], 6);
  if (!bullets.length) return { skipped: true, reason: "nothing to announce", version: latest.v };

  // Recipients.
  let recipients: Recipient[];
  if (test) {
    recipients = [{ email: CONTACT, firstName: "there" }];
  } else {
    const [users, outs] = await Promise.all([listUserRecipients(sb), optedOutSet(sb)]);
    recipients = users.filter((r) => !outs.has(r.email));
  }
  if (!recipients.length) return { skipped: true, reason: "no recipients", version: latest.v };

  const subject = `${APP_NAME} — what's new this week`;
  const from = process.env.WEEKLY_FROM || brandFrom();

  let ok = 0, fail = 0;
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100).map((r) => {
      const u = unsubUrl(r.email);
      return {
        from,
        to: [r.email],
        reply_to: CONTACT,
        subject,
        html: renderWeeklyHtml(r.firstName, bullets, u),
        text: renderWeeklyText(r.firstName, bullets, u),
        headers: {
          "List-Unsubscribe": `<mailto:unsubscribe@mnbresearch.com?subject=unsubscribe ${APP_NAME}>, <${u}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });
    const res = await batchSend(chunk);
    ok += res.ok; fail += res.fail;
    if (i + 100 < recipients.length) await new Promise((res2) => setTimeout(res2, 1000)); // gentle pacing
  }

  try {
    await sb.from("weekly_email_sends").insert({
      version: latest.v, sent: ok, failed: fail, recipients: recipients.length, test,
    });
  } catch { /* logging table optional */ }

  return { skipped: false, version: latest.v, recipients: recipients.length, sent: ok, failed: fail, test, bullets: bullets.length };
}
