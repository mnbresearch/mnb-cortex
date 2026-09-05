import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed click-tracking destinations.
 *
 * THE HOLE THIS CLOSES.
 *
 * /api/track/click and /api/t/c/[token] took the destination straight off the
 * query string:
 *
 *     let dest = "https://mnb-cortex.vercel.app";
 *     try { const parsed = new URL(u);
 *           if (parsed.protocol === "http:" || parsed.protocol === "https:") dest = parsed.toString(); }
 *     catch {}
 *     return NextResponse.redirect(dest, 302);
 *
 * The comment above it said "open-redirect protection". It blocks `javascript:`
 * and `data:`, which is worth doing, but it permits ANY http(s) host — which is
 * the definition of an open redirect. Both endpoints are unauthenticated and
 * unrated:
 *
 *     https://cortex.mnbresearch.com/api/track/click?u=https://cortex-billing.example/login
 *
 * A phishing link now begins on the domain we tell customers to trust with
 * their bank statements and their card. It passes link scanners that check the
 * first hop, it survives being pasted into WhatsApp with our name attached, and
 * every "check the URL before you click" instruction we could give a customer
 * has already been satisfied.
 *
 * WHY A SIGNATURE RATHER THAN AN ALLOWLIST.
 *
 * The legitimate use is a customer's own marketing email pointing at their own
 * site, so there is no fixed list of hosts to allow — the set is "whatever this
 * customer typed", which is unbounded and cannot be enumerated in advance.
 *
 * What IS true is that every legitimate link was built by us when the campaign
 * was rendered. So we sign at render time and verify at click time. An attacker
 * cannot forge a destination without the key, and the URLs we generate keep
 * working unchanged.
 *
 * Same-origin destinations skip the signature: they cannot be used to phish
 * anyone off our domain, and requiring one there would break in-flight links to
 * our own pages for no security benefit.
 */

const FALLBACK = "https://cortex.mnbresearch.com";

function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || FALLBACK;
  try { return new URL(raw).origin; } catch { return FALLBACK; }
}

/**
 * The signing key.
 *
 * Reuses CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY rather than adding another
 * env var nobody remembers to set — a signing scheme that silently turns
 * itself off when a variable is missing is worse than none, because it looks
 * protected. When neither exists we return null and the caller refuses every
 * off-origin redirect outright: links stop working, which is visible, rather
 * than the check being skipped, which is not.
 */
function key(): Buffer | null {
  const k = process.env.LINK_SIGNING_SECRET
    || process.env.CRON_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || "";
  return k ? Buffer.from(k, "utf8") : null;
}

/** Short, URL-safe. 16 bytes of HMAC-SHA256 is ample to stop forgery. */
export function signDestination(url: string): string {
  const k = key();
  if (!k) return "";
  return createHmac("sha256", k).update(url).digest("base64url").slice(0, 22);
}

/** Append `&s=<sig>` to a tracking URL. Call this when RENDERING a campaign. */
export function trackedUrl(base: string, dest: string): string {
  const sig = signDestination(dest);
  return sig ? `${base}${base.includes("?") ? "&" : "?"}u=${encodeURIComponent(dest)}&s=${sig}` : base;
}

/**
 * Decide where a click may actually go.
 *
 * Returns the app's own origin — never the caller's value — whenever the
 * destination is missing, malformed, not http(s), or off-origin without a
 * valid signature. Failing to our own homepage is the safe direction: a
 * tracking link that lands somewhere boring is a bug report, one that lands on
 * an attacker's login page is an incident.
 */
export function safeDestination(u: string | null, sig: string | null): string {
  const home = appOrigin();
  if (!u) return home;

  let parsed: URL;
  try { parsed = new URL(u); } catch { return home; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return home;

  // Our own domain needs no signature — it cannot be used to phish off-site.
  if (parsed.origin === home) return parsed.toString();

  const k = key();
  if (!k || !sig) return home;

  const expected = signDestination(u);
  if (!expected || expected.length !== sig.length) return home;
  try {
    // Timing-safe: this compares a secret-derived value against attacker input.
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return home;
  } catch { return home; }

  return parsed.toString();
}
