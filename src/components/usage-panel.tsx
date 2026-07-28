"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, Loader2, Check } from "lucide-react";

type Pack = { id: string; label: string; credits: number; price: number; per: string };

declare global { interface Window { Razorpay?: any } }

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function UsagePanel({ packs }: { packs: Pack[] }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  async function buy(pack: Pack) {
    setBusy(pack.id); setMsg("");
    try {
      const r = await fetch("/api/credits/topup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packId: pack.id }) });
      const j = await r.json();
      if (!j.ok) { setMsg(j.error || "Could not start checkout."); setBusy(""); return; }
      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) { setMsg("Could not load the payment window."); setBusy(""); return; }
      const rzp = new window.Razorpay({
        key: j.keyId, order_id: j.orderId, amount: j.amount, currency: "INR",
        name: "MNB Cortex", description: `${pack.credits.toLocaleString("en-IN")} AI credits`,
        handler: async (resp: any) => {
          const v = await fetch("/api/credits/verify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...resp, packId: pack.id }),
          }).then((x) => x.json());
          if (v.ok) { setDone(true); setMsg(`Added ${pack.credits.toLocaleString("en-IN")} credits. New balance ${v.balance?.toLocaleString("en-IN")}.`); setTimeout(() => location.reload(), 1400); }
          else setMsg(v.error || "Payment verification failed.");
          setBusy("");
        },
        modal: { ondismiss: () => setBusy("") },
        theme: { color: "#1f4a3b" },
      });
      rzp.open();
    } catch (e: any) { setMsg(e?.message || "Checkout error."); setBusy(""); }
  }

  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-3">
        {packs.map((p) => (
          <Card key={p.id} className="p-4 flex flex-col">
            <div className="text-sm text-muted-foreground">{p.label}</div>
            <div className="text-2xl font-bold mt-1 flex items-center gap-1"><Coins className="h-5 w-5 text-primary" />{p.credits.toLocaleString("en-IN")}</div>
            <div className="text-sm text-muted-foreground mt-0.5">₹{p.price.toLocaleString("en-IN")} · {p.per}</div>
            <Button className="mt-3" size="sm" disabled={Boolean(busy)} onClick={() => buy(p)}>
              {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <Check className="h-4 w-4" /> : null}
              {busy === p.id ? "Opening…" : "Buy credits"}
            </Button>
          </Card>
        ))}
      </div>
      {msg && <p className="text-sm text-muted-foreground mt-3">{msg}</p>}
      <p className="text-xs text-muted-foreground mt-2">Credits never expire and are shared across everyone in this workspace. Your monthly plan allowance is added on top automatically.</p>
    </div>
  );
}
