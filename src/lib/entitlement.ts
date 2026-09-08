/**
 * Entitlement rules — who is allowed to use the product right now.
 *
 * Deliberately a standalone module with NO imports: no `server-only`, no
 * Supabase, no config. That keeps it testable in isolation (see
 * `npm run test:entitlement`), which matters because the two failure modes here
 * are both expensive and neither shows up in a type check:
 *
 *   - too lenient → lapsed workspaces keep the product for free;
 *   - too strict  → a PAYING customer is refused service, which is worse.
 *
 * `src/lib/credits.ts` re-exports these, so callers need not know they moved.
 */

/**
 * A live mandate can debit and notify us hours late — UPI Autopay requires 24h
 * pre-debit notice, bank retries are routine and a webhook can lag. Refusing a
 * paying customer at the exact stroke of their period end would turn ordinary
 * settlement lag into an outage for someone who has actually paid.
 */
export const RENEWAL_GRACE_DAYS = 3;

/**
 * A workspace in one of these states has no right to the product.
 * Both spellings of cancelled: migration_trial.sql documents the column with one
 * L, the rest of the app writes two, and a miss here is a free workspace.
 */
const DEAD_STATUSES = ["expired", "cancelled", "canceled", "suspended"];

export function isLapsed(status: string): boolean {
  return DEAD_STATUSES.includes(String(status || "").toLowerCase());
}

/**
 * An operator-set hard stop, as opposed to a period simply running out.
 *
 * `expired` is a clock. `suspended` is a decision someone made — a chargeback,
 * an abuse report — and a decision has to outrank both of the escape hatches
 * that exist for the clock: a leftover credit balance, and an allowance
 * override.
 *
 * `cancelled` IS NOT ONE OF THESE, and including it was a mistake caught in
 * review. Cancelled is the churned customer, and the pay-as-you-go path exists
 * precisely for them: /usage stays reachable while locked, /billing tells them
 * to "start with a ₹149 credit pack", and settle.ts grants credits without ever
 * touching subscription_status. So a cancelled workspace could pay for credits
 * and then be refused by every single charge — money taken, nothing delivered,
 * no way back inside the product. It stays `isLapsed`, so it still needs a
 * balance to do anything; it is simply not hard-stopped.
 *
 * It did not. chargeForMode refused only when `isLapsed(status) && !hasOverride
 * && balance < cost`, so a suspended workspace holding credits kept working,
 * and a workspace with ANY non-zero credits_allowance — which the superadmin
 * console's own "Set allowance" button writes — was never blocked at all,
 * because hasOverride short-circuited the whole test. The console page promises
 * suspension "locks that customer out behind the paywall". It did not, and the
 * customer could still be spending ~₹77 a clip of Veo while we believed they
 * were cut off.
 */
export function isHardStopped(status: string): boolean {
  return String(status || "").toLowerCase() === "suspended";
}



/**
 * The status that actually counts, as opposed to the one stored in the row.
 *
 * A paid period that has run out is still recorded as 'active' until the nightly
 * sweep flips it, and an expired TRIAL is never flipped at all — nothing in the
 * system converts 'trialing' to anything else, so that cohort (the one paid
 * advertising produces) kept its allowance indefinitely.
 */
export function effectiveStatus(
  status: string,
  endsAt: any,
  opts?: { trialEndsAt?: any; autorenew?: string | null },
): string {
  const s = String(status || "").toLowerCase();

  if (s === "trialing") {
    const t = opts?.trialEndsAt ? new Date(opts.trialEndsAt).getTime() : NaN;
    return Number.isFinite(t) && Date.now() > t ? "expired" : s;
  }

  if (s !== "active") return s;
  if (!endsAt) return s; // no period recorded (manually granted) — leave it active
  const t = new Date(endsAt).getTime();
  if (!Number.isFinite(t)) return s;

  const grace = String(opts?.autorenew || "").toUpperCase() === "ACTIVE" ? RENEWAL_GRACE_DAYS : 0;
  return Date.now() > t + grace * 86_400_000 ? "expired" : "active";
}

/** Read the fields effectiveStatus needs straight off an `organizations` row. */
export function statusOf(org: any): string {
  return effectiveStatus(String(org?.subscription_status || "trialing"), org?.subscription_ends_at, {
    trialEndsAt: org?.trial_ends_at,
    autorenew: org?.autorenew_status,
  });
}
