/*
  WHO IS LOCKED OUT, AND WHICH PAGES STAY OPEN WHEN THEY ARE.

  WHY THIS IS ITS OWN FILE.

  Both halves of this decision were previously spread across two files that
  could not be executed by a test: the `locked` expression sat inside
  getBillingStatus() in billing.ts, behind `import "server-only"` and a Supabase
  round-trip, and the ALLOW list sat inside a "use client" React component. So
  the only way to check either was to read it — and reading is what let the
  worst bug in this product ship.

  That bug: TRIAL_DAYS is 0, so ensureWorkspace() stamps trial_ends_at = now and
  every workspace is `expired` from its first second. The paywall then covered
  every page except four. The onboarding wizard's own three buttons — /import,
  /receivables, /dashboard — were not among them. A new customer signed up,
  completed the welcome wizard, pressed the button it gave them, and hit a lock.
  100% of signups, and no test could see it, because the list and the
  destinations it had to cover lived in different files and nothing compared
  them.

  Second bug, same shape: `locked` ignored the credit balance while
  lib/credits.ts has a deliberate pay-as-you-go path. Someone who bought the
  ₹149 pack the landing page advertises was metered by the server and locked out
  by the UI — on a page telling them to buy a ₹149 pack.

  Both are now pure functions over plain values, with no imports at all, so
  scripts/test-paywall.mjs executes them directly against the states a real
  signup passes through. No mocking, no reading.
*/

export type PaywallState = {
  /** False when the trial columns are not migrated yet — enforcement is OFF. */
  enforceable: boolean;
  /** The workspace's effective status: trialing | active | expired. */
  status: string;
  /** An OPERATOR decision (suspended/cancelled), as opposed to a clock. */
  blocked: boolean;
  /** Bought or granted credits still available to spend. */
  credits: number;
  /** credits_allowance === -1, i.e. an unlimited override. */
  unlimited: boolean;
};

/**
 * The paywall decision, and the only place it is made.
 *
 * Two rules, and they must match lib/credits.ts — which is the control that
 * actually costs money. A UI that locks someone the server would happily serve
 * is a customer who paid and cannot see what they paid for.
 *
 *  - `blocked` locks REGARDLESS of balance. A suspension is a decision someone
 *    made about a chargeback or an abuse report, and must not be survivable by
 *    holding credits. (chargeForMode enforces the same via isHardStopped.)
 *
 *  - an expired trial or lapsed plan locks ONLY when there is nothing left to
 *    spend. Bought credits are the entitlement; there is no free tier, so a
 *    brand-new workspace is `expired` immediately and the balance is the only
 *    thing distinguishing a paying customer from a stranger.
 */
export function isLocked(s: PaywallState): boolean {
  if (!s.enforceable) return false;
  if (s.blocked) return true;
  const hasSpendableCredits = s.unlimited || s.credits > 0;
  return s.status === "expired" && !hasSpendableCredits;
}

/*
  PAGES THAT STAY REACHABLE WHILE LOCKED.

  Not "pages we felt like allowing" — this list has to satisfy three concrete
  obligations, and each entry below says which:

   1. You must be able to PAY. Otherwise the lock is a dead end rather than a
      prompt. (/billing, /pricing, /usage)
   2. You must be able to finish SETTING UP, including every destination the
      onboarding wizard itself links to. Writing a company name costs us
      nothing and asking for money before it is the wrong order.
      (/onboarding, /import, /receivables, /dashboard, /settings)
   3. You must be able to see WHAT YOU WOULD BE BUYING. Importing your own
      books and seeing the first receivables screen is how someone decides to
      pay at all.

  Nothing expensive is given away: every billable action goes through
  chargeForMode() server-side, which refuses independently of this list.
*/
export const PAYWALL_ALLOW = [
  "/billing",      // 1 — pay
  "/pricing",      // 1 — see the plans (exact match only; see below)
  "/usage",        // 1 — buy a credit pack. /billing tells locked users to.
  "/onboarding",   // 2 — the wizard itself
  "/settings",     // 2 — company name, industry
  "/import",       // 2,3 — the wizard's primary button
  "/receivables",  // 2,3 — the wizard's finish button
  "/dashboard",    // 2,3 — the wizard's secondary button
] as const;

/*
  Matched by PREFIX, because real paths carry query strings and sub-routes
  (/import?table=invoices, /settings/team). That makes "/pricing" also match
  "/pricing-optimizer" — a real, billable product page that must stay behind
  the wall. Listed here rather than solved by a cleverer matcher, so the
  exception is visible to whoever adds the next entry.
*/
export const PAYWALL_ALLOW_EXACT = ["/pricing"] as const;

/** Is this path reachable while the workspace is locked? */
export function isAllowedWhileLocked(path: string | null | undefined): boolean {
  const p = String(path || "");
  return PAYWALL_ALLOW.some((a) =>
    (PAYWALL_ALLOW_EXACT as readonly string[]).includes(a) ? p === a : p.startsWith(a),
  );
}
