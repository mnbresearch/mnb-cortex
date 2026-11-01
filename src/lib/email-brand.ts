/*
  WHOSE NAME IS ON THE EMAIL.

  White-label is sold on Practice, Command and Enterprise, and email is the
  surface a white-label buyer actually judges: the alert digest and the
  decision digest land in the inbox of the workspace's owner — for a CA firm's
  client or an Enterprise group's company, that is the client, who should see
  the firm or the group, not MNB Cortex.

  Rules, in order:
    1. The workspace's own plan (or the Enterprise group plan it inherits)
       includes white-label → its own name, with its own logo/accent, falling
       back to the group's logo/accent when it has set none.
    2. Otherwise, it is a pooled client of a firm whose plan includes
       white-label → the FIRM's name, logo and accent.
    3. Otherwise → null, and the mail is MNB Cortex-branded as before.
  A suspended workspace or a lapsed firm never brands anything.

  Pure, relative ".ts" imports, so scripts/test-white-label-email.mjs runs it.
*/
import { planIncludes } from "./config.ts";
import { capabilityPlan, type GateOrg } from "./engine/plan-gate.ts";
import { resolvePayer } from "./credit-pool.ts";
import { statusOf, isHardStopped, isLapsed } from "./entitlement.ts";

/** `sender` is the From display name, already header-safe (brandedSenderName). */
export type OrgBrand = { name: string; logoUrl: string | null; color: string; sender: string };

/* The light-theme value of each workspace accent (lib/utils.ts ACCENTS), as hex:
   inline email styles cannot rely on hsl() in every client. Checked against
   ACCENTS by the test. */
export const ACCENT_HEX: Record<string, string> = {
  gold: "#926916", emerald: "#058053", cyan: "#047990", indigo: "#2d20df",
  violet: "#831fe0", rose: "#db1a44", amber: "#a45f04", sky: "#0475a9",
};
export const DEFAULT_BRAND_COLOR = "#1f2937";

export type BrandOrg = NonNullable<GateOrg> & { name?: string | null; logo_url?: string | null; accent?: string | null };

function cleanName(v: unknown): string {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f<>"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
function cleanLogo(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s.startsWith("https://")) return null;
  try { const u = new URL(s); return u.protocol === "https:" ? u.href : null; } catch { return null; }
}
const colorOf = (a: unknown) => ACCENT_HEX[String(a || "").toLowerCase()] || null;

export function pickEmailBrand(org: BrandOrg | null | undefined, firm?: BrandOrg | null): OrgBrand | null {
  if (!org || !org.id) return null;
  if (isHardStopped(statusOf(org))) return null;
  const linked = !!(firm && firm.id && String(org.practice_org_id || "") === String(firm.id) && String(firm.id) !== String(org.id));
  const f = linked ? firm! : null;

  const plan = capabilityPlan(org, f || undefined);
  const inherited = !!f && plan !== String(org.plan || "");
  if (planIncludes(plan, "whitelabel") && (inherited || !isLapsed(statusOf(org)))) {
    const name = cleanName(org.name) || cleanName(f?.name);
    if (!name) return null;
    return withSender({
      name,
      logoUrl: cleanLogo(org.logo_url) || (inherited ? cleanLogo(f?.logo_url) : null),
      color: colorOf(org.accent) || (inherited ? colorOf(f?.accent) : null) || DEFAULT_BRAND_COLOR,
    });
  }

  if (f && planIncludes(String(f.plan || ""), "whitelabel")) {
    const d = resolvePayer(
      { id: String(org.id), plan: String(org.plan || ""), status: statusOf(org) },
      { id: String(f.id), plan: String(f.plan || ""), status: statusOf(f) },
    );
    if (!d.pooled) return null;
    const name = cleanName(f.name);
    if (!name) return null;
    return withSender({ name, logoUrl: cleanLogo(f.logo_url), color: colorOf(f.accent) || DEFAULT_BRAND_COLOR });
  }
  return null;
}

/** Display name for the From header: "Sharma & Co (via Cortex)". */
const withSender = (b: Omit<OrgBrand, "sender">): OrgBrand => ({ ...b, sender: brandedSenderName(b) });

export function brandedSenderName(b: { name: string }): string {
  return `${cleanName(b.name).replace(/[(),:;@\[\]]/g, " ").replace(/\s+/g, " ").trim() || "Your workspace"} (via Cortex)`;
}
