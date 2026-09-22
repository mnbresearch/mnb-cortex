import "server-only";
import { envKey } from "@/lib/env";

// Cashfree Payment Gateway (PG) — Orders API v2023-08-01.
// Set CASHFREE_APP_ID, CASHFREE_SECRET_KEY, and optionally CASHFREE_ENV=sandbox.

/**
 * Cashfree Orders API version — exported so the health probe cannot drift.
 *
 * This was "2023-08-01" here and, separately, "2023-08-01" typed again in
 * lib/health.ts. Two literals that must agree and nothing making them agree:
 * the moment one is bumped, /api/health starts validating credentials against
 * a version the money path does not use, and reports "operational" for a
 * configuration that cannot take a payment.
 *
 * Note that lib/pay/subscription.ts deliberately uses a DIFFERENT, newer
 * version (2025-01-01) — Cashfree versions its Subscriptions API separately
 * and the older one does not expose the mandate fields that path needs. That
 * divergence is intentional; this one was not.
 */
export const CASHFREE_ORDERS_API_VERSION = "2023-08-01";

export function hasCashfree(): boolean {
  return Boolean(envKey("CASHFREE_APP_ID") && envKey("CASHFREE_SECRET_KEY"));
}
export function cfMode(): "sandbox" | "production" {
  return (process.env.CASHFREE_ENV || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}
function base() { return cfMode() === "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg"; }
function headers() {
  return {
    "Content-Type": "application/json",
    "x-client-id": process.env.CASHFREE_APP_ID || "",
    "x-client-secret": process.env.CASHFREE_SECRET_KEY || "",
    "x-api-version": CASHFREE_ORDERS_API_VERSION,
  };
}

export async function createOrder(opts: {
  amount: number; note: string; returnUrl: string;
  customer: { id?: string; email?: string; phone?: string; name?: string };
}): Promise<{ ok: boolean; orderId?: string; paymentSessionId?: string; mode?: string; error?: string }> {
  if (!hasCashfree()) return { ok: false, error: "Cashfree isn't configured." };
  const orderId = "mnb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const body = {
    order_id: orderId,
    order_amount: Number(opts.amount),
    order_currency: "INR",
    customer_details: {
      customer_id: (opts.customer.id || "cust").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "cust",
      customer_email: opts.customer.email || "billing@example.com",
      // Cashfree makes this mandatory. We now collect a real one at checkout;
      // the placeholder only survives as a last resort so a missing phone can
      // never block a payment outright.
      customer_phone: (opts.customer.phone && /^[6-9]\d{9}$/.test(opts.customer.phone)) ? opts.customer.phone : "9999999999",
      customer_name: opts.customer.name || "MNB Cortex customer",
    },
    order_meta: { return_url: `${opts.returnUrl}?order_id={order_id}` },
    order_note: opts.note.slice(0, 200),
  };
  try {
    const r = await fetch(base() + "/orders", { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return { ok: false, error: j?.message || "Order creation failed." };
    return { ok: true, orderId: j.order_id, paymentSessionId: j.payment_session_id, mode: cfMode() };
  } catch (e: any) { return { ok: false, error: e?.message || "Cashfree error." }; }
}

/**
 * Read one order from Cashfree.
 *
 * `unknown: true` means WE COULD NOT FIND OUT — not that the order is unpaid.
 *
 * Those were the same value before, and it lost money silently. Every failure
 * here — a socket error, a 401 from a rotated key, a 429, a 5xx, a non-JSON
 * body — returned `{ paid: false }`, identical to a genuine "not paid yet".
 * settleOrder turned that into `{ ok: false, pending: true }`, and the webhook
 * treats `pending` as neither retryable nor loggable, so it fell through to
 * `return { ok: true }`. Cashfree was told the event was handled and never
 * retried. Money captured, nothing granted, and not one row, log line or
 * console entry anywhere to find it by.
 *
 * Note the missing `r.ok` check in the old version: a 401 body was parsed as
 * JSON and `j.order_status` read as undefined, so an expired API key looked
 * exactly like an unpaid order — for every order, until someone noticed.
 *
 * The caller must treat `unknown` as retryable. "I don't know" and "no" are
 * different answers and only one of them is safe to act on.
 */
export async function getOrder(orderId: string): Promise<{ paid: boolean; amount: number; note: string; customerId: string; unknown?: boolean }> {
  if (!hasCashfree() || !orderId) return { paid: false, amount: 0, note: "", customerId: "", unknown: true };
  try {
    const r = await fetch(base() + "/orders/" + encodeURIComponent(orderId), { headers: headers() });
    if (!r.ok) {
      /* 404 is a real answer: Cashfree has no such order, so it cannot be paid.
         Everything else — auth, rate limit, server error — is us failing to
         ask, not them answering. */
      return { paid: false, amount: 0, note: "", customerId: "", unknown: r.status !== 404 };
    }
    const j = await r.json();
    return {
      paid: j?.order_status === "PAID",
      amount: Number(j?.order_amount || 0),
      note: String(j?.order_note || ""),
      customerId: String(j?.customer_details?.customer_id || ""),
    };
  } catch { return { paid: false, amount: 0, note: "", customerId: "", unknown: true }; }
}
