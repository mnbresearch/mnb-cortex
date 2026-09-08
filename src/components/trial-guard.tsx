"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Sparkles, Lock, Check, X } from "lucide-react";
import { PLANS as ALL_PLANS } from "@/lib/config";
import { isAllowedWhileLocked, isBannerSuppressed } from "@/lib/paywall";

// Real prices, straight from the pricing source of truth.
/*
  The entry tier belongs on the paywall more than anywhere else in the product.

  This is the screen someone sees at the moment they decide whether to pay, and
  it opened at ₹4,999 — with ₹799 nowhere on it. Someone who would have tried
  the cheap tier was shown only prices six times higher and no third option.
*/
const PLANS = ALL_PLANS
  .filter((p) => ["try", "watch", "watchpro"].includes(p.id))
  .map((p) => ({ name: p.name, price: "₹" + p.monthly.toLocaleString("en-IN"), note: p.tagline, highlight: p.id === "watchpro" }));

/*
  Pages that must stay reachable so a locked user can actually pay — AND finish
  setting up.

  /onboarding was missing, and that was a deadlock rather than an inconvenience.
  TRIAL_DAYS is 0 by design (this is a paid product with no free tier), so
  ensureWorkspace() stamps `trial_ends_at = now` on every new workspace,
  entitlement immediately reads "expired", and billing marks it locked. The
  post-signup redirect then sends the user to /onboarding — a page this
  component covered with a full-screen modal.

  So the first screen a paying customer ever saw was a lock over a welcome
  wizard they could not reach, asking them to choose a plan before they had been
  told what the product does. Every destination that wizard links to was behind
  the same wall.

  Onboarding is not product usage: it writes a company name and an industry and
  costs nothing to run. Being asked to pay before you can even say who you are
  is the wrong order, and it was not a decision anyone made — it was a list that
  had not been updated.
*/
/*
  AND THE PLACES THE WIZARD ITSELF SENDS PEOPLE.

  Adding /onboarding fixed the door and not the corridor. The wizard's own three
  exits are `/import` (its primary button), `/receivables` (its finish CTA) and
  `/dashboard` — every one of them was still behind this wall. So the sequence
  was: sign up, reach a welcome wizard, complete it, press the button it gives
  you, and hit the lock anyway. Seeding the full demo business works and is
  awaited, which made it worse: the data was there and could not be looked at.

  /usage is here for the same reason. /billing tells a locked customer to
  "start with a ₹149 credit pack", and the only place to buy one is /usage —
  which this list did not cover. The one page they could reach gave an
  instruction the paywall made impossible to follow.

  These are the destinations of a first session, not the product. Importing your
  own books and looking at the first receivables screen is how someone decides
  whether to pay at all; charging before that is asking for a decision with no
  information. The metering in lib/credits.ts is the real control and it runs
  server-side on every billable action, so nothing expensive is being given
  away here.

  Matched with startsWith, deliberately — but note that makes "/pricing" also
  match "/pricing-optimizer", which is a real product page. Listed exactly so
  the prefix cannot widen by accident.
*/
/*
  The list itself now lives in lib/paywall.ts, next to the obligations it has to
  satisfy and next to a test that executes it. A copy here is exactly how the
  wizard's own destinations came to be missing from it.
*/

export function TrialGuard({ status, daysLeft, locked, lapsedSubscription = false, subscriptionEndsAt = null }: { status: string; daysLeft: number; locked: boolean; lapsedSubscription?: boolean; subscriptionEndsAt?: string | null }) {
  const path = usePathname();
  const [dismissed, setDismissed] = useState(false);

  // ---- Hard paywall (trial ended, or a paid period ran out) ----
  if (locked && !isAllowedWhileLocked(path)) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-6 text-center shadow-2xl glow-ring">
          <div className="h-12 w-12 rounded-full bg-primary/10 grid place-items-center mx-auto"><Lock className="h-6 w-6 text-primary" /></div>
          <h2 className="mt-3 text-xl font-bold">{lapsedSubscription ? "Your subscription has ended" : "Choose a plan to get started"}</h2>
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
  if (status === "trialing" && !dismissed && !isBannerSuppressed(path)) {
    const urgent = daysLeft <= 3;
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100%-2rem)]">
        <div className={`flex items-center gap-3 rounded-full border shadow-lg px-4 py-2 text-sm ${urgent ? "bg-danger/10 border-danger/30" : "bg-card"}`}>
          <Sparkles className={`h-4 w-4 shrink-0 ${urgent ? "text-danger" : "text-primary"}`} />
          <span className={urgent ? "text-danger font-medium" : ""}>
            {daysLeft > 0 ? <><b>{daysLeft}</b> {daysLeft === 1 ? "day" : "days"} left on your plan</> : "Choose a plan to continue"}
          </span>
          <Link href="/billing" className="rounded-full brand-gradient text-white px-3 py-1 text-xs font-medium shrink-0">Upgrade</Link>
          <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground shrink-0 min-h-11 min-w-11 p-2" aria-label="Close"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    );
  }

  // ---- Renewal reminder for a paid plan about to lapse ----
  // Only when there IS a recorded end date: an active workspace without one
  // never expires and must never be nagged to renew.
  if (status === "active" && subscriptionEndsAt && daysLeft <= 7 && !dismissed && !isBannerSuppressed(path)) {
    const urgent = daysLeft <= 2;
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100%-2rem)]">
        <div className={`flex items-center gap-3 rounded-full border shadow-lg px-4 py-2 text-sm ${urgent ? "bg-danger/10 border-danger/30" : "bg-card"}`}>
          <Sparkles className={`h-4 w-4 shrink-0 ${urgent ? "text-danger" : "text-primary"}`} />
          <span className={urgent ? "text-danger font-medium" : ""}>
            {daysLeft > 0 ? <>Your plan renews in <b>{daysLeft}</b> {daysLeft === 1 ? "day" : "days"}</> : "Your plan ends today"}
          </span>
          <Link href="/billing" className="rounded-full brand-gradient text-white px-3 py-1 text-xs font-medium shrink-0">Renew</Link>
          <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground shrink-0 min-h-11 min-w-11 p-2" aria-label="Close"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    );
  }

  return null;
}
