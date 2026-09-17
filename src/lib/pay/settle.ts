import "server-only";
import { getOrder } from "@/lib/pay/cashfree";
import { serviceClient } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/credits";
/*
  ALL_PLANS, not PLANS. This product has retired four plan ids, and `ref` comes
  from the order note written when CHECKOUT STARTED. A customer who opened
  checkout on a plan that was retired before they paid — or, far more commonly,
  a recurring mandate created against one — hit `unknown_ref`: money taken,
  nothing granted, permanently, because every later attempt refuses the same
  way. Resolving retired ids means they get exactly what they bought; refusing
  to SELL a retired plan is the checkout route's job, not settlement's.
*/
import { ALL_PLANS, CREDIT_PACKS, PLAN_CREDITS } from "@/lib/config";
import { nextPeriod, pricePerDay } from "@/lib/pay/period";
import { operatorAlert } from "@/lib/operator-alert";
import { PAYMENTS_TABLE } from "@/lib/pay/table";
import { emitQuietly } from "@/lib/webhooks";
import { recordQuietly as recordFunnel } from "@/lib/funnel";
import { rewardReferral } from "@/lib/referrals";
import { sendPaymentReceipt } from "@/lib/pay/receipt";

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
 * repeatedly. WHAT MAKES IT SAFE IS NOT THE CLAIM ROW — that was the old
 * comment here, and it was wrong once this function learned to repair a grant
 * that never happened, because it now runs the grant whether or not it won the
 * claim. Three things make a repeat harmless:
 *
 *   credits — a unique index on credit_ledger(org_id, reason), so the database
 *             refuses a second grant for the same order;
 *   plans   — period_to, reserved on the payment row BEFORE the workspace is
 *             updated, so a re-grant re-applies the same end date rather than
 *             adding another period;
 *   both    — granted_at, written only once the entitlement is confirmed, which
 *             is what tells an honest "already done" from a claim that lied.
 *
 * The order's own customer_id (which we set to the org id at creation) is the
 * source of truth for which workspace to credit, so the webhook needs no user
 * session.
 */
/**
 * How old a payment may be and still be settled or repaired automatically.
 *
 * WITHOUT THIS, TEACHING settleOrder TO REPAIR A GRANT OPENED A HOLE.
 *
 * Cashfree answers "PAID" for an order from six months ago, and repair is
 * keyed on the payment row, not on time — so replaying an old order id
 * re-entered the grant path and wrote a FRESH period from today. Any member of
 * the workspace could do it from the return-page verify endpoint, once per
 * historical order, for free. The same mechanism would have fired
 * automatically on deploy: the backfill leaves rows it cannot evidence with
 * granted_at null, reconciliation works exactly that queue, and it would have
 * re-granted months-old orders across every workspace — including writing
 * `plan` back to what an old order bought.
 *
 * Seven days is far longer than any legitimate settlement path. Cashfree's
 * retries finish within hours; the reconciliation job runs nightly. Anything
 * older is history, and history is repaired by a person looking at it, not by
 * a webhook. An order past the window is recorded and escalated rather than
 * silently refused.
 */
const REPAIR_WINDOW_DAYS = 7;

export async function settleOrder(orderId: string): Promise<SettleResult> {
  if (!orderId) return { ok: false, error: "Missing order." };
  const svc = serviceClient();
  if (!svc) return { ok: false, error: "Service role not configured." };

  const order = await getOrder(orderId);
  /*
    "Could not ask" is retryable; "asked, not paid" is not. Collapsing the two
    is how a captured payment reached an acknowledged webhook with no record of
    itself — see the note on getOrder in lib/pay/cashfree.ts.
  */
  if (order.unknown) {
    return { ok: false, retryable: true, error: "Could not reach Cashfree to confirm this order. Will retry." };
  }
  if (!order.paid) return { ok: false, pending: true, error: "Payment not completed yet." };

  const orgId = (order.customerId || "").trim();
  if (!orgId) return { orgId, ok: false, error: "Order is not linked to a workspace." };

  const [type, ref, cycle] = order.note.split(":");

  // Cross-check the amount actually paid against the catalogue price for that
  // plan/pack — defends against any tampered or stale order.
  let expected = 0;
  if (type === "plan") {
    const p = ALL_PLANS.find((x) => x.id === ref);
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
  /*
    A ZERO-PRICED PLAN MUST NOT SKIP THE AMOUNT CHECK.

    `enterprise` sits in the catalogue at monthly: 0, annual: 0 — it is the
    "contact sales" entry. `expected` therefore stayed 0, the cross-check below
    is guarded on `expected > 0`, and an order noted `plan:enterprise:monthly`
    would have granted a full Enterprise period for whatever was actually paid.
    The checkout route refuses to CREATE such an order, but settleOrder is also
    reachable from the webhook, the verify route and reconciliation, and "no
    other caller can produce this" is not a control.
  */
  if (type === "plan" && expected <= 0) {
    await auditRow(svc, { order_id: orderId, org_id: orgId, kind: type, ref, amount: order.amount, status: "unknown_ref" });
    await operatorAlert({
      kind: "settle_zero_priced_plan",
      severity: "red",
      title: `Order ${orderId} names a plan with no price`,
      body: `Plan "${ref}" has no ${cycle === "annual" ? "annual" : "monthly"} price in the catalogue, so the amount `
        + `paid could not be checked against anything. Nothing was granted. This is a sales-negotiated plan — `
        + `grant it by hand once the amount is confirmed.`,
      orgId, orderId,
    });
    return { orgId, ok: false, error: `We could not price this plan automatically. Your payment is recorded — contact support and quote order ${orderId}.` };
  }
  if (expected > 0 && order.amount + 0.01 < expected) {
    // Underpaid — record for audit, do NOT grant.
    await auditRow(svc, { order_id: orderId, org_id: orgId, kind: type, ref, amount: order.amount, status: "amount_mismatch" });
    recordFunnel("payment_failed", { orgId, meta: { reason: "amount_mismatch", ref, amount: order.amount } });
    return { orgId, ok: false, error: "Payment amount did not match the plan price." };
  }

  /*
    VALIDATE BEFORE CLAIMING. THE ORDER OF THESE TWO BLOCKS WAS THE BUG.

    The claim below writes `status: "paid"`. Three exits AFTER it — "Unknown
    plan", "Unknown credit pack", "Unknown order type" — return without calling
    releaseClaim(). So an order whose note names something not in the catalogue
    was recorded as PAID, granted nothing, and could never recover: every retry
    finds a prior row whose status IS "paid", passes the `priorStatus !== "paid"`
    guard, and falls through to the same refusal again. Money taken, nothing
    given, and no code path that could ever fix it.

    That is not hypothetical. `ref` comes from the order note written when
    checkout STARTED, so a checkout opened before a plan id was renamed or
    retired — this product has already retired four plan ids — settles into
    exactly this state. So does an order whose note came back empty.

    And the amount cross-check above is complicit: `expected` stays 0 for an
    unknown ref, so `expected > 0 && ...` skips, and an unrecognised order is
    also an unverified one.

    Checked here, before anything is written. `unknown_ref` is a distinct status
    so the row is findable rather than looking like a normal payment — the
    superadmin console lists it (see admin-metrics.ts) instead of filtering it
    out.
  */
  const knownRef =
    (type === "plan" && !!ALL_PLANS.find((x) => x.id === ref)) ||
    (type === "credits" && !!CREDIT_PACKS.find((x) => x.id === ref));
  if (!knownRef) {
    await auditRow(svc, { order_id: orderId, org_id: orgId, kind: type || "unknown", ref: ref || null, amount: order.amount, status: "unknown_ref" });
    recordFunnel("payment_failed", { orgId, meta: { reason: "unknown_ref", ref: ref || "", type: type || "" } });
    return { orgId, ok: false, error: `We could not match this payment to a current plan or pack. Your payment is recorded — contact support and quote order ${orderId}.` };
  }

  // Claim the order. If a row already existed, `data` comes back empty — which
  // no longer means "do not grant": it means an earlier attempt got this far,
  // and whether it actually granted is decided by granted_at below. See the
  // header for what makes re-granting safe.
  const { data: claimed, error: claimErr } = await svc.from(PAYMENTS_TABLE).upsert(
    /*
      `cycle` is stored because a REFUND has to reverse the period THIS payment
      bought. Without it, refund.ts read organizations.subscription_cycle — the
      workspace's cycle today — and refunding one ₹799 month on a workspace that
      had once bought annual removed 365 days.
    */
    { order_id: orderId, org_id: orgId, kind: type, ref, amount: order.amount, status: "paid",
      cycle: type === "plan" ? (cycle === "annual" ? "annual" : "monthly") : null },
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
    const { data: prior } = await svc.from(PAYMENTS_TABLE).select("status").eq("order_id", orderId).maybeSingle();
    const priorStatus = String((prior as any)?.status || "");
    /*
      REPAIRABLE STATUSES MUST BE LET THROUGH.

      This refused anything that was not exactly "paid" — including
      `grant_failed` and `grant_unverified`, which are precisely the two rows
      the reconciliation job feeds back in to be repaired. So every run reported
      them unresolved, emailed the operator about them nightly, and the endpoint
      answered 409 for ever, while the customer stayed unpaid-for.

      The refusals that remain are the permanent ones: a wrong amount, an
      unrecognised plan, and anything already refunded. Those should never
      silently become an entitlement.
    */
    const REPAIRABLE = new Set(["paid", "grant_failed", "grant_unverified"]);
    if (priorStatus && !REPAIRABLE.has(priorStatus)) {
      return { orgId, ok: false, error: `This order was previously recorded as "${priorStatus}" and cannot be activated. Please contact support.` };
    }
  }

  /** Release our claim so a webhook retry can settle this order again. */
  const releaseClaim = async () => {
    if (!isNew) return;
    try { await svc.from(PAYMENTS_TABLE).delete().eq("order_id", orderId); } catch { /* best effort */ }
  };

  if (type === "plan") {
    const planDef = ALL_PLANS.find((x) => x.id === ref);
    if (!planDef) return { orgId, ok: false, error: "Unknown plan." };

    /*
      ONE PATH, WHETHER OR NOT WE WON THE CLAIM. THAT IS THE FIX.

      This branch used to be `if (isNew) { …grant… }` followed by, for the
      not-new case, a read of the org row and then:

          return { ok: false, retryable: true,
                   error: `…recorded as paid but the plan is not active…` }

      above a comment promising "we fall through to grant it now". It did not
      grant. It returned. So the one situation the whole not-new branch exists
      for — a claim written, then the process dying before the grant — was
      answered by asking Cashfree to retry into the identical dead end, for as
      many retries as Cashfree allows, after which the row sits at
      `status: 'paid'` for ever: counted as revenue by admin-metrics, excluded
      from its failed-payments list by construction, and invisible on every
      screen. The customer paid ₹39,999, has no plan, and nothing anywhere says
      so.

      Granting is now the same code on both paths, and it is safe to run twice
      because THE PERIOD IS RECORDED ON THE PAYMENT. period_to holds the end
      date this payment produced; a re-grant re-applies that same date rather
      than computing a fresh one, so re-running cannot stack a second period.
      Two concurrent first attempts also converge: they read the same prior
      state and the arithmetic is deterministic, so both write the same end
      date.
    */
    const { data: payRow } = await svc.from(PAYMENTS_TABLE)
      .select("granted_at, period_to, created_at").eq("order_id", orderId).maybeSingle();
    const alreadyGrantedAt = (payRow as any)?.granted_at || null;
    const recordedPeriodTo = (payRow as any)?.period_to || null;
    const rowAgeDays = (payRow as any)?.created_at
      ? (Date.now() - new Date((payRow as any).created_at).getTime()) / 86_400_000
      : 0;

    /*
      TOO OLD TO GRANT AUTOMATICALLY. See REPAIR_WINDOW_DAYS.

      A period is only ever CREATED on the first settlement or RE-APPLIED from
      period_to. An old row with no recorded period is the dangerous
      combination — nothing to re-apply, and a fresh period would be a gift —
      so it stops here and goes to a person.
    */
    if (!alreadyGrantedAt && !recordedPeriodTo && rowAgeDays > REPAIR_WINDOW_DAYS) {
      await svc.from(PAYMENTS_TABLE).update({ status: "grant_unverified" }).eq("order_id", orderId);
      await operatorAlert({
        kind: "settle_outside_repair_window",
        severity: "amber",
        title: `Order ${orderId} is too old to activate automatically`,
        body: `It is ${Math.round(rowAgeDays)} days old, was never confirmed as granted, and carries no recorded `
          + `period, so granting now would create a period from today rather than restoring one. Check whether `
          + `${orgId} received the ${ref} plan and grant it by hand if not.`,
        orgId, orderId, email: false,
      });
      return { orgId, ok: false,
        error: `This payment is too old to activate automatically. Your payment is recorded — contact support and quote order ${orderId}.` };
    }

    /* Read the workspace once: it decides both "is this already granted" and,
       if not, what the new period should be worth. */
    let existingEndsMs = 0;
    let priorPlan = "";
    let priorCycle = "";
    let orgReadable = true;
    try {
      /*
        READ THE ERROR. supabase-js returns { error } for an HTTP-level failure
        and only throws on a socket failure, so `try/catch` alone left
        orgReadable permanently true — a failed read silently started the period
        from today, quietly discarding whatever days the customer had left, and
        the operator alert below was unreachable code.
      */
      const { data: cur, error: orgErr } = await svc.from("organizations")
        .select("plan, subscription_ends_at, subscription_cycle").eq("id", orgId).single();
      if (orgErr) orgReadable = false;
      existingEndsMs = (cur as any)?.subscription_ends_at ? new Date((cur as any).subscription_ends_at).getTime() : 0;
      priorPlan = String((cur as any)?.plan || "").toLowerCase();
      priorCycle = String((cur as any)?.subscription_cycle || "");
    } catch { orgReadable = false; /* socket failure */ }

    /* Genuinely done: we recorded a grant AND the workspace shows it. Both
       halves are required — a granted_at beside a workspace on the old plan is
       the failure this branch is here to repair, not a reason to stop. */
    const liveOnThisPlan = priorPlan === String(ref).toLowerCase() && existingEndsMs > Date.now();
    if (alreadyGrantedAt && liveOnThisPlan) {
      return { orgId, ok: true, already: true, kind: "plan", plan: ref, cycle,
        endsAt: new Date(existingEndsMs).toISOString() };
    }
    if (!isNew && !alreadyGrantedAt) {
      console.warn(`[settle] re-granting ${ref} for order ${orderId}: the claim exists but no grant was recorded.`);
    }

    const boughtDays = cycle === "annual" ? 365 : 30;

    /*
      THE PERIOD, AND WHY IT IS NO LONGER A PLAIN STACK.

      `from = max(existing_ends_at, now)` is right for a renewal and wrong for a
      plan change, because the carried days were bought at the OLD plan's price
      and were then honoured at the new plan's. Buying Try annual (₹7,990) and
      then Command monthly (₹39,999) produced thirteen months of Command for
      ₹47,989 — Command lists at ₹39,999 a month. lib/pay/period.ts carries the
      VALUE of the remaining days instead, and leaves a same-plan renewal
      stacking exactly as before.
    */
    const priorDef = priorPlan ? ALL_PLANS.find((x) => x.id === priorPlan) : null;
    const decision = nextPeriod({
      now: Date.now(),
      existingEndsAt: existingEndsMs,
      boughtDays,
      priorPlan,
      newPlan: ref,
      priorPricePerDay: pricePerDay(priorDef, priorCycle || (existingEndsMs ? "monthly" : "")),
      newPricePerDay: pricePerDay(planDef, cycle),
    });
    /* A recorded period wins: re-applying the same end date is what makes a
       re-grant idempotent. */
    const endsAt = recordedPeriodTo
      ? new Date(recordedPeriodTo).toISOString()
      : new Date(decision.endsAt).toISOString();

    /*
      RESERVE THE PERIOD BEFORE GRANTING IT. THIS ORDER IS THE WHOLE GUARANTEE.

      The first version of this wrote period_to AFTER the workspace update, in a
      best-effort helper that swallowed its own failures — which left a window
      that turned the repair into the bug it was fixing: update committed,
      period_to not recorded. On re-entry, granted_at was null, period_to was
      null, so a fresh period was computed against the ALREADY-EXTENDED end
      date, and because `plan` now equalled `ref` the period module treated it
      as a renewal and stacked another thirty days. One payment, two periods —
      and reconcile.ts works exactly that queue, so it would have industrialised
      it across every row.

      Writing the intended end date first inverts the risk. If this write lands
      and the grant then fails, the retry re-applies the SAME date, which is
      idempotent. If this write fails we do not grant at all, and the row stays
      in the reconciliation queue where it belongs.

      Two things bound the remaining risk rather than eliminating it, and both
      are load-bearing: markGranted writes granted_at in a statement of its own
      (so a missing period_to column cannot stop it landing), and
      REPAIR_WINDOW_DAYS refuses to invent a period for an old row that has
      none recorded. Without the second, a payment row from before this
      migration — period_to null by definition — would have been re-granted a
      fresh period on demand.
    */
    if (!recordedPeriodTo) {
      const reserve = await svc.from(PAYMENTS_TABLE)
        .update({ period_to: endsAt, cycle: cycle === "annual" ? "annual" : "monthly" })
        .eq("order_id", orderId).select("order_id");
      if (reserve.error || !Array.isArray(reserve.data) || reserve.data.length === 0) {
        /* PGRST204 means the column is not migrated yet. Grant anyway — an
           un-migrated database must not stop a customer getting their plan —
           but say so, because the idempotency guarantee above is absent until
           the migration runs. */
        const notMigrated = reserve.error?.code === "PGRST204" || /column .* does not exist/i.test(reserve.error?.message || "");
        if (!notMigrated) {
          return { orgId, ok: false, retryable: true,
            error: `Could not reserve the paid period for ${orderId}: ${reserve.error?.message || "the payment row was not found"}. Retrying.` };
        }
        console.error("[settle] cortex_payments.period_to is missing — granting without re-grant protection. Run 2026_zzzi_payment_integrity.sql.");
      }
    }

    const patch: Record<string, any> = { plan: ref, subscription_status: "active" };

    /*
      AN UPGRADE HAS TO DELIVER THE CREDITS IT WAS SOLD ON, TODAY.

      This function sets `plan` and never grants credits for a plan purchase.
      Credits arrive lazily through sync_allowance(), which pays out only when
      `credits_reset_at is null or < now()` — and nothing in the payment path
      touched that column. So a customer on Try (735 credits) who upgrades to
      Command (37,000) on day 5 of their cycle receives ZERO additional
      credits until day 30, while paying ₹39,999 for them.

      They will not read it as a scheduling nuance. They paid fifty times more
      and the number on the usage page did not move.

      Clearing credits_reset_at makes the very next sync_allowance() top them
      up to the NEW plan's allowance immediately. Deliberately narrow:

      - only when the plan actually CHANGED, so a renewal or a second month
        bought early cannot mint a duplicate allowance; and
      - only when the new allowance is LARGER, so this is an upgrade path and
        not a way to farm credits by hopping between tiers.

      Also only when this is not a REPEAT of a grant we already recorded — a
      re-grant after a crash must repair the period, not mint a second
      allowance.

      The leftover balance from the old plan is not clawed back. They paid for
      those too.
    */
    const priorAllowance = PLAN_CREDITS[priorPlan] ?? 0;
    const newAllowance = PLAN_CREDITS[ref] ?? 0;
    const isUpgrade = !alreadyGrantedAt && priorPlan !== ref && newAllowance > priorAllowance && newAllowance > 0;
    if (isUpgrade) patch.credits_reset_at = null;

    /* Set when the update reported an error that had actually committed. The
       grant is real, so the common tail below must still run. */
    let landedDespiteError = false;

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
        // Before reporting failure, make sure the update didn't actually land.
        // Treating a committed write as failed is how one payment becomes two
        // periods on the retry.
        try {
          const { data: check, error: checkErr } = await svc.from("organizations")
            .select("plan, subscription_ends_at").eq("id", orgId).single();
          /* An error here means we do not KNOW whether the update landed, which
             is the case the block below exists for. Without this throw, a
             returned error read as "did not land" and the function reported a
             clean failure for a write that may well have committed. */
          if (checkErr) throw new Error(checkErr.message);
          const landed = (check as any)?.subscription_ends_at;
          // Compare instants, not strings: PostgREST returns "…+00:00" while
          // toISOString() produces "…Z", so === can never match.
          const sameInstant = landed && new Date(landed).getTime() === new Date(endsAt).getTime();
          if ((check as any)?.plan === ref && sameInstant) {
            /*
              THE WRITE DID LAND. Fall through to the common tail rather than
              returning here.

              This branch used to return immediately after the receipt, which
              skipped three things the normal path does: the referral payout,
              the subscriptions audit row, and the immediate sync_allowance
              top-up. So a customer whose update reported an error that had in
              fact committed got their plan, no referral was ever paid for them,
              and they landed back on /billing having paid ₹39,999 to see the
              old credit balance — the exact complaint the top-up exists to
              prevent.
            */
            landedDespiteError = true;
          }
        } catch {
          /*
            THE READ-BACK ITSELF FAILED, so we do not know whether the update
            landed. Keep the claim (deleting it is how one payment becomes two
            periods) and mark the row so it is findable rather than looking
            like a normal payment. granted_at stays null, which is now the
            reconciliation job's queue, so this repairs itself.
          */
          try {
            await svc.from(PAYMENTS_TABLE)
              .update({ status: "grant_unverified" }).eq("order_id", orderId);
          } catch { /* best effort — the status is a signal, not the control */ }
          return { orgId,
            ok: false,
            error: "We could not confirm the activation. Your payment is recorded — contact support and quote order " + orderId + ".",
          };
        }
        /*
          The write failed and did not land. Do NOT delete the claim: the row is
          the only record that money was taken, and granted_at (still null) is
          what puts it in the reconciliation queue. Ask for a retry — which now
          re-enters this same granting path rather than the old dead end.
        */
        if (!landedDespiteError) {
          return { orgId, ok: false, retryable: true, error: withPeriod.message || "Could not activate the plan." };
        }
      }
      /*
        STRIP credits_reset_at TOO.

        This fallback exists for a database where the subscription-period
        columns have not been migrated yet. `patch` now also carries
        credits_reset_at (the upgrade top-up), which arrives with
        2026_credit_metering.sql — so on a database missing EITHER migration
        the retry would re-send a column that does not exist, fail again, and
        let the webhook retry into the same wall. The customer pays ₹39,999 and
        never gets a plan.

        The fallback's job is to grant the plan with whatever columns DO exist.
        Anything optional comes off.
      */
      if (!landedDespiteError) {
        const { credits_reset_at, ...core } = patch as any;
        const retry = await svc.from("organizations").update(core).eq("id", orgId);
        if (retry.error) return { orgId, ok: false, retryable: true, error: retry.error.message };
      }
    }

    /*
      RECORD THE GRANT. This is the line that makes "paid" mean "received".

      granted_at is written only here, after the entitlement is in place, so
      `status = 'paid' and granted_at is null` is an honest queue of customers
      who paid and are waiting. period_to records what this payment bought, so
      a refund reverses the right period and a re-grant re-applies rather than
      re-adds.
    */
    await markGranted(svc, orderId, endsAt);

    /*
      Top up NOW rather than on their next AI call.

      Clearing credits_reset_at above makes the allowance DUE; sync_allowance
      is what actually pays it, and it is only ever called from
      getCreditStatus() and chargeForMode(). Waiting for one of those means
      the customer lands back on /billing having just paid ₹39,999 and sees
      the old balance — which reads as "the payment did not work", and the
      support message is already written before the number ever moves.

      Best effort by design: the plan is granted and committed at this point,
      and lib/credits.ts will do exactly this on the next read anyway. This
      only decides whether they see it in five seconds or five minutes.
    */
    if (isUpgrade) {
      try {
        await svc.rpc("sync_allowance", { p_org: orgId, p_amount: newAllowance, p_days: 30 });
      } catch { /* the lazy path in lib/credits.ts still covers it */ }
    }

    /* Audit row, once per payment. Keyed off alreadyGrantedAt so a repair
       re-grant does not add a second subscription record for one payment. */
    if (!alreadyGrantedAt) {
      try { await svc.from("subscriptions").insert({ org_id: orgId, plan: ref, status: "active", provider: "cashfree", amount: order.amount, reference: orderId }); } catch { /* audit only */ }
    }

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

    /* A revalued plan change is not what the old code did, so say so where
       somebody debugging a period can see it. Not customer-facing. */
    if (decision.revalued && !recordedPeriodTo) {
      console.log(`[settle] ${orgId} changed ${priorPlan || "(none)"}→${ref}: carried ${decision.carriedDays}d of value + ${decision.boughtDays}d bought`);
    }
    /*
      A PLAN CHANGE WE COULD NOT PRICE IS THE FREE-UPGRADE HOLE, STILL OPEN.

      period.ts returns a note when one of the two plans has no resolvable
      price, and carries the days at face value — which is the old behaviour and
      is the right fallback, but it is also exactly the case the revaluation
      exists to stop. `organizations.plan` legitimately holds ids that are not
      in the catalogue (signup defaults, hand-set values), so this is reachable
      without anything being broken. The note was computed and then discarded,
      which made the gap silent; it is now an operator alert.
    */
    if (decision.note && decision.carriedDays > 0 && !recordedPeriodTo) {
      await operatorAlert({
        kind: "plan_period_not_revalued",
        severity: "amber",
        title: `Plan change on ${orgId} was not revalued`,
        body: `Order ${orderId}: ${priorPlan || "(no plan)"} → ${ref}. ${decision.note}. `
          + `${Math.round(decision.carriedDays)} day(s) were carried at face value, so if the old plan was cheaper `
          + `this workspace now holds the new plan for longer than it paid for. Check and adjust.`,
        orgId, orderId, email: false,
      });
    }
    if (!orgReadable) {
      /* We could not read the workspace, so the period started from now and any
         days they had left were lost. Small, but it is their money. */
      await operatorAlert({
        kind: "plan_period_unknown_prior",
        severity: "amber",
        title: `Could not read the workspace before granting ${ref}`,
        body: `Order ${orderId}: the period was started from today because organizations could not be read. `
          + `If this workspace had days remaining, they were not carried over — check and extend by hand.`,
        orgId, orderId, email: false,
      });
    }

    emitQuietly(orgId, "payment.succeeded", { kind: "plan", plan: ref, cycle, amount: order.amount, order_id: orderId, ends_at: endsAt });
    recordFunnel("payment_succeeded", { orgId, meta: { kind: "plan", plan: ref, cycle, amount: order.amount } });
    /* Our own receipt, in our own name. The gateway's confirmation carries
       the merchant ACCOUNT's identity, which is shared and is not the product
       the customer bought. Best-effort: the grant has already committed and
       must not depend on mail. */
    void sendPaymentReceipt({ orgId, orderId, amount: order.amount, kind: "plan", ref,
      label: `the ${ref} plan (${cycle === "annual" ? "annual" : "monthly"})`, endsAt });
    return { orgId, ok: true, kind: "plan", plan: ref, cycle, endsAt };
  }

  if (type === "credits") {
    const pack = CREDIT_PACKS.find((p) => p.id === ref);
    if (!pack) return { orgId, ok: false, error: "Unknown credit pack." };
    {
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

      /*
        THE CHECK NOW RUNS WHETHER OR NOT WE CLAIMED THE ORDER, and that is the
        fix.

        This whole block used to sit inside `if (isNew)`, with a bare
        `return { ok: true, already: true }` for the not-new case — a claim
        found, therefore assumed granted. But the claim is written BEFORE the
        grant. If the process dies in between — a lambda hitting its wall clock,
        a dropped connection — the row says "paid" and no credits exist. Every
        subsequent retry then took the not-new path, reported success, and
        Cashfree stopped retrying. The customer paid, received nothing, and the
        row counted as revenue in the operator console: indistinguishable from a
        good sale, with no error anywhere.

        The ledger is the only honest evidence that the grant happened, so it is
        what we consult. Asking it on every path costs one indexed read and
        turns "we have a claim" into "we have a grant". The grant below is
        idempotent on the same reason, so falling through is safe even if two
        retries race.
      */
      const prior = await alreadyGranted();
      if (prior !== null) {
        /* The grant is there. Make sure the payment row SAYS so — an earlier
           attempt may have granted and died before recording it, and a row that
           reads "paid" with no granted_at sits in the reconciliation queue for
           ever otherwise. */
        await markGranted(svc, orderId, null);
        return { orgId, ok: true, already: true, kind: "credits", credits: pack.credits, balance: prior };
      }

      try {
        const balance = await grantCredits(orgId, pack.credits, reason, null);
        await markGranted(svc, orderId, null);
        recordFunnel("payment_succeeded", { orgId, meta: { kind: "credits", pack: pack.id, amount: order.amount } });
        void sendPaymentReceipt({ orgId, orderId, amount: order.amount, kind: "credits", ref,
          label: `${pack.credits.toLocaleString("en-IN")} credits` });
        return { orgId, ok: true, kind: "credits", credits: pack.credits, balance };
      } catch (e: any) {
        /*
          TWO DIFFERENT FAILURES LOOK ALIKE HERE, and one of them is now
          impossible to get wrong.

          The verify route (the customer landing back on the return page) and
          the webhook run CONCURRENTLY by design. Both used to read "no prior
          grant" — a read cannot exclude a writer — and both then granted, so
          one payment delivered two packs. 2026_zzzi_payment_integrity.sql adds
          a unique index on (org_id, reason) for money reasons, so the database
          now refuses the second one with 23505. That is not a failure: it
          means the other caller won.
        */
        const landed = await alreadyGranted();
        if (landed !== null) {
          await markGranted(svc, orderId, null);
          return { orgId, ok: true, kind: "credits", credits: pack.credits, balance: landed };
        }
        if (/duplicate key|23505/i.test(String(e?.message || ""))) {
          /* The index refused it but the ledger read came back empty — the
             winner had not committed when we looked. Ask for a retry rather
             than reporting a failure; nothing is double-granted either way. */
          return { orgId, ok: false, retryable: true, error: "Another attempt is already crediting this order." };
        }

        // Genuinely not credited. Release the claim so the webhook retry can.
        await releaseClaim();
        return { orgId, ok: false, retryable: true, error: e?.message || "Could not add the credits. Please contact support." };
      }
    }
  }

  return { orgId, ok: false, error: "Unknown order type." };
}

/**
 * Write the row that records a refusal — and make sure it actually exists.
 *
 * Each of these three refusals tells the customer "your payment is recorded"
 * and points them at support with an order id. That sentence is only true if
 * the row landed, and the upsert's error was discarded at all three sites, so
 * the one case where the reassurance was most needed was the case where it
 * could be false. If it cannot be written, the operator is told instead —
 * somebody now knows the payment exists even though our table does not.
 */
async function auditRow(svc: any, row: Record<string, any>): Promise<void> {
  try {
    const { error } = await svc.from(PAYMENTS_TABLE)
      .upsert(row, { onConflict: "order_id", ignoreDuplicates: true });
    if (!error) return;
    console.error(`[settle] could not record ${row.status} for ${row.order_id}:`, error.message);
    await operatorAlert({
      kind: "settle_audit_row_failed",
      severity: "red",
      title: `A refused payment could not be recorded`,
      body: `Order ${row.order_id} (${row.kind} ${row.ref || "—"}, ₹${row.amount}) was refused as "${row.status}" `
        + `and the row could not be written: ${error.message}. The customer has been told their payment is `
        + `recorded, so this is the only trace of it.`,
      orgId: row.org_id || null, orderId: row.order_id,
    });
  } catch (e: any) {
    console.error(`[settle] recording ${row.status} threw:`, e?.message);
  }
}

/**
 * Record that the customer actually RECEIVED what they paid for.
 *
 * `status: 'paid'` is written to CLAIM the order, before any entitlement
 * exists, so it answers "did the money arrive" and nothing more. It was
 * nevertheless the only thing anything read: admin-metrics counted it as
 * revenue and its failed-payments list excluded it by construction, so the one
 * case where a customer paid and got nothing appeared on no screen at all.
 *
 * granted_at is written only after the grant is confirmed present, which makes
 * `status = 'paid' and granted_at is null` a true queue of people who are owed
 * something. lib/pay/reconcile.ts works that queue nightly.
 *
 * period_to records the end date this payment produced, so a refund reverses
 * the period this payment bought, and a repair re-grant re-applies the same
 * date instead of stacking a second one.
 *
 * Best effort on purpose: the entitlement has already committed when this runs,
 * and failing to write a marker must not fail the payment. A miss leaves the
 * row in the reconciliation queue, which is the safe direction — the job
 * re-checks, finds the entitlement present, and marks it then.
 */
async function markGranted(svc: any, orderId: string, periodTo: string | null): Promise<void> {
  /*
    granted_at ALONE, in its own statement.

    It used to send period_to in the same update. On a database where that
    column is not migrated yet — the exact case the reservation step is written
    to tolerate — PostgREST fails the whole statement, so granted_at never
    landed either. The row then stayed in the reconciliation queue, and because
    `plan` now matched, each repair run took the same-plan renewal branch and
    stacked another period. One un-migrated column produced unbounded stacking.

    period_to is reserved BEFORE the grant and is not this function's business;
    the argument is kept only so the caller can say it does not need one.
  */
  void periodTo;
  try {
    const { error, data } = await svc.from(PAYMENTS_TABLE).update({
      granted_at: new Date().toISOString(),
    }).eq("order_id", orderId).select("order_id");
    /*
      A MISS IS LOGGED, not swallowed. PostgREST returns { error } rather than
      throwing, so the try/catch this used to rely on was dead code: a failed
      marker looked exactly like a successful one. The consequence is not
      cosmetic — an unmarked row stays in the reconciliation queue for ever and
      shows up in the operator console as a customer who paid and got nothing.
    */
    if (error || !Array.isArray(data) || data.length === 0) {
      console.error(`[settle] could not mark ${orderId} as granted:`,
        error?.message || "the update matched no row");
    }
  } catch (e: any) {
    console.error(`[settle] marking ${orderId} as granted threw:`, e?.message);
  }
}
