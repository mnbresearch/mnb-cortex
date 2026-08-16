// Client-side Cashfree checkout helper. Used by upgrade + top-up buttons.

function loadCashfree(): Promise<boolean> {
  return new Promise((res) => {
    if ((window as any).Cashfree) return res(true);
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => res(true); s.onerror = () => res(false);
    document.head.appendChild(s);
  });
}

export type PayResult = { ok: boolean; needsConfig?: boolean; error?: string; kind?: string; balance?: number; plan?: string };

/** Create a Cashfree order, open the checkout modal, then verify server-side. */
export async function payCashfree(payload: { kind: string; plan?: string; packId?: string; annual?: boolean; phone?: string } & Record<string, any>): Promise<PayResult> {
  let order: any;
  try { order = await fetch("/api/pay/cashfree/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((r) => r.json()); }
  catch { return { ok: false, error: "Network error." }; }
  if (!order?.ok) return { ok: false, needsConfig: order?.needsConfig, error: order?.error || "Could not start checkout." };

  const loaded = await loadCashfree();
  if (!loaded || !(window as any).Cashfree) return { ok: false, error: "Could not load the payment window." };

  try {
    const cf = (window as any).Cashfree({ mode: order.mode === "sandbox" ? "sandbox" : "production" });
    await cf.checkout({ paymentSessionId: order.paymentSessionId, redirectTarget: "_modal" });
  } catch { /* modal closed — fall through to verify */ }

  try {
    const v = await fetch("/api/pay/cashfree/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.orderId }) }).then((r) => r.json());
    return { ok: Boolean(v.ok), error: v.error, kind: v.kind, balance: v.balance, plan: v.plan };
  } catch { return { ok: false, error: "Could not verify payment." }; }
}
