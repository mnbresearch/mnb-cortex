import "server-only";
import { envKey } from "@/lib/env";
import { PLANS } from "@/lib/config";

/**
 * Auto-renewal via Cashfree Subscriptions (UPI Autopay / eNACH / card mandate).
 *
 * Until now every plan was a one-off order: 30 days later the workspace locked
 * and the customer had to remember to pay again. That is the single biggest
 * churn risk in the product, and no amount of reminder email fixes it properly.
 *
 * A mandate is a standing authorisation the customer gives ONCE, which lets us
 * debit each cycle automatically. They can revoke it from their bank or UPI app
 * at any time — and from /billing here.
 *
 * One hard constraint worth knowing before you sell on it:
 * **UPI Autopay is capped at ₹15,000 per mandate.** Solo, Starter and Growth
 * fit comfortably; Premium (₹17,999) and Business (₹39,999) exceed it and need
 * a card or eNACH mandate instead. mandateOptionsFor() encodes that so the UI
 * never offers a customer a method their amount can't use.
 */

const UPI_AUTOPAY_MAX = 15_000;

export function hasSubscriptions(): boolean {
  return Boolean(envKey("CASHFREE_APP_ID") && envKey("CASHFREE_SECRET_KEY"));
}

function base(): string {
  return (process.env.CASHFREE_ENV || "").toLowerCase() === "sandbox"
    ? "https://sandbox.cashfree.com/pg"
    : "https://api.cashfree.com/pg";
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-client-id": envKey("CASHFREE_APP_ID") || "",
    "x-client-secret": envKey("CASHFREE_SECRET_KEY") || "",
    "x-api-version": "2025-01-01",
  };
}

/** Which mandate methods a given amount can actually use. */
export function mandateOptionsFor(amount: number): { upi: boolean; card: boolean; enach: boolean; note?: string } {
  const upi = amount <= UPI_AUTOPAY_MAX;
  return {
    upi,
    card: true,
    enach: true,
    note: upi
      ? undefined
      : `UPI Autopay is capped at ₹${UPI_AUTOPAY_MAX.toLocaleString("en-IN")} per mandate, so this plan needs a card or bank (eNACH) mandate.`,
  };
}

export type CreateSubResult = {
  ok: boolean;
  subscriptionId?: string;
  sessionId?: string;
  authLink?: string;
  error?: string;
};

/**
 * Create a subscription and return the authorisation session the customer
 * completes once. `planId` is a Cortex plan id (solo/starter/growth/...).
 */
export async function createSubscription(opts: {
  orgId: string;
  planId: string;
  annual: boolean;
  customer: { email?: string; phone?: string; name?: string };
  returnUrl: string;
}): Promise<CreateSubResult> {
  if (!hasSubscriptions()) return { ok: false, error: "Cashfree isn't configured." };

  const plan = PLANS.find((p) => p.id === opts.planId);
  if (!plan || plan.monthly === 0) return { ok: false, error: "That plan can't be subscribed to online." };

  const amount = opts.annual ? plan.annual : plan.monthly;
  const intervalType = opts.annual ? "year" : "month";

  // Deterministic-ish id so a retried click doesn't create a second mandate
  // for the same workspace in the same minute.
  const subscriptionId = `sub_${opts.orgId.replace(/-/g, "").slice(0, 12)}_${Math.floor(Date.now() / 60000)}`;

  const body = {
    subscription_id: subscriptionId,
    customer_details: {
      customer_name: opts.customer.name || "MNB Cortex customer",
      customer_email: opts.customer.email || undefined,
      customer_phone: opts.customer.phone || undefined,
    },
    plan_details: {
      plan_id: `cortex_${plan.id}_${intervalType}`,
      plan_name: `MNB Cortex ${plan.name} (${opts.annual ? "annual" : "monthly"})`,
      plan_type: "PERIODIC",
      plan_currency: "INR",
      plan_recurring_amount: amount,
      // A ceiling above the recurring amount leaves room for a future price
      // change without forcing every customer to re-authorise.
      plan_max_amount: Math.max(amount, Math.ceil(amount * 1.25)),
      plan_max_cycles: opts.annual ? 5 : 60,
      plan_intervals: 1,
      plan_interval_type: intervalType,
    },
    authorisation_details: {
      authorisation_amount: 1,             // ₹1 verification, refunded by Cashfree
      authorisation_amount_refund: true,
    },
    subscription_meta: { return_url: opts.returnUrl },
    subscription_expiry_time: new Date(Date.now() + (opts.annual ? 5 : 5) * 365 * 86_400_000).toISOString(),
    subscription_note: `plan:${plan.id}:${opts.annual ? "annual" : "monthly"}:${opts.orgId}`,
  };

  try {
    const r = await fetch(`${base()}/subscriptions`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok) {
      console.error("[cashfree-sub] create failed", r.status, JSON.stringify(j).slice(0, 300));
      return { ok: false, error: j?.message || j?.error_description || `Cashfree returned ${r.status}` };
    }
    return {
      ok: true,
      subscriptionId: j?.subscription_id || subscriptionId,
      sessionId: j?.subscription_session_id,
      authLink: j?.authorisation_details?.authorisation_link || j?.subscription_payment_link,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach Cashfree." };
  }
}

export type SubStatus = {
  ok: boolean;
  status?: string;      // INITIALIZED | ACTIVE | ON_HOLD | CANCELLED | COMPLETED
  planId?: string;
  annual?: boolean;
  nextCharge?: string;
  error?: string;
};

export async function getSubscription(subscriptionId: string): Promise<SubStatus> {
  if (!hasSubscriptions() || !subscriptionId) return { ok: false, error: "Not configured." };
  try {
    const r = await fetch(`${base()}/subscriptions/${encodeURIComponent(subscriptionId)}`, { headers: headers() });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok) return { ok: false, error: j?.message || `HTTP ${r.status}` };
    const note = String(j?.subscription_note || "");
    const [, planId, cycle] = note.split(":");
    return {
      ok: true,
      status: j?.subscription_status,
      planId,
      annual: cycle === "annual",
      nextCharge: j?.subscription_next_scheduled_time || undefined,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

/** Stop future debits. The current paid period is untouched. */
export async function cancelSubscription(subscriptionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSubscriptions() || !subscriptionId) return { ok: false, error: "Not configured." };
  try {
    const r = await fetch(`${base()}/subscriptions/${encodeURIComponent(subscriptionId)}/manage`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ action: "CANCEL" }),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok) return { ok: false, error: j?.message || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}
