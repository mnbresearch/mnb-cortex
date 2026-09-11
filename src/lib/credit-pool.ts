/*
  WHOSE CREDITS PAY FOR THIS ACTION?

  THE PROMISE THIS IMPLEMENTS

  The Practice plan (₹29,999/mo) advertises "Up to 25 client workspaces"
  directly above "27,750 AI credits / month". Every CA firm reads that as one
  budget spanning the twenty-five. config.ts even asserts it in a comment —
  "The credit allowance is POOLED across clients" — so pooling was the intent
  and only the implementation was missing: charge_credits was always called
  with the CURRENT workspace's id, so a firm with 27,750 credits watched an
  action inside a client workspace fail for want of credits the client never
  had.

  THE ATTACK THIS HAS TO NOT ENABLE, which is the whole reason this is a
  separate, tested module.

  "Charge someone else's balance" is a sentence that should make anyone
  nervous. If a workspace could nominate its own payer, the cheapest possible
  exploit in the product would be: sign up, point `practice_org_id` at a large
  paying firm, and spend their month. So the link is one-directional and
  privileged:

    - The FIRM claims a client. A client can never attach itself to a firm.
    - Claiming requires owner/admin rank in the firm AND membership of the
      client, proved in Postgres by cortex_practice_claim (see the migration).
    - The column lives on the CLIENT row but only the firm can write it.

  And because a stale link is as dangerous as a forged one, the resolution
  below re-checks the firm on EVERY charge rather than trusting the column: a
  firm that downgrades off Practice, lapses, or is suspended stops paying for
  its clients immediately, without anyone having to remember to unlink them.

  FAIL-SAFE DIRECTION

  Every uncertain case resolves to "the workspace pays for itself". That is the
  behaviour before this feature existed, so the worst outcome of a bug here is
  the status quo — never a free action, never a stranger's balance. The one
  thing this must not do is fail OPEN into somebody else's credits.

  No imports: pure over its inputs so scripts/test-credit-pool.mjs can execute
  every branch, including the ones that are awkward to reach with real data.
*/

/** The minimum a payer org must look like for this decision. */
export type PayerOrg = {
  id: string;
  plan?: string | null;
  /** Same shape entitlement.statusOf() produces: active | expired | cancelled | suspended | trialing. */
  status?: string | null;
};

export type PoolDecision = {
  /** The org whose credits will actually be debited. */
  payerOrgId: string;
  /** True when that is somebody other than the workspace taking the action. */
  pooled: boolean;
  /**
   * Why. Shown to the firm in the UI and written to the credit ledger reason,
   * so a partner reading the ledger can tell a client's spend from their own.
   */
  reason: "self" | "practice-pool" | "firm-not-entitled" | "firm-lapsed" | "no-link";
};

/**
 * Plans whose allowance may be spent by client workspaces.
 *
 * Deliberately a list here rather than `practiceClientLimit(plan) !== 0` from
 * config: this module stays import-free so it can be executed by a test, and
 * the two are pinned to each other by scripts/test-credit-pool.mjs, which reads
 * PRACTICE_CLIENTS out of config.ts and asserts the sets match. A silent
 * divergence would either strand a paying firm or extend pooling to a plan
 * that never bought it.
 */
export const POOLING_PLANS = ["practice", "enterprise"] as const;

/** Statuses in which a firm may still fund its clients. */
const FIRM_MAY_PAY = ["active", "trialing"];

/**
 * Decide who pays.
 *
 * `self` is the workspace the action happens in. `firm` is the org named by
 * self.practice_org_id, or null when there is no link (or it could not be
 * read — which must be indistinguishable from no link).
 */
export function resolvePayer(self: PayerOrg, firm: PayerOrg | null | undefined): PoolDecision {
  const selfId = String(self?.id || "");

  if (!firm || !firm.id) return { payerOrgId: selfId, pooled: false, reason: "no-link" };

  /*
    A workspace pointing at itself is not pooling, and treating it as such
    would double-read the same row for no reason. It is also the shape a
    corrupted or hand-edited link is most likely to take.
  */
  if (String(firm.id) === selfId) return { payerOrgId: selfId, pooled: false, reason: "self" };

  /*
    RE-CHECKED ON EVERY CHARGE, not trusted from when the link was made.

    A firm that downgrades from Practice to Watch keeps whatever links it
    created. Without this, those twenty-five client workspaces would go on
    spending a Practice-sized allowance the firm no longer pays for — the
    allowance itself drops with the plan, but the CLAIM on it would not.
  */
  const plan = String(firm.plan || "").toLowerCase();
  if (!POOLING_PLANS.includes(plan as (typeof POOLING_PLANS)[number])) {
    return { payerOrgId: selfId, pooled: false, reason: "firm-not-entitled" };
  }

  /*
    A lapsed or suspended firm pays for nobody — including itself. Letting a
    client keep drawing on a firm we have stopped billing is exactly the hole
    isHardStopped() was written to close, one indirection further out.
  */
  const status = String(firm.status || "").toLowerCase();
  if (!FIRM_MAY_PAY.includes(status)) {
    return { payerOrgId: selfId, pooled: false, reason: "firm-lapsed" };
  }

  return { payerOrgId: String(firm.id), pooled: true, reason: "practice-pool" };
}

/**
 * The ledger reason for a pooled charge.
 *
 * The client's own id is carried in the string so a firm reading its ledger
 * can see WHICH client spent it. Without that, twenty-five workspaces drawing
 * on one balance produce an untraceable list of identical rows, and the first
 * question any partner asks is "who used it".
 */
export function pooledReason(mode: string, clientOrgId: string): string {
  return `ai:${String(mode || "").toLowerCase()}:client:${clientOrgId}`;
}

/** True when a ledger reason was produced by a pooled charge. */
export function isPooledReason(reason: string | null | undefined): boolean {
  return /:client:/.test(String(reason || ""));
}

/** The client org id inside a pooled ledger reason, or null. */
export function clientFromReason(reason: string | null | undefined): string | null {
  const m = String(reason || "").match(/:client:([0-9a-f-]{36})$/i);
  return m ? m[1] : null;
}
