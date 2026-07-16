"use client";
import { useState } from "react";
import { CreditCard } from "lucide-react";

function loadRz(): Promise<boolean> {
  return new Promise((res) => {
    if ((window as any).Razorpay) return res(true);
    const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s);
  });
}

export function UpgradeButton({ plan = "Premium", className = "" }: { plan?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  async function pay() {
    setBusy(true);
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const j = await r.json();
      if (!j.ok) { window.location.href = "/pricing"; return; }
      await loadRz();
      const rz = new (window as any).Razorpay({
        key: j.keyId, order_id: j.orderId, amount: j.amount, currency: "INR",
        name: "MNB Cortex", description: `${j.plan} plan`,
        handler: async (resp: any) => {
          await fetch("/api/checkout/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...resp, plan: j.plan, amount: j.amount }) });
          location.reload();
        },
        theme: { color: "#635bff" },
      });
      rz.open();
    } catch { window.location.href = "/pricing"; }
    finally { setBusy(false); }
  }
  return (
    <button onClick={pay} disabled={busy} className={className || "inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-5 text-sm font-medium hover:opacity-90"}>
      <CreditCard className="h-4 w-4" /> {busy ? "Starting…" : `Upgrade to ${plan}`}
    </button>
  );
}
