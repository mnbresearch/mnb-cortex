import "server-only";

/* ============================================================
   BRANDING — edit this block only. Everything else is generic.
   ============================================================ */
export const BRAND = {
  PRODUCT_NAME: "MNB Cortex",
  SENDER_DISPLAY: "MNB Cortex by MNB Research",
  FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS || "hello@updates.mnbresearch.com",
  COMPANY_NAME: "MNB Research",
  LEGAL_ENTITY: "Abrobot Technologies Private Limited",
  CONTACT_EMAIL: "contact@mnbresearch.com",
  PHONE: "+91 97114 88481",
  WEBSITE: "https://www.mnbresearch.com",
  TAGLINE: "The AI COO for your business",
  BADGES: ["Shark Tank India Featured", "DPIIT-Recognised Startup", "10,000+ Businesses Served"],
  COLOR_FROM: "#1f4a3b",
  COLOR_TO: "#2f6b54",
  DISCLAIMER: "MNB Cortex is the AI operating system for SMEs. © 2026 Abrobot Technologies Private Limited. All rights reserved.",
};

/** The RFC-5322 From value: "NyayaAI by MNB Research <hello@updates.mnbresearch.com>". */
export function brandFrom(): string {
  return `${BRAND.SENDER_DISPLAY} <${BRAND.FROM_ADDRESS}>`;
}

function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type MergeVars = { name?: string; email?: string; firstName?: string };

/** Replace {{name}}, {{firstName}}, {{email}} case-insensitively. */
export function mergeTokens(text: string, v: MergeVars): string {
  const first = v.firstName || (v.name || "").trim().split(/\s+/)[0] || "there";
  return (text || "")
    .replace(/\{\{\s*name\s*\}\}/gi, v.name || "there")
    .replace(/\{\{\s*firstName\s*\}\}/gi, first)
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*email\s*\}\}/gi, v.email || "");
}

/**
 * Wrap a plain-text body in the branded HTML shell.
 * Escapes the body, linkifies bare URLs (optionally click-tracked), converts
 * newlines to <br>, and appends an open-tracking pixel when tracking is provided.
 */
export function renderBrandedEmail(bodyText: string, opts?: { origin?: string; token?: string; preheader?: string }): string {
  const origin = opts?.origin || "";
  const token = opts?.token;

  // Body: escape → linkify (tracked if token) → line breaks.
  const linked = esc(bodyText).split(/(https?:\/\/[^\s<]+)/g).map((p) => {
    if (/^https?:\/\//.test(p)) {
      const href = token && origin ? `${origin}/api/t/c/${encodeURIComponent(token)}?u=${encodeURIComponent(p)}` : p;
      return `<a href="${href}" style="color:${BRAND.COLOR_TO};text-decoration:underline">${p}</a>`;
    }
    return p;
  }).join("").replace(/\n/g, "<br/>");

  const pixel = token && origin ? `<img src="${origin}/api/t/o/${encodeURIComponent(token)}.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" />` : "";
  const badges = BRAND.BADGES.map((b) => `<span style="display:inline-block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#5b6b64;background:#eef4f1;border-radius:999px;padding:3px 9px;margin:2px 3px">${esc(b)}</span>`).join("");
  const pre = opts?.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>` : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f5">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,${BRAND.COLOR_FROM},${BRAND.COLOR_TO});padding:26px 28px">
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-.01em">${esc(BRAND.PRODUCT_NAME)}
          <span style="font-size:12px;font-weight:500;color:#cfe4da;opacity:.85"> by ${esc(BRAND.COMPANY_NAME)}</span>
        </div>
        <div style="font-size:13px;color:#d9ece3;margin-top:3px">${esc(BRAND.TAGLINE)}</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:28px;color:#1a2420;font-size:15px;line-height:1.6">
        ${linked}
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:20px 28px 26px;border-top:1px solid #eef1f0">
        <div style="font-size:14px;font-weight:700;color:#1f4a3b">${esc(BRAND.COMPANY_NAME)}</div>
        <div style="font-size:12px;color:#7a8a83;margin-top:2px">A brand of ${esc(BRAND.LEGAL_ENTITY)}</div>
        <div style="font-size:12px;margin-top:8px">
          <a href="mailto:${BRAND.CONTACT_EMAIL}" style="color:${BRAND.COLOR_TO};text-decoration:none">${esc(BRAND.CONTACT_EMAIL)}</a>
          <span style="color:#c3cec9"> · </span>
          <a href="tel:${BRAND.PHONE.replace(/\s/g, "")}" style="color:${BRAND.COLOR_TO};text-decoration:none">${esc(BRAND.PHONE)}</a>
          <span style="color:#c3cec9"> · </span>
          <a href="${BRAND.WEBSITE}" style="color:${BRAND.COLOR_TO};text-decoration:none">${esc(BRAND.WEBSITE.replace(/^https?:\/\//, ""))}</a>
        </div>
        <div style="margin-top:12px">${badges}</div>
        <div style="border-top:1px solid #eef1f0;margin:14px 0 0"></div>
        <div style="font-size:11px;color:#9aa8a2;margin-top:12px;line-height:1.5">${esc(BRAND.DISCLAIMER)}</div>
      </td></tr>
    </table>
    ${pixel}
  </td></tr>
</table>
</body></html>`;
}
