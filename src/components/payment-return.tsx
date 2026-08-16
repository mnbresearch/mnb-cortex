"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

/**
 * Completes a Cashfree payment that came back via REDIRECT rather than the modal.
 *
 * createOrder() sets return_url to `${origin}${path}?order_id={order_id}`, but
 * nothing ever read that parameter — so for UPI-intent and netbanking (how most
 * Indian SMEs actually pay) the customer landed back on an unchanged page with
 * no confirmation, and activation depended entirely on the webhook arriving.
 *
 * Verification is idempotent server-side, so calling it here is safe even when
 * the webhook already settled the order.
 */
export function PaymentReturn() {
  const [state, setState] = useState<"idle" | "checking" | "done" | "pending" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const orderId = url.searchParams.get("order_id");
    if (!orderId) return;

    // Clear it so a refresh doesn't re-run this.
    url.searchParams.delete("order_id");
    window.history.replaceState(null, "", url.pathname + url.search);

    setState("checking");
    fetch("/api/pay/cashfree/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.kind === "plan") { setState("done"); setMsg(`Your ${j.plan} plan is active. Thank you!`); setTimeout(() => location.reload(), 1800); }
        else if (j.ok && j.kind === "credits") { setState("done"); setMsg(`${j.credits} credits added. New balance: ${j.balance ?? "updated"}.`); setTimeout(() => location.reload(), 1800); }
        else if (j.pending) { setState("pending"); setMsg("Payment hasn't completed yet. If money left your account it will activate automatically within a minute."); }
        else { setState("error"); setMsg(j.error || "We couldn't confirm that payment."); }
      })
      .catch(() => { setState("error"); setMsg("We couldn't reach the server to confirm your payment."); });
  }, []);

  if (state === "idle") return null;

  const tone =
    state === "done" ? "border-success/30 bg-success/5 text-success"
    : state === "error" ? "border-danger/30 bg-danger/5 text-danger"
    : "border-warning/30 bg-warning/5 text-warning";

  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 text-sm ${tone}`}>
      {state === "checking" ? <Loader2 className="h-4 w-4 animate-spin shrink-0 mt-0.5" />
        : state === "done" ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
      <span>{state === "checking" ? "Confirming your payment…" : msg}</span>
    </div>
  );
}
