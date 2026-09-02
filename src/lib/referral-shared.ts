/**
 * Referral bits with no dependencies — safe in middleware, the browser, or a
 * server component.
 *
 * WHY SEPARATE FROM lib/referrals.ts.
 *
 * `lib/referrals.ts` is `server-only` and imports `serviceClient`, which
 * reaches `next/headers`. Middleware runs on the Edge runtime, where
 * `next/headers` does not exist — importing it there is a build failure, not a
 * lint. Middleware is exactly where the `?ref=` cookie has to be set, because a
 * shared link can land on any page.
 *
 * This is the same split as lib/gbp / lib/gbp-shared, for the same reason, and
 * scripts/test-boundaries.mjs is what stops it regressing.
 */

export const REFERRAL_COOKIE = "cortex_ref";

/** 90 days — long enough for a considered B2B purchase, short enough to expire. */
export const REFERRAL_COOKIE_DAYS = 90;

/**
 * Normalise a code from a URL or typed by hand, and reject anything else.
 *
 * The alphabet excludes I, O, 0 and 1 (see the SQL that generates it): this
 * code gets read off one phone and typed into another, and that is where those
 * characters go wrong. Validating the shape here also means an arbitrary
 * attacker-supplied `?ref=` string never reaches a database query.
 */
export function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = String(raw).trim().toUpperCase().replace(/\s+/g, "");
  return /^MNB-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(c) ? c : null;
}
