import "server-only";
import crypto from "crypto";
import { serviceClient } from "@/lib/supabase/server";
import { emitQuietly } from "@/lib/webhooks";
import { PAYMENTS_TABLE } from "@/lib/pay/table";
import { operatorAlert } from "@/lib/operator-alert";
import { planRefund, creditsToReclaim, daysToRemove, cycleDays, equivalentDays } from "@/lib/pay/refund-math";
import { ALL_PLANS } from "@/lib/config";
import { pricePerDay } from "@/lib/pay/period";

/**
 * Refunds, chargebacks and disputes.
 *
 * WHAT EXISTED BEFORE: nothing. A customer could buy the ₹8,999 pack of 10,000
 * credits, spend them, raise a chargeback, and keep the balance and the plan
 * permanently.
 *
 * THEN IT OVERCORRECTED: the first version reversed EVERYTHING on any refund
 * event, because it never read the refund amount. A ₹1 goodwill adjustment took
 * all 10,000 credits; Cashfree's own ₹1 mandate-authorisation reversal did the
 * same, and that is a normal event in the autorenew flow. It also read the
 * cycle from the WORKSPACE rather than the payment, so refunding one ₹799 month
 * could remove 365 days, and it ignored `subscription:<plan>` kinds entirely, so
 * renewal chargebacks reversed nothing at all.
 *
 * WHAT IT DOES NOW.
 *
 *   The arithmetic is in ./refund-math.ts and is executed by tests: a refund
 *   reverses its own share, partials accumulate, rounding favours the customer,
 *   and an amount we could not read reverses NOTHING and goes to a human.
 *
 *   IDEMPOTENCY IS PER EVENT, in payment_refunds (unique on order_id +
 *   event_id). A single `reversed_at` flag could not do this job and failed in
 *   both directions: a successful partial set it, and the later full refund
 *   then lost its claim and silently reversed nothing — customer refunded in
 *   full, product intact; while a partial PLAN refund had no guard at all,
 *   because plan reversals write no ledger row, so duplicate deliveries each
 *   subtracted days again.
 *
 *   How much has already been reversed is a SUM over those rows, not a column
 *   two concurrent handlers overwrite.
 *
 *   The period removed is the days that payment bought, converted into the plan
 *   the workspace is on today — 30 days of Command downgraded to Try is worth
 *   about 1,500 days of Try, and removing a flat 30 would leave four years of a
 *   refunded plan in place.
 *
 *   The operator is told through operator_alerts. The customer gets a note for
 *   an ordinary refund, which is information they want, and not for a dispute
 *   they raised themselves.
 */

export type RefundResult = {
  ok: boolean;
  action: "reversed" | "partial" | "already" | "not_found" | "recorded_only" | "needs_human";
  detail?: string;
};

export async function handleRefundEvent(
  type: string, body: any, orderIdFromEvent: string,
): Promise<RefundResult> {
  const svc = serviceClient();
  if (!svc) return { ok: false, action: "not_found", detail: "no service role" };

  /* Cashfree puts the order id in different places depending on the event. */
  const orderId = String(
    orderIdFromEvent
      || body?.data?.order?.order_id
      || body?.data?.refund?.order_id
      || body?.data?.dispute?.order_id
      || "",
  ).trim();
  if (!orderId) return { ok: false, action: "not_found", detail: "no order id on event" };

  const isDispute = /DISPUTE|CHARGEBACK/i.test(type);
  const refundAmount = readRefundAmount(body);
  const eventId = refundEventId(type, body, refundAmount);

  /*
    HAS THE MONEY ACTUALLY GONE BACK? NOTHING USED TO ASK.

    The webhook routes on the event NAME alone, and this handler read only the
    amount. So a REFUND_FAILED or a PENDING refund status — money still with
    us — reversed the customer's credits or shortened their plan. Worse, it
    claimed that refund's own id as the event id, so the later genuine
    REFUND_SUCCESS returned "already handled" and the real reversal never ran.

    A DISPUTE is not a refund either. Reversing at dispute CREATION takes the
    product away before anyone has decided the dispute, and there is no path
    that gives it back if the merchant wins. So a dispute is reversed only once
    it is lost or accepted; until then the operator is told and nothing changes
    for the customer.
  */
  const gate = refundReadiness(type, body, isDispute);
  if (!gate.act) {
    await operatorAlert({
      kind: gate.kind,
      severity: gate.severity,
      title: `${type} on ${orderId}: nothing reversed`,
      body: `${gate.why} Order ${orderId}. No entitlement was changed.`,
      orderId,
      email: gate.severity === "red",
    });
    return { ok: true, action: "recorded_only", detail: gate.why };
  }

  const { data: row } = await svc.from(PAYMENTS_TABLE)
    .select("order_id, org_id, kind, ref, amount, status, cycle, refunded_amount, reversed_at")
    .eq("order_id", orderId).maybeSingle();

  if (!row) {
    /*
      A refund for an order we hold no row for. The old code returned here with
      a comment saying "record the attempt so the reconciliation is not silent"
      and recorded nothing at all: no row, no alert, no log line, and the route
      acked 200.

      Reachable in normal operation — a mandate authorisation, or an order whose
      payment webhook never arrived. In the second case money was taken AND
      refunded and we knew about neither half.
    */
    const ins = await svc.from(PAYMENTS_TABLE).upsert({
      order_id: orderId, org_id: null, kind: "refund_unmatched", ref: type,
      amount: refundAmount ?? null, status: "refund_unmatched",
      refunded_amount: refundAmount ?? 0,
    }, { onConflict: "order_id", ignoreDuplicates: true }).select("order_id");
    if (ins.error) console.error("[refund] could not record an unmatched refund:", ins.error.message);
    await operatorAlert({
      kind: "refund_unmatched",
      severity: "red",
      title: `Refund for an order we have no record of`,
      body: `${type} arrived for order ${orderId}${refundAmount ? ` (₹${refundAmount})` : ""}. `
        + `We hold no payment row for it, so nothing could be reversed. Check Cashfree: if this order was `
        + `paid, the original webhook never landed and a customer may be holding un-paid-for entitlement.`,
      orderId,
    });
    return { ok: true, action: "not_found", detail: `no payment row for ${orderId}; recorded and escalated` };
  }

  const p = row as any;
  const orgId = String(p.org_id || "");
  const kind = String(p.kind || "");
  const ref = String(p.ref || "");
  const paid = Number(p.amount ?? 0);

  /*
    THE CLAIM, TAKEN FIRST AND PER EVENT.

    Inserting into payment_refunds is what makes this idempotent: the unique
    (order_id, event_id) means a duplicate delivery of the same refund loses,
    whatever kind of payment it is and whatever size the refund. A conditional
    update on a status or a timestamp could not do this — it cannot tell a
    repeat of one event from a second, genuinely different, partial refund.
  */
  const claim = await svc.from("payment_refunds").insert({
    order_id: orderId, event_id: eventId, event_type: type,
    amount: refundAmount, outcome: "claimed",
  }).select("id");
  if (claim.error) {
    if (/duplicate key|23505/i.test(claim.error.message || "")) {
      return { ok: true, action: "already", detail: `event ${eventId} already handled` };
    }
    /*
      The claim table is missing or unreachable. Refusing to act is wrong (the
      money has gone back and the entitlement would stay), and acting without a
      guard risks reversing twice. Throwing asks the webhook for a retry, which
      is the only honest option: the operator hears about it either way.
    */
    await operatorAlert({
      kind: "refund_claim_failed",
      severity: "red",
      title: `Could not claim refund ${eventId} on ${orderId}`,
      body: `${claim.error.message}. Nothing was reversed. If payment_refunds is missing, run `
        + `supabase/migrations/2026_zzzi_payment_integrity.sql.`,
      orgId: orgId || null, orderId,
    });
    throw new Error(`refund claim failed: ${claim.error.message}`);
  }

  /* What earlier events against this payment already did. Sums, so two
     concurrent handlers cannot each read a stale single column. */
  const { data: priorEvents } = await svc.from("payment_refunds")
    .select("event_id, amount, credits_taken, days_removed")
    .eq("order_id", orderId).neq("event_id", eventId);
  /*
    THE LEGACY COLUMN COUNTS TOO.

    payment_refunds did not exist until this migration, and the previous
    handler recorded what it reversed in cortex_payments.refunded_amount. Summing
    only the event rows meant any refund processed by the old code was
    invisible: a late or duplicate delivery for it computed refundedSoFar = 0,
    was classified as a FULL refund, and removed the whole cycle again — days
    that a later payment had bought.
  */
  const fromEvents = ((priorEvents as any[]) || []).reduce((n, r) => n + (Number(r.amount) || 0), 0);
  const refundedSoFar = Math.max(fromEvents, Number(p.refunded_amount) || 0);
  const creditsTakenSoFar = ((priorEvents as any[]) || []).reduce((n, r) => n + (Number(r.credits_taken) || 0), 0);
  const daysRemovedSoFar = ((priorEvents as any[]) || []).reduce((n, r) => n + (Number(r.days_removed) || 0), 0);

  const plan = planRefund({ paid, refundAmount, refundedSoFar, isDispute });

  if (plan.needsHuman) {
    /* Reverse nothing, record everything, put it in front of a person. The
       alternative — assuming the worst — confiscates a plan somebody paid for
       on the strength of a renamed JSON field. */
    const st = await svc.from(PAYMENTS_TABLE).update({ status: "refund_needs_review" }).eq("order_id", orderId).select("order_id");
    if (st.error) console.error("[refund] could not flag for review:", st.error.message);
    const oc = await svc.from("payment_refunds").update({ outcome: "needs_human" })
      .eq("order_id", orderId).eq("event_id", eventId).select("id");
    if (oc.error) console.error("[refund] could not record the needs_human outcome:", oc.error.message);
    await operatorAlert({
      kind: "refund_amount_unreadable",
      severity: "red",
      title: `Refund on order ${orderId} could not be sized`,
      body: `${type}. ${plan.why}. Paid ₹${paid}, previously refunded ₹${refundedSoFar}. `
        + `Nothing was reversed automatically. Decide the reversal by hand in Cashfree and on the workspace.`,
      orgId: orgId || null, orderId,
    });
    return { ok: true, action: "needs_human", detail: plan.why };
  }

  let action: RefundResult["action"] = "recorded_only";
  let detail = plan.why;
  let reversedSomething = false;
  let creditsTaken = 0;
  let daysRemoved = 0;

  if (orgId && kind === "credits") {
    try {
      /*
        LIKE PATTERNS ESCAPE THE ORDER ID.

        Order ids look like `mnb_1726_x9k2f`, and `_` is a single-character
        wildcard in LIKE — so an unescaped `topup:%:mnb_1726_x9k2f` can match a
        DIFFERENT order's grant, and the reclaim would then be sized against
        somebody else's purchase.
      */
      const oid = likeEscape(orderId);
      const { data: grant } = await svc.from("credit_ledger")
        .select("delta").eq("org_id", orgId).like("reason", `topup:%:${oid}`).limit(1);
      const granted = Number((grant as any[])?.[0]?.delta ?? 0);

      if (granted > 0) {
        const want = creditsToReclaim(granted, plan, creditsTakenSoFar);
        const { data: org } = await svc.from("organizations")
          .select("credits").eq("id", orgId).single();
        const balance = Number((org as any)?.credits ?? 0);
        const take = Math.min(want, Math.max(balance, 0));

        if (take > 0) {
          /*
            grant_credits(p_org, p_amount, p_user, p_reason, p_meta) — five
            arguments; p_user is not optional, and omitting it makes PostgREST
            fail to resolve the overload, which would make every reversal a
            silent no-op.

            The reason carries the order AND this event's id, because two
            partial refunds on one order are two distinct reversals and the
            unique index on (org_id, reason) would otherwise reject the second.
          */
          const { error: revErr } = await svc.rpc("grant_credits", {
            p_org: orgId, p_amount: -take, p_user: null,
            p_reason: `refund_reversal:${orderId}:${eventId}`, p_meta: { event: type, share: plan.share },
          });
          /*
            A DUPLICATE HERE IS NOT BENIGN and must not be swallowed. It means
            this exact reversal already exists in the ledger, so the credits
            were already taken — reporting "reclaimed N" on top of it would
            double-count in the record while taking nothing. Treat it as
            already-done.
          */
          if (revErr) {
            if (/duplicate key|23505/i.test(revErr.message || "")) {
              await svc.from("payment_refunds").update({ outcome: "already_in_ledger" })
                .eq("order_id", orderId).eq("event_id", eventId);
              return { ok: true, action: "already", detail: "this reversal is already in the ledger" };
            }
            throw new Error(revErr.message);
          }
          creditsTaken = take;
        }
        action = plan.full ? "reversed" : "partial";
        reversedSomething = true;
        detail = `${plan.why}; granted ${granted}, reclaimed ${take}`
          + (take < want ? ` (wanted ${want}, rest already spent)` : "");
      } else {
        detail = `${plan.why}; no matching credit grant found to reverse`;
      }
    } catch (e: any) {
      detail = `credit reversal failed: ${e?.message || e}`;
    }
  }

  /*
    PLAN AND RENEWAL. `subscription:<plan>` is a plan payment too — the renewal
    path writes that kind, and testing `kind === "plan"` by equality meant every
    recurring-debit chargeback reversed nothing while reporting success.
  */
  if (orgId && (kind === "plan" || kind.startsWith("subscription:"))) {
    try {
      const { data: org, error: orgErr } = await svc.from("organizations")
        .select("plan, subscription_ends_at, subscription_cycle").eq("id", orgId).single();
      if (orgErr) throw new Error(orgErr.message);
      const endsAt = (org as any)?.subscription_ends_at;
      if (endsAt) {
        /*
          THE CYCLE COMES FROM THE PAYMENT, not from the workspace.
          organizations.subscription_cycle is whatever the workspace is on
          today; reading it was how refunding one ₹799 month removed 365 days.
          The fallback is for rows written before cortex_payments.cycle existed,
          and the detail says so rather than presenting a guess as a fact.
        */
        const fromRow = String(p.cycle || "").toLowerCase();
        const paidCycle = fromRow || String((org as any)?.subscription_cycle || "monthly");

        /* What the payment bought, in today's plan. See equivalentDays. */
        const paidPlanId = kind.startsWith("subscription:") ? kind.split(":")[1] : ref;
        const paidDef = ALL_PLANS.find((x) => x.id === paidPlanId) || null;
        const curDef = ALL_PLANS.find((x) => x.id === String((org as any)?.plan || "").toLowerCase()) || null;
        const boughtDays = equivalentDays({
          paidCycleDays: cycleDays(paidCycle),
          paidPricePerDay: pricePerDay(paidDef, paidCycle),
          currentPricePerDay: pricePerDay(curDef, String((org as any)?.subscription_cycle || paidCycle)),
        });

        const days = daysToRemove(boughtDays, plan, daysRemovedSoFar);
        const back = new Date(endsAt).getTime() - days * 86_400_000;
        const floor = Date.now();
        const next = new Date(Math.max(back, floor)).toISOString();
        const lapsed = back <= floor;

        const { data: updated, error: updErr } = await svc.from("organizations").update({
          subscription_ends_at: next,
          ...(lapsed ? { subscription_status: "cancelled" } : {}),
        }).eq("id", orgId).select("id");
        /*
          NOTHING MAY THROW BETWEEN THE COMMIT AND THE FLAG.

          `reversedSomething` used to be set several lines below a row-count
          check that threw AFTER the update had committed. The catch then
          treated the reversal as failed, the claim was deleted, and a
          redelivery of the same event removed the period a second time. An
          error and a zero row count both mean nothing committed, so both are
          safe to throw on; everything after this point only builds strings.
        */
        if (updErr) throw new Error(updErr.message);
        if (!Array.isArray(updated) || updated.length === 0) {
          throw new Error("the period update matched no workspace row");
        }
        reversedSomething = true;
        daysRemoved = days;
        action = plan.full ? "reversed" : "partial";
        detail = `${plan.why}; removed ${days} of ${boughtDays} days`
          + (boughtDays !== cycleDays(paidCycle) ? ` (revalued from ${cycleDays(paidCycle)} days of ${paidPlanId})` : "")
          + (fromRow ? "" : " (cycle inferred from the workspace — this payment predates cycle being recorded)")
          + (lapsed ? "; plan now marked cancelled" : "");
      } else {
        detail = `${plan.why}; workspace has no paid period to shorten`;
      }
    } catch (e: any) {
      detail = `plan reversal failed: ${e?.message || e}`;
    }
  }

  /*
    RECORD THE OUTCOME.

    The per-event row carries what THIS event did, so the sums above stay true
    for the next one. refunded_amount on the payment is derived from those sums
    rather than incremented in place — two concurrent partials both reading a
    stale column and both writing their own total is how a cumulative figure
    ends up understating what was returned.
  */
  const failed = !reversedSomething;
  const totalRefunded = refundedSoFar + (refundAmount || 0);

  const rec = await svc.from("payment_refunds").update({
    share: plan.share, credits_taken: creditsTaken, days_removed: daysRemoved,
    outcome: failed ? "failed" : (plan.full ? "reversed" : "partial"),
  }).eq("order_id", orderId).eq("event_id", eventId).select("id");
  if (rec.error) console.error("[refund] could not record the reversal outcome:", rec.error.message);

  /*
    A FAILED REVERSAL DELETES ITS CLAIM so a retry can try again. The old code
    wrote `refunded:recorded_only` and then short-circuited every later delivery
    on that status prefix, which made a failed reversal permanent: the customer
    kept both the money and the product, for ever, silently.
  */
  if (failed) {
    const del = await svc.from("payment_refunds").delete()
      .eq("order_id", orderId).eq("event_id", eventId).select("id");
    if (del.error) console.error("[refund] could not release a failed claim:", del.error.message);
  }

  const upd = await svc.from(PAYMENTS_TABLE).update({
    status: `refunded:${action}`,
    /* plan.refundedTotal is the capped figure (refund-math caps it at `paid`).
       The expression here used to be Math.min(max(t,0), max(paid,t)), which is
       just `t` for any t >= 0 — a cap that capped nothing, beside a migration
       comment promising that repeated partials cannot exceed the whole. */
    refunded_amount: plan.refundedTotal,
    ...(plan.full && !failed ? { reversed_at: new Date().toISOString() } : {}),
  }).eq("order_id", orderId).select("order_id");
  if (upd.error) console.error("[refund] could not update the payment row:", upd.error.message);

  /* THE OPERATOR, ALWAYS. A refund we could not reverse is exactly the case a
     human needs, and it is the case the old code was quietest about. */
  await operatorAlert({
    kind: failed ? "refund_reversal_failed" : (plan.full ? "refund_reversed" : "refund_partial"),
    severity: failed ? "red" : "amber",
    title: failed
      ? `Refund on ${orderId} was NOT reversed`
      : `${isDispute ? "Dispute" : "Refund"} reversed on ${orderId}`,
    body: `${type} — ${kind}${ref ? ` ${ref}` : ""}, paid ₹${paid}. ${detail}`,
    orgId: orgId || null,
    orderId,
    /* Successful partials are routine once refunds are a real feature: recorded,
       but not worth waking anybody. */
    email: failed || plan.full,
  });

  if (orgId) {
    /* The customer hears about a REFUND — their money coming back, which they
       want confirmed. Not about a dispute they raised themselves; that is a
       conversation, and it was previously the only notification anyone got. */
    if (!isDispute) {
      const a = await svc.from("alerts").insert({
        org_id: orgId, severity: "amber", module: "billing",
        title: plan.full ? "Payment refunded" : "Partial refund processed",
        body: `Order ${orderId} (${kind}${ref ? ` ${ref}` : ""}, ₹${paid}). ${detail}`,
      }).select("id");
      if (a.error) console.error("[refund] customer alert not written:", a.error.message);
    }

    emitQuietly(orgId, "payment.refunded", {
      order_id: orderId, kind, ref, amount: paid, refunded: totalRefunded,
      event: type, action, detail, share: plan.share,
    });
  }

  /*
    A FAILED REVERSAL ASKS FOR A RETRY.

    Returning ok:true told the route to ack, and the route only asks Cashfree to
    retry when this function THROWS — so "the claim is deleted so a retry can
    try again" described a retry that did not exist. Nothing else retries
    refunds either: reconciliation works payment_intents and ungranted
    payments, never refunds. The claim row is already deleted above, so the
    redelivery is free to try the whole thing again.
  */
  if (failed) {
    throw new Error(`refund reversal failed for ${orderId}: ${detail}`);
  }

  return { ok: true, action, detail };
}

/**
 * Is this event evidence that money actually went back?
 *
 * Pure, so the rules are readable in one place and testable.
 *
 *   A refund is acted on only when its status says the refund SUCCEEDED, or
 *   when the event type itself says so and no status is present. PENDING,
 *   ONHOLD, CANCELLED and FAILED are all "the money is still with us".
 *
 *   A dispute is acted on only once it is lost, accepted or charged back.
 *   DISPUTE_CREATED and UNDER_REVIEW are decisions nobody has made yet, and
 *   reversing on them takes the product from a customer who may well win.
 */
export function refundReadiness(type: string, body: any, isDispute: boolean): {
  act: boolean; why: string; kind: string; severity: "red" | "amber";
} {
  const t = String(type || "").toUpperCase();

  if (isDispute) {
    const status = String(
      body?.data?.dispute?.dispute_status ?? body?.data?.dispute?.status ?? "",
    ).toUpperCase();
    const decided = /LOST|ACCEPT|CHARGEBACK|CLOSED_LOST/.test(status) || /LOST|CHARGEBACK/.test(t);
    const won = /WON|CLOSED_WON|REJECTED/.test(status) || /WON/.test(t);
    if (won) {
      return { act: false, kind: "dispute_won", severity: "amber",
        why: `The dispute was resolved in our favour (${status || t}), so there is nothing to reverse.` };
    }
    if (!decided) {
      return { act: false, kind: "dispute_pending", severity: "red",
        why: `A dispute is open (${status || t}) and has not been decided. The money may be withheld by the `
          + `provider, but the entitlement is left alone until it is lost — reversing now would take a product `
          + `from a customer who might win.` };
    }
    return { act: true, kind: "dispute_lost", severity: "red", why: `dispute ${status || t}` };
  }

  const status = String(
    body?.data?.refund?.refund_status ?? body?.data?.refund?.status ?? "",
  ).toUpperCase();
  if (status) {
    if (status === "SUCCESS" || status === "SUCCESSFUL") {
      return { act: true, kind: "refund_success", severity: "amber", why: `refund ${status}` };
    }
    return { act: false, kind: "refund_not_completed", severity: /FAIL/.test(status) ? "amber" : "red",
      why: `The refund status is ${status}, which is not money returned. Nothing was reversed; the SUCCESS `
        + `event will do it when it arrives.` };
  }
  /* No status field. Fall back to the event name, which is what we had before. */
  if (/FAIL|CANCEL|PENDING|ONHOLD/.test(t)) {
    return { act: false, kind: "refund_not_completed", severity: "amber",
      why: `${t} is not a completed refund, and the payload carried no status field.` };
  }
  return { act: true, kind: "refund_success", severity: "amber", why: `${t} with no status field` };
}

/**
 * What the provider says it sent back.
 *
 * Several shapes, because Cashfree names it differently per event. The ORDER
 * amount is deliberately NOT in this list: `order_amount` is what was paid, and
 * reading it as the refund would turn every partial into a full reversal —
 * which is the defect this file exists to fix.
 *
 * Returns null rather than 0 when nothing readable is present. 0 would flow
 * through the arithmetic as "refund nothing", which looks like a decision; null
 * routes the event to a human, which is the truth.
 */
export function readRefundAmount(body: any): number | null {
  const candidates = [
    body?.data?.refund?.refund_amount,
    body?.data?.refund?.amount,
    body?.data?.dispute?.dispute_amount,
    body?.data?.dispute?.amount,
    body?.data?.refund_amount,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * A stable id for THIS refund event.
 *
 * The provider's own refund or dispute id when it sends one. When it does not,
 * a digest of the event body — NOT the amount.
 *
 * The amount was the first attempt (`evt_${Math.round(amount)}`) and it is
 * wrong in a way that costs money: two genuinely distinct partial refunds of
 * the same amount produce the same id, the second loses the claim, and the
 * customer keeps that half of the refund's worth of product while the record
 * says it was reversed. A digest of the whole payload is identical across a
 * retry of one delivery (which is what idempotency needs) and different for two
 * separate events, because their timestamps and ids differ inside the body.
 */
export function refundEventId(type: string, body: any, amount: number | null): string {
  const explicit = String(
    body?.data?.refund?.refund_id
      ?? body?.data?.refund?.cf_refund_id
      ?? body?.data?.dispute?.dispute_id
      ?? "",
  ).trim();
  if (explicit) return explicit;

  try {
    const digest = crypto.createHash("sha256")
      .update(JSON.stringify({ type, data: body?.data ?? null, at: body?.event_time ?? null }))
      .digest("hex").slice(0, 24);
    return `dig_${digest}`;
  } catch {
    /* Unserialisable body. Fall back to something that at least does not
       collide across types, and let the operator alert carry the ambiguity. */
    return `evt_${type}_${amount ?? "unknown"}`;
  }
}

/** Escape LIKE metacharacters in a value that is not meant to be a pattern. */
function likeEscape(v: string): string {
  return String(v).replace(/([%_\\])/g, "\\$1");
}
