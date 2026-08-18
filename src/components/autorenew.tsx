"use client";
import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Loader2, X } from "lucide-react";
import { PLANS } from "@/lib/config";

/**
 * Auto-renewal control.
 *
 * Without a mandate, every plan is a one-off order and the workspace locks 30
 * days later unless the customer remembers to pay again. This lets them
 * authorise once.
 *
 * UPI Autopay is capped at ₹15,000 per mandate, so the copy tells a Premium or
 * Business customer up front that they'll need a card or bank mandate rather
 * than letting them discover it at the bank's screen.
 */
const UPI_MAX = 15_000;

export function AutoRenew({
  planId,
  status,
  nextCharge,
}: {
  planId: string;
  status?: string | null;
  nextCharge?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [annual, setAnnual] = useState(false);
  const [live, setLive] = useState(status || "");

  const plan = PLANS.find((p) => p.id === String(planId || "").toLowerCase());
  const amount = plan ? (annual ? plan.annual : plan.monthly) : 0;
  const upiOk = amount > 0 && amount <= UPI_MAX;
  const on = live === "ACTIVE" || live === "INITIALIZED";

  // Cashfree returns to /billing?sub=… — reconcile so the badge is truthful.
  useEffect(() => {
    const u = new URL(window.location.href);
    const sub = u.searchParams.get("sub");
    if (!sub) return;
    u.searchParams.delete("sub");
    window.history.replaceState(null, "", u.pathname + u.search);
    fetch(`/api/pay/cashfree/subscription?sub=${encodeURIComponent(sub)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) {
          setLive(j.status || "");
          setMsg(j.status === "ACTIVE" ? "Auto-renewal is on. You won't be locked out again." : `Mandate status: ${j.status || "pending"}.`);
        }
      })
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/pay/cashfree/subscription", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, annual }),
      });
      const j = await r.json();
      if (j?.ok && (j.authLink || j.sessionId)) {
        if (j.authLink) { window.location.href = j.authLink; return; }
        setMsg("Mandate created. Complete the authorisation in the window Cashfree opens.");
      } else {
        setMsg(j?.error || "Could not start auto-renewal.");
      }
    } catch { setMsg("Network error."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/pay/cashfree/subscription", { method: "DELETE" });
      const j = await r.json();
      if (j?.ok) { setLive("CANCELLED"); setMsg("Auto-renewal is off. Your current paid period is unaffected."); }
      else setMsg(j?.error || "Could not turn it off.");
    } catch { setMsg("Network error."); }
    finally { setBusy(false); }
  }

  if (!plan) return null;

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-sm flex items-center gap-2">
            {on ? <ShieldCheck className="h-4 w-4 text-success" /> : <RefreshCw className="h-4 w-4 text-muted-foreground" />}
            Auto-renewal
            <span className={`text-[11px] rounded px-1.5 py-0.5 ${on ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
              {on ? (live === "ACTIVE" ? "on" : "authorising") : "off"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {on
              ? `Your ${plan.name} plan renews automatically${nextCharge ? ` — next charge ${new Date(nextCharge).toLocaleDateString("en-IN")}` : ""}. Cancel any time; the period you've paid for is never cut short.`
              : "Without this, your plan simply stops at the end of the period and the workspace locks until you pay again. Authorise once and it renews itself."}
          </p>
        </div>
      </div>

      {!on && (
        <>
          <div className="flex items-center gap-3 text-sm mt-3">
            <span className={!annual ? "font-medium" : "text-muted-foreground"}>Monthly</span>
            <button onClick={() => setAnnual((a) => !a)} aria-label="Toggle annual" className="relative h-6 w-11 rounded-full bg-secondary border">
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-primary transition-all ${annual ? "left-[22px]" : "left-0.5"}`} />
            </button>
            <span className={annual ? "font-medium" : "text-muted-foreground"}>Annual</span>
            <span className="text-muted-foreground">· ₹{amount.toLocaleString("en-IN")} per {annual ? "year" : "month"}</span>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            {upiOk
              ? "You can authorise with UPI Autopay, a card, or a bank (eNACH) mandate. Cashfree charges ₹1 to verify and refunds it."
              : `UPI Autopay is capped at ₹${UPI_MAX.toLocaleString("en-IN")} per mandate, so this plan needs a card or bank (eNACH) mandate.`}
          </p>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {on ? (
          <button onClick={disable} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border h-9 px-3 text-xs hover:bg-accent disabled:opacity-60">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Turn off auto-renewal
          </button>
        ) : (
          <button onClick={enable} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-xs font-medium hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Turn on auto-renewal
          </button>
        )}
      </div>

      {msg && <p className="text-xs text-muted-foreground mt-2">{msg}</p>}
    </div>
  );
}
