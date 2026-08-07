import "server-only";

// Cashfree Payment Gateway (PG) — Orders API v2023-08-01.
// Set CASHFREE_APP_ID, CASHFREE_SECRET_KEY, and optionally CASHFREE_ENV=sandbox.

export function hasCashfree(): boolean {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
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
    "x-api-version": "2023-08-01",
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
      customer_phone: (opts.customer.phone && /^\d{10}$/.test(opts.customer.phone)) ? opts.customer.phone : "9999999999",
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

export async function getOrder(orderId: string): Promise<{ paid: boolean; amount: number; note: string; customerId: string }> {
  if (!hasCashfree() || !orderId) return { paid: false, amount: 0, note: "", customerId: "" };
  try {
    const r = await fetch(base() + "/orders/" + encodeURIComponent(orderId), { headers: headers() });
    const j = await r.json();
    return {
      paid: j?.order_status === "PAID",
      amount: Number(j?.order_amount || 0),
      note: String(j?.order_note || ""),
      customerId: String(j?.customer_details?.customer_id || ""),
    };
  } catch { return { paid: false, amount: 0, note: "", customerId: "" }; }
}
