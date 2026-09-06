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

  /*
    A CSP violation here used to be invisible, and it cost every payment.

    `form-action 'self'` blocked the form Cashfree submits into its modal
    iframe. The iframe never navigated, cf.checkout() never settled, and this
    catch never fired — so the customer watched a spinner forever while the app
    reported nothing at all. The CSP is fixed in next.config.mjs; this makes the
    same class of failure visible next time instead of silent.

    Three things, all of which were missing:

      a timeout, because the real failure mode was a promise that never settles
      rather than one that rejects — a bare `await` cannot detect that;

      a CSP listener, because the browser knows exactly what it blocked and was
      the only thing that did;

      an error the caller can show. "Modal closed" and "the browser refused to
      open the payment form" look identical from here otherwise, and only one of
      them is the customer's doing.
  */
  const violations: string[] = [];
  const onViolation = (e: SecurityPolicyViolationEvent) => {
    if (/cashfree/i.test(e.blockedURI || "")) violations.push(`${e.effectiveDirective} blocked ${e.blockedURI}`);
  };
  document.addEventListener("securitypolicyviolation", onViolation);

  let stalled = false;
  try {
    const cf = (window as any).Cashfree({ mode: order.mode === "sandbox" ? "sandbox" : "production" });
    const CHECKOUT_TIMEOUT_MS = 20_000;
    const result = await Promise.race([
      cf.checkout({ paymentSessionId: order.paymentSessionId, redirectTarget: "_modal" }),
      new Promise((r) => setTimeout(() => r("__stalled__"), CHECKOUT_TIMEOUT_MS)),
    ]);
    stalled = result === "__stalled__";
  } catch { /* modal closed by the user — fall through to verify */ }
  finally { document.removeEventListener("securitypolicyviolation", onViolation); }

  if (violations.length) {
    return {
      ok: false,
      error: "The payment window was blocked by this site's security policy. " +
             "This is a configuration fault on our side, not your payment. Details: " + violations.join("; "),
    };
  }
  if (stalled) {
    /* Not necessarily fatal — the customer may simply be slow. Verify anyway;
       a real payment will have settled and the webhook is the reliable path. */
    console.warn("[checkout] Cashfree did not settle within the timeout; verifying anyway.");
  }

  try {
    const v = await fetch("/api/pay/cashfree/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.orderId }) }).then((r) => r.json());
    return { ok: Boolean(v.ok), error: v.error, kind: v.kind, balance: v.balance, plan: v.plan };
  } catch { return { ok: false, error: "Could not verify payment." }; }
}
