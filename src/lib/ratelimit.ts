import "server-only";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Rate limiting for public, unauthenticated endpoints.
 *
 * Backed by the `rate_limits` table + `rate_limit_hit()` RPC (see
 * supabase/migrations/2026_hardening.sql) rather than an in-process Map,
 * because every serverless instance would otherwise get its own fresh counter
 * and the limit would mean nothing.
 *
 * Fails CLOSED: if we can't verify the limit we refuse, the same way
 * imageGenGate() does. These endpoints spend real money on model calls, so
 * "allow when unsure" is the wrong default.
 */

export type LimitRule = { key: string; limit: number; windowSecs: number };

const DAY = 86_400;

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

/**
 * "The function isn't there yet" — PostgREST can't find it in the schema cache
 * (PGRST202) or Postgres reports undefined_function (42883).
 *
 * This is the ONLY condition we fail open on. Before 2026_hardening.sql runs the
 * RPC genuinely doesn't exist, and failing closed there would 429 every contact
 * form and access request on the marketing site — turning a missing migration
 * into a total lead-capture outage. Every other error still fails closed.
 */
function isMissingFunction(error: any): boolean {
  const code = String(error?.code || "");
  if (code === "PGRST202" || code === "42883") return true;
  /*
    NARROWED, BECAUSE THE TEXT FALLBACK WAS CATCHING THE WRONG THING.

    This used to end with /could not find the function|does not exist/i. The
    second half matches far more than a missing function: Postgres reports a
    missing TABLE as `relation "rate_limits" does not exist` (42P01). So if
    the table were dropped or had never been created while the RPC existed,
    every bucket in the product would quietly return "allowed" — including
    vis:global, which is the only ceiling on the unauthenticated
    /api/visibility/public lead magnet, and contact:global, which caps
    outbound email. The header of this file promises "Fails CLOSED"; that one
    regex made it fail open on the most likely way for the dependency to be
    broken.

    Keeping a text fallback at all is for a gateway that drops `code`, so it
    now has to actually name a FUNCTION. Anything else fails closed, which is
    the documented and intended direction.
  */
  const msg = String(error?.message || "");
  return /could not find the function|function [^ ]+ does not exist/i.test(msg);
}

/** Check one bucket. Returns true when the caller is still within allowance. */
async function hit(rule: LimitRule): Promise<boolean> {
  const svc = serviceClient();
  if (!svc) return false;
  try {
    const { data, error } = await svc.rpc("rate_limit_hit", {
      p_key: rule.key,
      p_limit: rule.limit,
      p_window_secs: rule.windowSecs,
    });
    if (error) return isMissingFunction(error);
    return data === true;
  } catch {
    return false;
  }
}

/**
 * Apply several buckets in order, stopping at the first one exceeded.
 * Returns the rule that blocked the request, or null when everything passed.
 *
 * Pass the NARROWEST bucket first (email, then IP, then global): each check
 * increments its counter, so evaluating the global ceiling first would let a
 * single spammer who is already blocked per-email still eat the daily budget.
 */
export async function enforce(rules: LimitRule[]): Promise<LimitRule | null> {
  for (const rule of rules) {
    if (!(await hit(rule))) return rule;
  }
  return null;
}

/**
 * Buckets for the public AI Visibility lead magnet.
 * One prospect gets a couple of tries; an office/NAT gets a few; and a global
 * daily ceiling caps total spend no matter how the traffic is distributed.
 */
export function visibilityLimits(email: string, ip: string): LimitRule[] {
  const who = email.trim().toLowerCase();
  return [
    { key: `vis:email:${who}`, limit: 2, windowSecs: DAY },
    { key: `vis:ip:${ip}`, limit: 3, windowSecs: DAY },
    { key: `vis:global`, limit: 200, windowSecs: DAY },
  ];
}

/**
 * Buckets for the unauthenticated contact / access-request forms. These send
 * mail from our verified domain, so they're throttled for deliverability and
 * reputation as much as for cost.
 */
export function contactFormLimits(email: string, ip: string): LimitRule[] {
  const who = email.trim().toLowerCase();
  return [
    { key: `contact:email:${who}`, limit: 3, windowSecs: DAY },
    { key: `contact:ip:${ip}`, limit: 5, windowSecs: DAY },
    { key: `contact:global`, limit: 500, windowSecs: DAY },
  ];
}
