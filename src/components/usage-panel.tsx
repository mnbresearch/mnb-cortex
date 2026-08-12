"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, Loader2, Check } from "lucide-react";
import { payCashfree } from "@/lib/pay/checkout-client";

type Pack = { id: string; label: string; credits: number; price: number; per: string };

export function UsagePanel({ packs }: { packs: Pack[] }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  async function buy(pack: Pack) {
    setBusy(pack.id); setMsg("");
    const cf = await payCashfree({ kind: "credits", packId: pack.id });
    setBusy("");
    if (cf.ok) { setDone(true); setMsg(`Added ${pack.credits.toLocaleString("en-IN")} credits. New balance ${cf.balance?.toLocaleString("en-IN")}.`); setTimeout(() => location.reload(), 1400); return; }
    setMsg(cf.needsConfig ? "Online payments are being set up — please contact us to add credits." : (cf.error || "Payment could not be completed."));
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
