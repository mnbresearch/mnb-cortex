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
 *
 * ---------------------------------------------------------------------------
 * THE `?secret=` QUERY FALLBACK IS GONE. HEADER ONLY.
 * ---------------------------------------------------------------------------
 *
 * This used to accept `bearer || query`, so `/api/cron/autopilot?secret=…`
 * worked. Convenient for a curl test, and it put a long-lived credential —
 * one that triggers mass mail and paid model runs — into every place a URL
 * goes and nobody thinks about:
 *
 *   · Vercel request logs and any log drain attached to them
 *   · the browser history and address bar if anyone ever pastes it
 *   · the `Referer` header on any outbound link from a page served that way
 *   · bookmarks, shell history, screenshots, pasted debugging snippets
 *
 * A secret in a query string is a secret with a copy in six places, and
 * rotating it means finding all six. This repo already removed exactly this
 * pattern from /api/v1/metrics, where `?key=` was dropped in favour of a
 * header — so the two files disagreed, and the weaker one was guarding the
 * more dangerous endpoints.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` natively, so
 * nothing legitimate depended on the query form. To invoke one by hand:
 *
 *     curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/autopilot
 */
export function cronAuthorised(req: Request): boolean {
  const secret = String(process.env.CRON_SECRET || "");
  if (secret.length < 8) return false;

  const offered = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // Compare lengths first: timingSafeEqual throws on a mismatch, and the length
  // of a secret is not the part worth protecting.
  if (offered.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(offered), Buffer.from(secret));
  } catch {
    return false;
  }
}
