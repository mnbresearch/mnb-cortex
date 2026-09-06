import "server-only";
import { getOrder } from "@/lib/pay/cashfree";
import { serviceClient } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/credits";
import { PLANS, CREDIT_PACKS } from "@/lib/config";
import { emitQuietly } from "@/lib/webhooks";
import { rewardReferral } from "@/lib/referrals";

export type SettleResult = {
  ok: boolean;
  pending?: boolean;
  /**
   * The caller should ASK FOR A RETRY rather than acknowledge.
   *
   * Set only when the money is confirmed taken and the entitlement did not
   * land — a released claim waiting to be re-settled. Deliberately NOT set for
   * permanent refusals (unknown plan, wrong amount, no workspace on the order),
   * because retrying those forever achieves nothing and buries the real signal
   * in Cashfree's retry log.
   *
   * This distinction is the whole point: the webhook returned 200 for every
   * outcome, so a customer whose grant failed paid and received nothing, and
   * Cashfree was told it had been handled.
   */
  retryable?: boolean;
  /**
   * Which workspace this order belongs to, taken from the order's own
   * customer_id — never from the caller.
   *
   * The verify route needs it to refuse reporting on another workspace's
   * order. No entitlement was ever divertible (the grant is keyed to this same
   * value), but the RESULT was returned to whoever asked, which let any
   * signed-in user probe an order id for its plan, amount and state.
   */
  orgId?: string;
  already?: boolean;
  kind?: "plan" | "credits";
  plan?: string;
  cycle?: string;
  endsAt?: string;
  credits?: number;
  balance?: number;
  error?: string;
};

/**
 * Verify a Cashfree order server-side and activate it EXACTLY ONCE.
 *
 * Safe to call from the return-page verify AND the webhook, concurrently and
 * repeatedly — the `payments` table (order_id PK) is the idempotency guard, so
 * credits/plan can never be granted twice. The order's own customer_id (which we
 * set to the org id at creation) is the source of truth for which workspace to
 * credit, so the webhook needs no user session.
 */
export async function settleOrder(orderId: string): Promise<SettleResult> {
  if (!orderId) return { ok: false, error: "Missing order." };
  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Service role not configured." };

  const order = await getOrder(orderId);
  if (!order.paid) return { ok: false, pending: true, error: "Payment not completed yet." };

  const orgId = (order.customerId || "").trim();
  if (!orgId) return { orgId, ok: false, error: "Order is not linked to a workspace." };

  const [type, ref, cycle] = order.note.split(":");

  // Cross-check the amount actually paid against the catalogue price for that
  // plan/pack — defends against any tampered or stale order.
  let expected = 0;
  if (type === "plan") {
    const p = PLANS.find((x) => x.id === ref);
    expected = p ? (cycle === "annual" ? p.annual : p.monthly) : 0;
  } else if (type === "credits") {
    const pk = CREDIT_PACKS.find((x) => x.id === ref);
    expected = pk ? pk.price : 0;
  }
  /*
    Tolerance was ₹1, which is not a rounding allowance — it is a discount.
    We set the order amount ourselves from the same catalogue constant, so the
    only legitimate difference is sub-paisa float representation. One paisa is
    the smallest unit that exists in INR; anything more is either tampering or
    a genuine mismatch, and both should refuse rather than quietly grant.
  */
  if (expected > 0 && order.amount + 0.01 < expected) {
    // Underpaid — record for audit, do NOT grant.
    await svc.from("payments").upsert(
      { order_id: orderId, org_id: orgId, kind: type, ref, amount: order.amount, status: "amount_mismatch" },
      { onConflict: "order_id", ignoreDuplicates: true },
    );
    return { orgId, ok: false, error: "Payment amount did not match the plan price." };
  }

  // Claim the order idempotently. If a row already existed, `data` is empty and
  // we must NOT grant again.
  const { data: claimed, error: claimErr } = await svc.from("payments").upsert(
    { order_id: orderId, org_id: orgId, kind: type, ref, amount: order.amount, status: "paid" },
    { onConflict: "order_id", ignoreDuplicates: true },
  ).select("order_id");
  /*
    RETRYABLE. This is a database error, not a decision about the payment.

    The ₹1 live test failed exactly here — `payments.owner_id NOT NULL`, added
    by the other product that shares this table, rejected every Cortex insert.
    The money had left and the claim could not be written, so nothing was
    granted. Because this path was not marked retryable, the webhook would have
    acknowledged it and Cashfree would never have tried again: a permanent
    silent loss from a condition that a migration fixes in one line.

    Nothing has been granted at this point, and the unique index on order_id
    still prevents a duplicate, so asking for a retry is safe.
  */
  if (claimErr) return { orgId, ok: false, retryable: true, error: claimErr.message };
  const isNew = Array.isArray(claimed) && claimed.length > 0;

  // If we didn't claim it, make sure the existing row is actually a PAID one.
  // An earlier 'amount_mismatch' row would otherwise make every later attempt
  // report "already settled" while nothing was ever activated.
  if (!isNew) {
    const { data: prior } = await svc.from("payments").select("status").eq("order_id", orderId).maybeSingle();
    const priorStatus = String((prior as any)?.status || "");
    if (priorStatus && priorStatus !== "paid") {
      return { orgId, ok: false, error: `This order was previously recorded as "${priorStatus}" and cannot be activated. Please contact support.` };
    }
  }

  /** Release our claim so a webhook retry can settle this order again. */
  const releaseClaim = async () => {
    if (!isNew) return;
    try { await svc.from("payments").delete().eq("order_id", orderId); } catch { /* best effort */ }
  };

  if (type === "plan") {
    if (!PLANS.find((x) => x.id === ref)) return { orgId, ok: false, error: "Unknown plan." };
    if (isNew) {
      // A paid plan runs for a fixed period and then lapses — one payment must not
      // buy the product forever. If the workspace is already inside a paid period,
      // stack the new one on top of it rather than truncating what they've paid for.
      const days = cycle === "annual" ? 365 : 30;
      let from = Date.now();
      try {
        const { data: cur } = await svc.from("organizations").select("subscription_ends_at").eq("id", orgId).single();
        const existing = (cur as any)?.subscription_ends_at ? new Date((cur as any).subscription_ends_at).getTime() : 0;
        if (existing > from) from = existing;
      } catch { /* column not migrated yet — start from now */ }
      const endsAt = new Date(from + days * 86_400_000).toISOString();

      const patch: Record<string, any> = { plan: ref, subscription_status: "active" };
      const { error: withPeriod } = await svc.from("organizations")
        .update({ ...patch, subscription_ends_at: endsAt, subscription_cycle: cycle === "annual" ? "annual" : "monthly" })
        .eq("id", orgId);

      if (withPeriod) {
        // Only fall back for a genuinely missing column (the migration hasn't run
        // yet). Falling back on ANY error would turn a transient failure into a
        // permanent, never-expiring plan that was paid for once.
        const missingColumn = withPeriod.code === "PGRST204" || withPeriod.code === "42703"
          || /column .* does not exist/i.test(withPeriod.message || "");
        if (!missingColumn) {
          // Before re-opening this order for a retry, make sure the update
          // didn't actually land. Releasing a claim on a write that DID commit
          // is how one payment becomes two periods. The credits branch below
          // guards the same way, via the ledger reason.
          try {
            const { data: check } = await svc.from("organizations")
              .select("plan, subscription_ends_at").eq("id", orgId).single();
            const landed = (check as any)?.subscription_ends_at;
            // Compare instants, not strings: PostgREST returns "…+00:00" while
            // toISOString() produces "…Z", so === can never match.
            const sameInstant = landed && new Date(landed).getTime() === new Date(endsAt).getTime();
            if ((check as any)?.plan === ref && sameInstant) {
              emitQuietly(orgId, "payment.succeeded", { kind: "plan", plan: ref, cycle, amount: order.amount, order_id: orderId, ends_at: endsAt });
              return { orgId, ok: true, kind: "plan", plan: ref, cycle, endsAt };
            }
          } catch {
            /*
              THE READ-BACK ITSELF FAILED, so we do not know whether the update
              landed. This used to fall through and release the claim, which
              picks the worse of the two outcomes:

                released, but the update HAD committed  -> the retry stacks a
                  second paid period on the first (`from = max(existing, now)`
                  above). One payment, two periods, no error anywhere.

                kept, but the update had NOT committed  -> the customer paid and
                  has no plan. Visible to them immediately, and support can fix
                  it from the payments row.

              The first is silent revenue loss that nobody discovers; the second
              is a complaint that gets resolved. So keep the claim, and mark the
              row so it is findable rather than looking like a normal payment.
            */
            try {
              await svc.from("payments")
                .update({ status: "grant_unverified" }).eq("order_id", orderId);
            } catch { /* best effort — the status is a signal, not the control */ }
            return { orgId,
              ok: false,
              error: "We could not confirm the activation. Your payment is recorded — contact support and quote order " + orderId + ".",
            };
          }
          await releaseClaim(); // let the webhook retry settle this order properly
          return { orgId, ok: false, retryable: true, error: withPeriod.message || "Could not activate the plan." };
        }
        const retry = await svc.from("organizations").update(patch).eq("id", orgId);
        if (retry.error) { await releaseClaim(); return { orgId, ok: false, retryable: true, error: retry.error.message }; }
      }

      try { await svc.from("subscriptions").insert({ org_id: orgId, plan: ref, status: "active", provider: "cashfree", amount: order.amount, reference: orderId }); } catch { /* audit only */ }

      /*
        Pay the referral, if this workspace was referred and has not been paid
        for yet. Placed HERE — after the plan is confirmed active — because the
        whole point of rewarding on qualification rather than signup is that a
        throwaway account must not earn anybody credits.

        Idempotent in SQL: cortex_reward_referral() locks the row and only acts
        on a 'pending' one, so a duplicated Cashfree webhook, a retry, or next
        month's renewal all return 0. Wrapped anyway — a referral must never be
        the reason a customer who has paid does not get their plan.
      */
      try { await rewardReferral(orgId); } catch { /* never block activation */ }
      emitQuietly(orgId, "payment.succeeded", { kind: "plan", plan: ref, cycle, amount: order.amount, order_id: orderId, ends_at: endsAt });
      return { orgId, ok: true, kind: "plan", plan: ref, cycle, endsAt };
    }
    return { orgId, ok: true, already: true, kind: "plan", plan: ref, cycle };
  }

  if (type === "credits") {
    const pack = CREDIT_PACKS.find((p) => p.id === ref);
    if (!pack) return { orgId, ok: false, error: "Unknown credit pack." };
    if (isNew) {
      // The ledger reason carries the order id, which makes the grant itself
      // idempotent. That matters because releaseClaim() below re-opens the order
      // for a webhook retry: without this, a grant that COMMITTED but whose
      // response was lost (lambda timeout, dropped connection) would be applied
      // a second time by that retry.
      const reason = `topup:${pack.id}:${orderId}`;
      const alreadyGranted = async () => {
        try {
          const { data } = await svc.from("credit_ledger").select("balance_after").eq("org_id", orgId).eq("reason", reason).limit(1);
          return Array.isArray(data) && data.length > 0 ? Number((data[0] as any).balance_after) : null;
        } catch { return null; }
      };

      const prior = await alreadyGranted();
      if (prior !== null) return { orgId, ok: true, already: true, kind: "credits", credits: pack.credits, balance: prior };

      try {
        const balance = await grantCredits(orgId, pack.credits, reason, null);
        return { orgId, ok: true, kind: "credits", credits: pack.credits, balance };
      } catch (e: any) {
        // Did it actually land before the error? If so, this was a lost response,
        // not a failed grant — keep the claim and report success.
        const landed = await alreadyGranted();
        if (landed !== null) return { orgId, ok: true, kind: "credits", credits: pack.credits, balance: landed };

        // Genuinely not credited. Release the claim so the webhook retry can.
        await releaseClaim();
        return { orgId, ok: false, retryable: true, error: e?.message || "Could not add the credits. Please contact support." };
      }
    }
    return { orgId, ok: true, already: true, kind: "credits", credits: pack.credits };
  }

  return { orgId, ok: false, error: "Unknown order type." };
}
