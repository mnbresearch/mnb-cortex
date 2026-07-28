"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, X } from "lucide-react";

const LOW = 50; // warn under this many credits

// Slim, non-blocking warning when a workspace is low on / out of AI credits.
export function CreditBanner() {
  const [state, setState] = useState<{ enforceable: boolean; unlimited: boolean; balance: number } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/credits").then((r) => r.json()).then((j) => { if (alive) setState(j); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (hidden || !state || !state.enforceable || state.unlimited || state.balance > LOW) return null;
  const out = state.balance <= 0;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 max-w-[92%]">
      <div className={`flex items-center gap-3 rounded-full border px-4 py-2 shadow-lg text-sm ${out ? "bg-danger/10 border-danger/30" : "bg-warning/10 border-warning/30"}`}>
        <Coins className={`h-4 w-4 ${out ? "text-danger" : "text-warning"}`} />
        <span>
          {out ? "You're out of AI credits." : `Low on AI credits — ${state.balance} left.`}{" "}
          <Link href="/usage" className="font-medium text-primary underline underline-offset-2">Top up</Link>
        </span>
        <button onClick={() => setHidden(true)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
