import { NextResponse } from "next/server";
import { settleOrder } from "@/lib/pay/settle";
import { handleRefundEvent } from "@/lib/pay/refund";
import { PAYMENTS_TABLE } from "@/lib/pay/table";
import { verifyCashfreeWebhook } from "@/lib/pay/cashfree-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cashfree Payment Gateway webhook — the RELIABLE activation path.
 *
 * Cashfree signs each webhook: signature = base64(HMAC-SHA256(timestamp + rawBody, SECRET)).
 * Verification lives in @/lib/pay/cashfree-webhook so it can be tested against a
 * genuine 13-digit millisecond timestamp — see scripts/test-cashfree-webhook.mjs.
 * Set this URL in the Cashfree dashboard → Developers → Webhooks:
 *   https://cortex.mnbresearch.com/api/pay/cashfree/webhook
 */
export async function POST(req: Request) {
  const secret = process.env.CASHFREE_SECRET_KEY || "";
  if (!secret) return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });

  // req.text() gives the RAW body. It must not be parsed and re-serialised
  // anywhere before the HMAC — JSON.parse → JSON.stringify changes whitespace
  // and key order, and the signature can then never match.
  const raw = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";
  const timestamp = req.headers.get("x-webhook-timestamp") || "";

  const check = verifyCashfreeWebhook({ rawBody: raw, signature, timestamp, secret });
  if (!check.ok) {
    /*
      This used to return a bare "invalid signature" and log nothing, so a
      production rejection was a dead end: wrong secret, missing header,
      re-serialised body and a clock skew all looked identical, and real money
      went unfulfilled while somebody guessed between them.

      The reason is logged (never the secret) so the NEXT real delivery
      diagnoses itself. The response body stays deliberately vague — an
      unauthenticated caller learns nothing about why it failed.
    */
    console.error("[cashfree-webhook] rejected:", check.reason, JSON.stringify(check.detail || {}), {
      hasSignatureHeader: Boolean(signature),
      hasTimestampHeader: Boolean(timestamp),
      timestampDigits: timestamp.length,
      bodyBytes: raw.length,
      secretLength: secret.length,
      secretHadWhitespace: secret !== secret.trim(),
    });
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let body: any = {};
  try { body = JSON.parse(raw); } catch { /* ignore */ }
  const type = String(body?.type || "");
  const orderId = String(body?.data?.order?.order_id || body?.data?.order_id || "");

  /*
    EVENT MATCHING, precisely.

    This was `/PAYMENT_SUCCESS|SUCCESS/i`, and `REFUND_SUCCESS` matches
    `/SUCCESS/i`. So a refund notification called settleOrder() — the grant
    path. Today the idempotency row absorbs it, but that is luck: any path that
    releases the claim (a failed grant, a retry) leaves a window where a refund
    re-grants the thing being refunded. A regex that matches the opposite of
    what it means is a bug even while something downstream happens to save it.

    Refunds and disputes are handled below, on their own terms.
  */
  const isRefund = /REFUND|DISPUTE|CHARGEBACK/i.test(type);
  /*
    ANCHORED. `/PAYMENT_SUCCESS/i` also matches SUBSCRIPTION_PAYMENT_SUCCESS,
    and that event reaches the subscription handler below as well — so if such
    a payload ever carried data.order.order_id, one debit would run both the
    order grant and the renewal grant. Today it degrades to "pending" because
    the id is not a Cashfree order, which is luck rather than a guard.
  */
  const isOrderPaid = !isRefund && /^PAYMENT_SUCCESS/i.test(type) && !/SUBSCRIPTION/i.test(type);

  if (orderId && isOrderPaid) {
    /*
      RETRY ON FAILURE.

      This was `try { await settleOrder(orderId); } catch {}` followed by a 200.
      Cashfree hears "handled" and never retries, so a customer whose grant
      failed paid and received nothing, silently, forever. The subscription
      branch immediately below already got this right; the order branch was
      left behind.

      Only genuinely retryable failures ask for a retry — see SettleResult.
      A permanent refusal still acks, because retrying it forever would bury
      the real signal.
    */
    let res: Awaited<ReturnType<typeof settleOrder>> | null = null;
    try {
      res = await settleOrder(orderId);
    } catch (e: any) {
      console.error("[cashfree] settleOrder threw, requesting retry:", e?.message);
      return NextResponse.json({ ok: false, error: "temporary failure" }, { status: 500 });
    }
    if (res && !res.ok && res.retryable) {
      console.error("[cashfree] grant failed, requesting retry:", orderId, res.error);
      return NextResponse.json({ ok: false, error: "temporary failure" }, { status: 500 });
    }
    if (res && !res.ok && !res.pending) {
      /* Permanent. Ack so Cashfree stops, but make it findable — money came in
         and no entitlement went out, which nobody should have to discover from
         a customer email. */
      console.error("[cashfree] settle refused (no retry):", orderId, res.error);
    }
  }

  if (isRefund) {
    try {
      await handleRefundEvent(type, body, orderId);
    } catch (e: any) {
      console.error("[cashfree-refund] handler failed, requesting retry:", e?.message);
      return NextResponse.json({ ok: false, error: "temporary failure" }, { status: 500 });
    }
  }

  // Recurring debits arrive as SUBSCRIPTION_* events rather than orders. Each
  // successful cycle must EXTEND the paid period, or auto-renewal would charge
  // the customer and still lock them out.
  if (/SUBSCRIPTION/i.test(type)) {
    try {
      await handleSubscriptionEvent(type, body);
    } catch (e: any) {
      // A 200 here tells Cashfree "handled", and it never retries. When the
      // failure is the GRANT itself, that silently loses a cycle the customer
      // paid for. Ask for the retry instead — the claim row was released, and
      // the unique index still stops a duplicate from double-extending.
      console.error("[cashfree-sub] handler failed, requesting retry:", e?.message);
      return NextResponse.json({ ok: false, error: "temporary failure" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Extend (or suspend) the workspace behind a subscription mandate.
 *
 * Everything that decides money — which plan, which cycle, how much — is read
 * from the mandate we created server-side, never from the webhook body and
 * never from a column another code path happens to have written. The previous
 * version got all three wrong:
 *
 *   - it never set `plan`, so a ₹799 Solo mandate on a workspace still holding
 *     its signup default kept Growth's ₹6,999 entitlements;
 *   - it read the cycle from `organizations.subscription_cycle`, which only the
 *     one-off order path ever writes — so an annual mandate granted 30 days,
 *     and a ₹799 monthly mandate on a workspace that once bought annual granted
 *     365;
 *   - it granted a full cycle for ANY matching event with no amount check and
 *     no idempotency, so the ₹1 authorisation debit — or one retried delivery —
 *     was worth a free period.
 */
async function handleSubscriptionEvent(type: string, body: any) {
  const { serviceClient } = await import("@/lib/supabase/server");
  const svc = serviceClient();
  if (!svc) return;

  const sub = body?.data?.subscription || body?.data || {};
  const ref = String(sub.subscription_id || body?.data?.subscription_id || "");
  if (!ref) return;

  const { data: org } = await svc.from("organizations")
    .select("id, subscription_ends_at").eq("subscription_ref", ref).maybeSingle();
  if (!org) return;
  const orgId = (org as any).id;

  // AUTH events are the ₹1 mandate-verification debit, not a cycle payment.
  // Excluding them by type is the robust guard: it holds even if Cashfree names
  // the amount field something this handler doesn't recognise.
  const isAuth = /AUTH/i.test(type);
  const paid = !isAuth && /PAYMENT_SUCCESS|CHARGE_SUCCESS/i.test(type);
  const stopped = /CANCELL?ED|ON_HOLD|PAYMENT_DECLINED|FAILED/i.test(type);

  if (stopped) {
    // The mandate stopped. The already-paid period stands; we simply stop
    // promising future renewals.
    await svc.from("organizations")
      .update({ autorenew_status: /CANCELL?ED/i.test(type) ? "CANCELLED" : "ON_HOLD" })
      .eq("id", orgId);
    return;
  }
  if (!paid) return;

  // ---- What was actually authorised? Ask Cashfree, don't guess. -------------
  // subscription_note was written by us at creation as
  // `plan:<id>:<monthly|annual>:<orgId>`, so this is our own signed-at-source
  // record of the deal, not anything the caller can influence.
  const { getSubscription } = await import("@/lib/pay/subscription");
  const detail = await getSubscription(ref);
  if (!detail.ok) {
    // Couldn't reach Cashfree. Returning normally would ack the webhook and lose
    // a cycle the customer was charged for. Throw so the POST answers 500 and
    // Cashfree retries.
    throw new Error(`cannot reach Cashfree for ${ref}: ${detail.error || "unknown"}`);
  }
  const { operatorAlert } = await import("@/lib/operator-alert");

  /**
   * A debit we could not turn into a grant.
   *
   * THREE EXITS IN THIS FUNCTION USED TO `return` AFTER A console.error, and
   * each of them is a real recurring debit against a real card:
   *
   *   - the mandate carries no plan note;
   *   - the plan id is not in the catalogue;
   *   - the amount is below the cycle price.
   *
   * No payments row was written at any of them (the claim is created further
   * down), so the money existed at Cashfree and nowhere in our system — not in
   * revenue, not in the failed-payments list, not in any query anybody could
   * write. The evidence was a log line in a serverless runtime that discards
   * yesterday's logs. Every month, silently, for as long as the mandate lives.
   */
  const recordUngranted = async (reason: string, note: string, amount: number | null) => {
    const id = `sub_${ref}_ungranted_${new Date().toISOString().slice(0, 10)}`;
    try {
      await svc.from(PAYMENTS_TABLE).upsert(
        { order_id: id, org_id: orgId, kind: `subscription_ungranted`, ref, amount, status: reason, provider: "cashfree" },
        { onConflict: "order_id", ignoreDuplicates: true },
      );
    } catch { /* the alert below is the backstop */ }
    await operatorAlert({
      kind: reason,
      severity: "red",
      title: `Recurring debit on ${ref} granted nothing`,
      body: `${type}. ${note} Workspace ${orgId}. This mandate will be debited again next cycle and will fail the same way `
        + `until it is fixed or cancelled.`,
      orgId, orderId: id,
    });
  };

  if (!detail.planId) {
    // Reached Cashfree, but the mandate carries no plan note (created outside
    // this app). Retrying will never fix that, so ack — but record it, because
    // it means a real debit is going ungranted.
    await recordUngranted("sub_no_plan_note", `The mandate carries no plan note, so we cannot tell what was bought.`, null);
    return;
  }
  /*
    ALL_PLANS, not PLANS. Four plan ids have been retired, and a mandate created
    against one of them keeps debiting the customer every cycle. `PLANS.find`
    returned undefined, the handler logged and returned, and the customer was
    charged monthly for a plan they never received. They bought it while it was
    on sale; resolving retired ids is how they get what they paid for.
  */
  const { ALL_PLANS } = await import("@/lib/config");
  const plan = ALL_PLANS.find((p) => p.id === detail.planId);
  if (!plan) {
    await recordUngranted("sub_unknown_plan", `Plan id "${detail.planId}" is not in the catalogue, live or retired.`, null);
    return;
  }

  const annual = Boolean(detail.annual);
  const expected = annual ? plan.annual : plan.monthly;

  // ---- Amount check --------------------------------------------------------
  // The ₹1 authorisation debit must never buy a month. Anything materially
  // below the cycle price is not a cycle payment.
  const amount = Number(
    sub.payment_amount ?? sub.amount ?? body?.data?.payment?.payment_amount ?? body?.data?.amount ?? NaN,
  );
  if (Number.isFinite(amount) && amount < expected * 0.95) {
    /*
      Not a cycle payment. Refusing to grant is right — the ₹1 authorisation
      debit must never buy a month — but returning silently was not: if this is
      a genuine part-payment or a price change we did not follow, a customer has
      been debited and has nothing.
    */
    await recordUngranted("sub_amount_below_cycle",
      `Debited ₹${amount} but the ${annual ? "annual" : "monthly"} cycle costs ₹${expected}.`, amount);
    return;
  }
  if (!Number.isFinite(amount)) {
    /*
      WE DO NOT KNOW WHAT WAS DEBITED. The old code carried on and wrote
      `amount: expected` — our own record then asserted the catalogue price for
      a debit whose amount we never learned, and admin-metrics summed that
      invention into revenue. The grant still proceeds (the mandate is ours and
      the plan is known), but the row records null and the operator is told, so
      the number in the console is either true or absent.
    */
    /*
      RED, AND EMAILED. The plan IS granted — the mandate is ours, the plan is
      known, and the ₹1 authorisation debit is excluded by event type, so
      refusing would punish a customer who has paid. But an amount we could not
      read is the one field this handler needs and did not get, it means our
      revenue figure is missing a real payment, and if the field names have
      changed then EVERY renewal from now on is in this state. That is not an
      "amber, look at it sometime".
    */
    await operatorAlert({
      kind: "sub_amount_unreadable",
      severity: "red",
      title: `Renewal on ${ref} granted with an unknown amount`,
      body: `${type}: none of the amount fields we read were present, so the payment row records no amount `
        + `rather than assuming the ₹${expected} list price. The plan WAS granted. Check Cashfree for the real `
        + `figure, and check whether the webhook payload shape has changed — if it has, every renewal is now `
        + `recording no amount and revenue is understated.`,
      orgId,
    });
  }

  // ---- Idempotency ---------------------------------------------------------
  // Cashfree retries on any non-2xx, and a function that times out AFTER
  // committing looks exactly like a failure. Claim the payment first: the unique
  // index on payments.order_id means a duplicate delivery loses the race and
  // extends nothing. Falls back to proceeding only if the table is missing.
  const paymentId = String(
    sub.cf_payment_id ?? sub.payment_id ?? body?.data?.payment?.cf_payment_id ?? body?.data?.cf_payment_id ?? "",
  );
  /*
    THE FALLBACK ANCHOR WAS THE VALUE THE GRANT MOVES.

    It was `subscription_ends_at.slice(0,10)`, described as "anchored to the
    period this debit is paying for". But the grant below sets
    subscription_ends_at. So a retried delivery carrying no cf_payment_id read
    the ALREADY-EXTENDED date, computed a different claim id, claimed cleanly,
    and bought the customer another cycle for free. The comment asserted
    stability about the one field the function mutates.

    Instead of inventing a stable id, ask the question that actually matters:
    HAS THIS EXTENSION ALREADY BEEN APPLIED? Every renewal grant records the
    end date it produced in period_to, so if a row for this mandate already
    carries the workspace's current end date, this delivery is a repeat.

    The recency window is what separates a retry from a genuine next cycle —
    both look identical by date alone, because ends_at only moves at grant
    time. Cashfree retries within hours; cycles are 30 or 365 days. Six hours
    sits between the two by three orders of magnitude. The failure direction is
    stated plainly: a duplicate delivery with no payment id arriving more than
    six hours later would grant twice, and a genuine cycle shorter than six
    hours would be dropped — and this product sells no such cycle.
  */
  const currentEnds = (org as any).subscription_ends_at || null;
  if (!paymentId && currentEnds) {
    const { data: applied } = await svc.from(PAYMENTS_TABLE)
      .select("order_id, created_at, period_to")
      .eq("ref", ref).eq("period_to", currentEnds)
      .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
      .limit(1);
    if (Array.isArray(applied) && applied.length > 0) {
      console.warn(`[cashfree-sub] ${type} for ${ref} already extended to ${currentEnds} by ${(applied[0] as any).order_id}; not granting again.`);
      return;
    }
  }
  const claimId = `sub_${ref}_${paymentId || `cycle_${String(currentEnds || "none").slice(0, 10)}`}`;
  const { data: claimed, error: claimErr } = await svc
    .from(PAYMENTS_TABLE)
    .upsert(
      /*
        `amount: null` when we could not read it — see the note above. Recording
        the list price for an unknown debit made the revenue total an assertion
        about money nobody had counted.
      */
      { order_id: claimId, org_id: orgId, kind: `subscription:${plan.id}`, ref,
        amount: Number.isFinite(amount) ? amount : null, status: "paid", provider: "cashfree",
        cycle: annual ? "annual" : "monthly" },
      { onConflict: "order_id", ignoreDuplicates: true },
    )
    .select("order_id");
  if (claimErr) {
    // Proceed only when the payments table genuinely doesn't exist yet. Any
    // other error (RLS, timeout, bad column) previously fell through to an
    // UNGUARDED grant, so every duplicate delivery bought another cycle.
    const missingTable = claimErr.code === "42P01" || /relation .* does not exist/i.test(claimErr.message || "");
    if (!missingTable) throw new Error(`idempotency claim failed: ${claimErr.message}`);
    console.warn("[cashfree-sub] payments table missing — granting without idempotency");
  } else if (!(claimed as any[])?.length) {
    /*
      A row already exists for this debit. "Already granted" is now decided by
      granted_at, not by the status.

      The old test was `String(prior?.status || "paid") === "paid"`, which has
      two faults. The status column is nullable — erasure.ts already rewrites
      these rows — so a NULL status defaulted to "paid" and the cycle was
      dropped as already done. And "paid" is written to CLAIM the debit, before
      the grant, so a row that says paid is not evidence that anything was
      granted; that is precisely the failure this branch exists to repair.
    */
    const { data: prior } = await svc.from(PAYMENTS_TABLE)
      .select("status, granted_at").eq("order_id", claimId).maybeSingle();
    if ((prior as any)?.granted_at) return; // genuinely done
    console.warn(`[cashfree-sub] re-attempting an unconfirmed grant for ${claimId} (status ${String((prior as any)?.status ?? "null")})`);
    const reopen = await svc.from(PAYMENTS_TABLE).update({ status: "paid" }).eq("order_id", claimId).select("order_id");
    if (reopen.error) console.error(`[cashfree-sub] could not re-open ${claimId}:`, reopen.error.message);
  }

  // ---- Grant --------------------------------------------------------------
  const days = annual ? 365 : 30;
  const cur = (org as any).subscription_ends_at ? new Date((org as any).subscription_ends_at).getTime() : 0;
  const from = Math.max(cur, Date.now()); // stack onto whatever is left
  /* Hoisted out of the update so the receipt below can tell the customer what
     they are now paid until — the single most useful line on a renewal notice,
     and the one that stops "what is this charge?". */
  const endsAt = new Date(from + days * 86_400_000).toISOString();
  const grant = async () => svc.from("organizations").update({
    plan: plan.id,
    subscription_status: "active",
    subscription_cycle: annual ? "annual" : "monthly",
    subscription_ends_at: endsAt,
    autorenew_status: "ACTIVE",
    autorenew_next: sub.subscription_next_scheduled_time || null,
  }).eq("id", orgId);

  // supabase-js RETURNS {error} for an HTTP-level failure but THROWS on a socket
  // failure. Both must release the claim, or the retry is deduplicated against a
  // row recording a grant that never happened, and the cycle is lost for good.
  let updErr: any = null;
  try { updErr = (await grant()).error; } catch (e: any) { updErr = e; }

  if (updErr) {
    console.error("[cashfree-sub] grant failed", updErr?.message);
    // Mark rather than delete. A debit WAS received, so once Cashfree stops
    // retrying this row is the only evidence of it for reconciliation and
    // support. Because granted_at is still null, the claim branch above
    // re-opens it on the next attempt instead of deduplicating the retry away.
    try {
      await svc.from(PAYMENTS_TABLE).update({ status: "grant_failed" }).eq("order_id", claimId);
    } catch { /* best effort — the throw below still triggers a retry */ }
    /*
      AND TELL SOMEBODY. `grant_failed` was written by this line and read by
      exactly one other: the idempotency check above. admin-metrics excluded it
      from revenue AND from the failed-payments list, so a recurring debit that
      granted nothing appeared on no screen in the product. Cashfree retries for
      a while and then stops, and after that the row is the only trace — a row
      nobody was looking at.
    */
    await operatorAlert({
      kind: "sub_grant_failed",
      severity: "red",
      title: `Renewal debit taken but the plan was not extended`,
      body: `${type} on mandate ${ref} (${plan.id}, ₹${Number.isFinite(amount) ? amount : "amount unknown"}). `
        + `The workspace update failed: ${updErr?.message || "unknown error"}. Cashfree will retry; if it stops, `
        + `extend ${orgId} by hand — the customer has paid for this cycle.`,
      orgId, orderId: claimId,
    });
    throw new Error(updErr?.message || "grant failed");
  }

  /* The grant is confirmed. Record what it produced: granted_at is what makes
     "paid" mean "received", and period_to is what lets a retry recognise an
     extension that has already been applied. */
  try {
    const mark = await svc.from(PAYMENTS_TABLE)
      .update({ granted_at: new Date().toISOString(), period_to: endsAt })
      .eq("order_id", claimId).select("order_id");
    if (mark.error || !(mark.data as any[])?.length) {
      console.error(`[cashfree-sub] could not mark ${claimId} as granted:`, mark.error?.message || "no row matched");
    }
  } catch {
    /*
      Logged, not swallowed silently — and note what does NOT happen: the
      reconciliation job deliberately refuses to repair subscription rows
      (their ids are not Cashfree order ids), so it escalates them to a person
      rather than re-checking them. An unmarked renewal is therefore a row
      somebody has to look at, not one that fixes itself.
    */
    console.error(`[cashfree-sub] could not mark ${claimId} as granted; it will be escalated by reconciliation.`);
  }

  const { emitQuietly } = await import("@/lib/webhooks");
  emitQuietly(orgId, "payment.succeeded", { kind: "subscription", subscription_id: ref, plan: plan.id, cycle: annual ? "annual" : "monthly", amount, event: type });
  /* A renewal is the payment a customer is MOST likely not to recognise —
     they did not click anything. It is the one that most needs our receipt. */
  const { sendPaymentReceipt } = await import("@/lib/pay/receipt");
  void sendPaymentReceipt({ orgId, orderId: claimId, amount, kind: "plan", ref: plan.id,
    label: `${plan.name} renewal (${annual ? "annual" : "monthly"})`, endsAt });
}
