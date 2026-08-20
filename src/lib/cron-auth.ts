import "server-only";
import crypto from "crypto";

/**
 * The single authorisation check for every scheduled endpoint.
 *
 * WHAT WAS WRONG: all three cron routes began with
 *
 *     if (req.headers.get("x-vercel-cron")) return true;
 *
 * A request header is set by the CALLER. Anyone could run
 *
 *     curl -H 'x-vercel-cron: 1' https://.../api/cron/autopilot
 *
 * and, verified against production, get HTTP 200 and a full run. One request
 * fires renewal emails, every customer's scheduled reports, a sync across all
 * connected integrations, and up to twenty Gemini calls. In a loop that is
 * unauthenticated mass mail plus a bill someone else pays. /api/cron/weekly-update
 * was worse: it emails every confirmed user in the project.
 *
 * Vercel does not need that header. When CRON_SECRET is set, Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` on its own cron invocations — the same
 * header an external scheduler uses. So the secret is the only check needed,
 * and the header branch was pure downside.
 *
 * Fails CLOSED: no secret configured means no scheduled endpoint can be
 * triggered from outside at all.
 */
export function cronAuthorised(req: Request): boolean {
  const secret = String(process.env.CRON_SECRET || "");
  if (secret.length < 8) return false;

  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let query = "";
  try { query = new URL(req.url).searchParams.get("secret") || ""; } catch { /* malformed */ }

  const offered = bearer || query;
  // Compare lengths first: timingSafeEqual throws on a mismatch, and the length
  // of a secret is not the part worth protecting.
  if (offered.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(offered), Buffer.from(secret));
  } catch {
    return false;
  }
}
