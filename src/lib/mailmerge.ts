import "server-only";

export type Recipient = { name?: string; email: string; plan?: string; company?: string };

/** Available merge tokens shown in the UI. */
export const MERGE_TOKENS = ["{{name}}", "{{first_name}}", "{{email}}", "{{plan}}", "{{company}}"];

function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Replace merge tokens with this recipient's values. */
export function mergeVars(text: string, r: Recipient): string {
  const first = (r.name || "").trim().split(/\s+/)[0] || "there";
  return (text || "")
    .replace(/\{\{\s*name\s*\}\}/gi, r.name || "there")
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*email\s*\}\}/gi, r.email || "")
    .replace(/\{\{\s*plan\s*\}\}/gi, r.plan || "")
    .replace(/\{\{\s*company\s*\}\}/gi, r.company || "");
}

/**
 * Builds the final HTML for one recipient:
 *  - escapes text, turns bare URLs into click-tracked links,
 *  - preserves line breaks,
 *  - appends an invisible open-tracking pixel.
 */
export function buildHtml(bodyText: string, opts: { origin: string; recipientId: string }): string {
  const { origin, recipientId } = opts;
  const parts = esc(bodyText).split(/(https?:\/\/[^\s<]+)/g);
  const withLinks = parts.map((p) => {
    if (/^https?:\/\//.test(p)) {
      const tracked = `${origin}/api/track/click?r=${encodeURIComponent(recipientId)}&u=${encodeURIComponent(p)}`;
      return `<a href="${tracked}" style="color:#0f9d8e">${p}</a>`;
    }
    return p;
  }).join("");
  const html = withLinks.replace(/\n/g, "<br/>");
  const pixel = `<img src="${origin}/api/track/open?r=${encodeURIComponent(recipientId)}" width="1" height="1" alt="" style="display:none" />`;
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;margin:auto;font-size:15px;line-height:1.6;color:#111">
    ${html}
    <div style="margin-top:28px;padding-top:14px;border-top:1px solid #eee;font-size:12px;color:#999">Sent via MNB Cortex</div>
    ${pixel}
  </div>`;
}
