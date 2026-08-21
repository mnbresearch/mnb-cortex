"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";

// A gentle once-a-day upgrade pop-up shown to trial workspaces.
export function DailyNudge({ status, daysLeft }: { status: string; daysLeft: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (status !== "trialing") return;
    const today = new Date().toISOString().slice(0, 10);
    try { if (localStorage.getItem("cortex-nudge") === today) return; } catch {}
    const t = setTimeout(() => setShow(true), 1400);
    return () => clearTimeout(t);
  }, [status]);

  function dismiss() {
    try { localStorage.setItem("cortex-nudge", new Date().toISOString().slice(0, 10)); } catch {}
    setShow(false);
  }
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={dismiss}>
      <div className="max-w-sm w-full rounded-2xl border bg-card p-6 shadow-2xl text-center relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={dismiss} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        <div className="h-12 w-12 rounded-2xl brand-gradient grid place-items-center text-white mx-auto animate-float"><Sparkles className="h-6 w-6" /></div>
        <h2 className="mt-3 font-semibold text-lg">
          {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left on your plan` : "Your plan is ending"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Loving Cortex? Upgrade now to keep your AI COO, agents, memory and reports running without interruption when the trial ends.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link href="/pricing" onClick={dismiss}><Button className="w-full">See plans & upgrade</Button></Link>
          <button onClick={dismiss} className="text-sm text-muted-foreground hover:text-foreground">Maybe later</button>
        </div>
      </div>
    </div>
  );
}
