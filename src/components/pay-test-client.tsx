"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { payCashfree } from "@/lib/pay/checkout-client";
import { Loader2, Check, AlertCircle } from "lucide-react";

/**
 * The ₹1 test purchase.
 *
 * Deliberately uses `payCashfree` — the SAME helper the real top-up and upgrade
 * buttons use — rather than a bespoke fetch. A test that takes its own route to
 * the gateway tests that route, not the customer's.
 *
 * The result is read back from the server afterwards rather than believed from
 * the checkout response, because "the modal said success" is exactly the signal
 * that was misleading before: the webhook used to return 200 on a failed grant,
 * so everything downstream looked fine while nothing had been granted.
 */
export function PayTestClient({ packId, price, before }: { packId: string; price: number; before: number }) {
  const [state, setState] = useState<"idle" | "paying" | "checking" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [after, setAfter] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);

  async function run() {
    setState("paying"); setMsg(""); setAfter(null); setDetail(null);

    const res = await payCashfree({ kind: "credits", packId });

    if (!res.ok) {
      setState("error");
      setMsg(res.error || "Payment did not complete.");
      /* Still check the balance — a failed VERIFY does not mean a failed
         payment. The webhook may well have granted it a moment later, and that
         distinction is the entire point of the exercise. */
      await check();
      return;
    }

    setState("checking");
    await check();
  }

  async function check() {
    setState("checking");
    /* Give the webhook a moment; it races the return-page verify by design. */
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const r = await fetch("/api/superadmin/paytest-status", { cache: "no-store" }).then((x) => x.json());
      setAfter(typeof r.credits === "number" ? r.credits : null);
      setDetail(r);
      setState(r.ok ? "done" : "error");
      if (!r.ok) setMsg(r.error || "Could not read the result back.");
    } catch {
      setState("error"); setMsg("Could not read the result back.");
    }
  }

  const expected = before + 1;
  const granted = after === null ? null : after - before;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={state === "paying" || state === "checking"}>
          {state === "paying" || state === "checking"
            ? <><Loader2 className="h-4 w-4 animate-spin" /> {state === "paying" ? "Opening checkout…" : "Reading the result…"}</>
            : <>Pay ₹{price} and verify</>}
        </Button>
        <Button variant="outline" onClick={check} disabled={state === "paying" || state === "checking"}>
          Re-check without paying
        </Button>
      </div>

      {msg && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {after !== null && (
        <div className="space-y-2 text-sm">
          <Row label="Credits before" value={before.toLocaleString("en-IN")} />
          <Row label="Credits now" value={after.toLocaleString("en-IN")} />
          <Row
            label="Granted"
            value={granted === null ? "—" : String(granted)}
            tone={granted === 1 ? "good" : granted === 0 ? "bad" : "warn"}
          />
          {granted === 1 && (
            <p className="text-success flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Exactly one credit. The chain works end to end.
            </p>
          )}
          {granted === 0 && (
            <p className="text-danger">
              Money may have left but nothing was granted. Check the payments row below —
              a status of <code>grant_unverified</code> or a missing row tells you which half failed.
            </p>
          )}
          {granted !== null && granted > 1 && (
            <p className="text-danger">
              Granted {granted} for one payment — the idempotency guard did not hold.
              This is the failure mode that matters most.
            </p>
          )}
          {detail?.payment && (
            <div className="rounded-lg border p-3 text-xs font-mono space-y-1">
              <div>order_id: {detail.payment.order_id}</div>
              <div>status: {detail.payment.status}</div>
              <div>amount: ₹{detail.payment.amount}</div>
              <div>rows for this order: {detail.claimCount}</div>
              {detail.ledgerReason && <div>ledger: {detail.ledgerReason}</div>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Expected {expected.toLocaleString("en-IN")}. Anything else is a finding, not a hiccup.
          </p>
        </div>
      )}
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const cls = tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : tone === "warn" ? "text-warning" : "";
  return (
    <div className="flex items-center justify-between border-b py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-semibold ${cls}`}>{value}</span>
    </div>
  );
}
