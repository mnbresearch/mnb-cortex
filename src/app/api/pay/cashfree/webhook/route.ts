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
  const isOrderPaid = !isRefund && /PAYMENT_SUCCESS/i.test(type);

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
  if (!detail.planId) {
    // Reached Cashfree, but the mandate carries no plan note (created outside
    // this app). Retrying will never fix that, so ack — but make it loud,
    // because it means a real debit is going ungranted.
    console.error(`[cashfree-sub] mandate ${ref} has no plan note; cannot grant. Event ${type}.`);
    return;
  }
  const { PLANS } = await import("@/lib/config");
  const plan = PLANS.find((p) => p.id === detail.planId);
  if (!plan) { console.error("[cashfree-sub] unknown plan", detail.planId); return; }

  const annual = Boolean(detail.annual);
  const expected = annual ? plan.annual : plan.monthly;

  // ---- Amount check --------------------------------------------------------
  // The ₹1 authorisation debit must never buy a month. Anything materially
  // below the cycle price is not a cycle payment.
  const amount = Number(
    sub.payment_amount ?? sub.amount ?? body?.data?.payment?.payment_amount ?? body?.data?.amount ?? NaN,
  );
  if (Number.isFinite(amount) && amount < expected * 0.95) {
    console.warn(`[cashfree-sub] ignoring ${type} for ${ref}: paid ${amount}, cycle costs ${expected}`);
    return;
  }

  // ---- Idempotency ---------------------------------------------------------
  // Cashfree retries on any non-2xx, and a function that times out AFTER
  // committing looks exactly like a failure. Claim the payment first: the unique
  // index on payments.order_id means a duplicate delivery loses the race and
  // extends nothing. Falls back to proceeding only if the table is missing.
  const paymentId = String(
    sub.cf_payment_id ?? sub.payment_id ?? body?.data?.payment?.cf_payment_id ?? body?.data?.cf_payment_id ?? "",
  );
  // Prefer Cashfree's payment id. The fallback must be STABLE across a retry, so
  // it is anchored to the period this debit is paying for — not to wall-clock
  // "today", which changes at UTC midnight mid-retry and would grant twice.
  const periodAnchor = String((org as any).subscription_ends_at || "none").slice(0, 10);
  const claimId = `sub_${ref}_${paymentId || `cycle_${periodAnchor}`}`;
  const { data: claimed, error: claimErr } = await svc
    .from(PAYMENTS_TABLE)
    .upsert(
      { order_id: claimId, org_id: orgId, kind: `subscription:${plan.id}`, ref, amount: Number.isFinite(amount) ? amount : expected, status: "paid", provider: "cashfree" },
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
    // A row already exists for this debit. That means "already granted" ONLY if
    // it is marked paid — an earlier attempt that failed mid-grant leaves
    // `grant_failed`, and treating that as done would swallow the cycle. Same
    // reasoning as settleOrder().
    const { data: prior } = await svc.from(PAYMENTS_TABLE).select("status").eq("order_id", claimId).maybeSingle();
    if (String((prior as any)?.status || "paid") === "paid") return; // genuinely done
    console.warn(`[cashfree-sub] re-attempting a previously failed grant for ${claimId}`);
    await svc.from(PAYMENTS_TABLE).update({ status: "paid" }).eq("order_id", claimId);
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
    // support. Because it is no longer 'paid', the claim branch above re-opens
    // it on the next attempt instead of deduplicating the retry away.
    try {
      await svc.from(PAYMENTS_TABLE).update({ status: "grant_failed" }).eq("order_id", claimId);
    } catch { /* best effort — the throw below still triggers a retry */ }
    throw new Error(updErr?.message || "grant failed");
  }

  const { emitQuietly } = await import("@/lib/webhooks");
  emitQuietly(orgId, "payment.succeeded", { kind: "subscription", subscription_id: ref, plan: plan.id, cycle: annual ? "annual" : "monthly", amount, event: type });
  /* A renewal is the payment a customer is MOST likely not to recognise —
     they did not click anything. It is the one that most needs our receipt. */
  const { sendPaymentReceipt } = await import("@/lib/pay/receipt");
  void sendPaymentReceipt({ orgId, orderId: claimId, amount, kind: "plan", ref: plan.id,
    label: `${plan.name} renewal (${annual ? "annual" : "monthly"})`, endsAt });
}
