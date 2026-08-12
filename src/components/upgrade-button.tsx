"use client";
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { payCashfree } from "@/lib/pay/checkout-client";

export function UpgradeButton({ plan = "Growth", annual = false, className = "" }: { plan?: string; annual?: boolean; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function pay() {
    setBusy(true); setMsg("");
    const cf = await payCashfree({ kind: "plan", plan, annual });
    setBusy(false);
    if (cf.ok) { location.reload(); return; }
    setMsg(cf.needsConfig
      ? "Online payments are being set up — please contact us to activate your plan."
      : (cf.error || "Payment could not be completed."));
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
