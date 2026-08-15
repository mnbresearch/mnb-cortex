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
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/**
 * Apply several buckets at once (per-email, per-IP, global).
 * Returns the first rule that was exceeded, or null when everything passed.
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
    { key: `vis:global`, limit: 200, windowSecs: DAY },
    { key: `vis:ip:${ip}`, limit: 3, windowSecs: DAY },
    { key: `vis:email:${who}`, limit: 2, windowSecs: DAY },
  ];
}
