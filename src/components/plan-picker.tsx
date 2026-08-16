"use client";
import { useState } from "react";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { PLANS } from "@/lib/config";
import { payCashfree } from "@/lib/pay/checkout-client";

/**
 * In-app plan picker that actually charges.
 *
 * Every plan card in the product used to link to /pricing, whose CTAs opened a
 * lead-capture form — so Solo, Starter and Growth could not be bought anywhere,
 * and a locked-out trial user was offered exactly one price: the hardcoded
 * ₹17,999 Premium button.
 */
export function PlanPicker({ currentPlan = "", savedPhone = "" }: { currentPlan?: string; savedPhone?: string }) {
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  // Cashfree requires a customer phone. We used to send 9999999999 for
  // everyone, which showed up on the checkout page and the receipt.
  const [phone, setPhone] = useState(savedPhone);
  const phoneOk = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, "").slice(-10));

  async function choose(planId: string, planName: string) {
    if (!phoneOk) { setMsg("Enter the mobile number for your payment receipt first."); return; }
    setBusy(planId); setMsg("");
    const res = await payCashfree({ kind: "plan", plan: planId, annual, phone: phone.replace(/\D/g, "").slice(-10) });
    setBusy("");
    if (res.ok) { location.reload(); return; }
    setMsg(res.needsConfig
      ? "Online payments aren't switched on yet — please contact us and we'll activate your plan."
      : (res.error || `Could not start checkout for ${planName}.`));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <span className={!annual ? "font-medium" : "text-muted-foreground"}>Monthly</span>
        <button
          onClick={() => setAnnual((a) => !a)}
          aria-label="Toggle annual billing"
          className="relative h-6 w-11 rounded-full bg-secondary border"
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-primary transition-all ${annual ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <span className={annual ? "font-medium" : "text-muted-foreground"}>
          Annual <span className="text-success text-xs">(save ~20%)</span>
        </span>
      </div>

      <div className="rounded-xl border p-4 max-w-md">
        <label className="text-sm font-medium">Mobile number for your receipt</label>
        <p className="text-xs text-muted-foreground mt-0.5">Required by the payment gateway. Used for your receipt and UPI confirmation.</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">+91</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            placeholder="98765 43210"
            className="rounded-lg border bg-background px-3 h-10 text-sm flex-1 outline-none focus:ring-2 focus:ring-ring"
          />
          {phoneOk && <span className="text-xs text-success">✓</span>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {PLANS.map((p) => {
          const custom = p.monthly === 0;
          const price = annual ? p.annual : p.monthly;
          const isCurrent = currentPlan.toLowerCase() === p.id;
          return (
            <div key={p.id} className={`rounded-xl border p-4 flex flex-col ${p.highlight ? "border-primary" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{p.name}</span>
                {isCurrent && <span className="text-[10px] uppercase tracking-wide text-primary border border-primary/40 rounded-full px-2 py-0.5">Current</span>}
              </div>
              <div className="text-lg font-bold mt-1">
                {custom ? "Custom" : `₹${price.toLocaleString("en-IN")}`}
                {!custom && <span className="text-xs text-muted-foreground font-normal">{annual ? "/yr" : "/mo"}</span>}
              </div>
              <ul className="mt-3 space-y-1.5 text-xs flex-1">
                {p.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-success shrink-0" />{f}</li>
                ))}
              </ul>
              {custom ? (
                // Enterprise is genuinely bespoke — a sales conversation, not a checkout.
                <a href="/contact" className="mt-3 block text-center rounded-lg border h-9 leading-9 text-xs hover:bg-accent">Contact us</a>
              ) : (
                <button
                  onClick={() => choose(p.id, p.name)}
                  disabled={Boolean(busy) || isCurrent || !phoneOk}
                  className={`mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg h-9 text-xs font-medium disabled:opacity-60 ${p.highlight ? "bg-primary text-primary-foreground hover:opacity-90" : "border hover:bg-accent"}`}
                >
                  {busy === p.id
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting…</>
                    : isCurrent ? "Your plan" : <><CreditCard className="h-3.5 w-3.5" /> {annual ? "Pay yearly" : "Choose"}</>}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {msg && <p className="text-sm text-danger">{msg}</p>}
      <p className="text-xs text-muted-foreground">
        Secure payment via Cashfree. Plans run for the period you buy — 30 days monthly, 365 days annual — and stack if you renew early.
      </p>
    </div>
  );
}
