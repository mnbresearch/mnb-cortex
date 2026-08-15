"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Sparkles, Lock, Check, X } from "lucide-react";
import { PLANS as ALL_PLANS } from "@/lib/config";

// Real prices, straight from the pricing source of truth.
const PLANS = ALL_PLANS
  .filter((p) => ["starter", "growth", "premium"].includes(p.id))
  .map((p) => ({ name: p.name, price: "₹" + p.monthly.toLocaleString("en-IN"), note: p.tagline, highlight: p.id === "growth" }));

// Pages that must stay reachable so a locked user can actually pay.
const ALLOW = ["/billing", "/settings", "/pricing"];

export function TrialGuard({ status, daysLeft, locked, lapsedSubscription = false }: { status: string; daysLeft: number; locked: boolean; lapsedSubscription?: boolean }) {
  const path = usePathname();
  const [dismissed, setDismissed] = useState(false);

  // ---- Hard paywall (trial ended, or a paid period ran out) ----
  if (locked && !ALLOW.some((p) => path?.startsWith(p))) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-6 text-center shadow-2xl glow-ring">
          <div className="h-12 w-12 rounded-full bg-primary/10 grid place-items-center mx-auto"><Lock className="h-6 w-6 text-primary" /></div>
          <h2 className="mt-3 text-xl font-bold">{lapsedSubscription ? "Your subscription has ended" : "Your free trial has ended"}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {lapsedSubscription
              ? "Renew your plan to pick up right where you left off. Your data is safe and waiting."
              : "Choose a plan to keep using MNB Cortex. Your data is safe and waiting."}
          </p>
          <div className="grid sm:grid-cols-3 gap-2 mt-5">
            {PLANS.map((p) => (
              <div key={p.name} className={`rounded-xl border p-3 ${p.highlight ? "border-primary/50 bg-primary/5" : ""}`}>
                <div className="font-semibold text-sm">{p.name}</div>
                <div className="text-lg font-bold">{p.price}<span className="text-xs text-muted-foreground font-normal">/mo</span></div>
                <div className="text-[11px] text-muted-foreground">{p.note}</div>
              </div>
            ))}
          </div>
          <Link href="/billing" className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg brand-gradient text-white h-11 px-6 font-medium w-full sm:w-auto"><Sparkles className="h-4 w-4" /> {lapsedSubscription ? "Renew my plan" : "Choose a plan"}</Link>
          <div className="mt-3 text-xs text-muted-foreground flex items-center justify-center gap-3">
            <Link href="/pricing" className="hover:text-foreground underline">Compare plans</Link>
            <span>·</span>
            <Link href="/help" className="hover:text-foreground underline">Talk to us</Link>
          </div>
        </div>
      </div>
    );
  }

  // ---- Trial countdown banner ----
  if (status === "trialing" && !dismissed && !ALLOW.some((p) => path?.startsWith(p))) {
    const urgent = daysLeft <= 3;
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100%-2rem)]">
        <div className={`flex items-center gap-3 rounded-full border shadow-lg px-4 py-2 text-sm ${urgent ? "bg-danger/10 border-danger/30" : "bg-card"}`}>
          <Sparkles className={`h-4 w-4 shrink-0 ${urgent ? "text-danger" : "text-primary"}`} />
          <span className={urgent ? "text-danger font-medium" : ""}>
            {daysLeft > 0 ? <><b>{daysLeft}</b> {daysLeft === 1 ? "day" : "days"} left in your free trial</> : "Your trial ends today"}
          </span>
          <Link href="/billing" className="rounded-full brand-gradient text-white px-3 py-1 text-xs font-medium shrink-0">Upgrade</Link>
          <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    );
  }

  // ---- Renewal reminder for a paid plan about to lapse ----
  if (status === "active" && daysLeft <= 7 && !dismissed && !ALLOW.some((p) => path?.startsWith(p))) {
    const urgent = daysLeft <= 2;
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100%-2rem)]">
        <div className={`flex items-center gap-3 rounded-full border shadow-lg px-4 py-2 text-sm ${urgent ? "bg-danger/10 border-danger/30" : "bg-card"}`}>
          <Sparkles className={`h-4 w-4 shrink-0 ${urgent ? "text-danger" : "text-primary"}`} />
          <span className={urgent ? "text-danger font-medium" : ""}>
            {daysLeft > 0 ? <>Your plan renews in <b>{daysLeft}</b> {daysLeft === 1 ? "day" : "days"}</> : "Your plan ends today"}
          </span>
          <Link href="/billing" className="rounded-full brand-gradient text-white px-3 py-1 text-xs font-medium shrink-0">Renew</Link>
          <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    );
  }

  return null;
}
