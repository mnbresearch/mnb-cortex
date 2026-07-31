"use client";
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { payCashfree } from "@/lib/pay/checkout-client";

function loadRz(): Promise<boolean> {
  return new Promise((res) => {
    if ((window as any).Razorpay) return res(true);
    const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s);
  });
}

export function UpgradeButton({ plan = "Growth", annual = false, className = "" }: { plan?: string; annual?: boolean; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function pay() {
    setBusy(true); setMsg("");
    const cf = await payCashfree({ kind: "plan", plan, annual });
    if (cf.ok) { location.reload(); return; }
    if (!cf.needsConfig) { setMsg(cf.error || "Payment could not be completed."); setBusy(false); return; }
    // Fallback to Razorpay if Cashfree isn't configured.
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, annual }) });
      const j = await r.json();
      if (!j.ok) { setMsg(j.error || "Payments not set up yet."); setBusy(false); return; }
      await loadRz();
      const rz = new (window as any).Razorpay({
        key: j.keyId, order_id: j.orderId, amount: j.amount, currency: "INR", name: "MNB Cortex", description: `${j.plan} plan`,
        handler: async (resp: any) => { await fetch("/api/checkout/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...resp, plan: j.plan, amount: j.amount }) }); location.reload(); },
        theme: { color: "#0d9488" },
      });
      rz.open();
    } catch { setMsg("Could not start checkout."); }
    finally { setBusy(false); }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button onClick={pay} disabled={busy} className={className || "inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-5 text-sm font-medium hover:opacity-90"}>
        <CreditCard className="h-4 w-4" /> {busy ? "Starting…" : `Upgrade to ${plan}`}
      </button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
