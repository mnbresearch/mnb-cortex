"use client";
import { useState, useTransition } from "react";
import { setClientPooling } from "@/lib/actions";
import { Loader2, Wallet, WalletMinimal } from "lucide-react";

/*
  "Uses your credits" — per client, on the console the firm already reads.

  WHY THIS CONTROL EXISTS AT ALL

  The Practice plan lists "Up to 25 client workspaces" directly above "27,750
  AI credits / month". Firms read that as one budget. It was not one budget —
  credits were charged strictly to whichever workspace the action happened in,
  so a partner working inside a client was refused for credits that client had
  never been given.

  Pooling is now real (lib/credit-pool, charge path in lib/credits), but it
  cannot be automatic. Deciding to fund another workspace is a spending
  decision, and inferring it from shared membership would mean a firm's
  allowance silently draining into any workspace someone happened to add them
  to. So it is explicit, per client, and reversible here.

  The refusal messages come back from Postgres — cortex_practice_claim() is
  where the rank and membership checks live, and it returns a code per reason
  rather than one generic failure, precisely so this can tell a partner which
  thing to fix.
*/
export function ClientPoolingToggle({ orgId, clientName, pooled }: { orgId: string; clientName: string; pooled: boolean }) {
  const [on, setOn] = useState(pooled);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function toggle() {
    setErr("");
    const next = !on;
    start(async () => {
      const fd = new FormData();
      fd.set("client", orgId);
      fd.set("on", next ? "1" : "0");
      const r = await setClientPooling(fd);
      if (r.ok) setOn(next);
      else setErr(r.error || "Could not change that.");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
        /* The label says what it DOES, not what it is called. A partner
           scanning twenty-five rows needs to know whose money is being spent,
           and "Pooling: on" does not answer that. */
        title={on
          ? `${clientName}'s AI actions are billed to your firm's credits`
          : `${clientName} pays for its own AI actions`}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 min-h-11 text-xs transition-colors disabled:opacity-60 ${
          on ? "border-primary/30 bg-primary/10 text-primary" : "hover:bg-accent text-muted-foreground"
        }`}
      >
        {pending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          : on
            ? <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
            : <WalletMinimal className="h-3.5 w-3.5" aria-hidden="true" />}
        {on ? "Uses your credits" : "Pays its own"}
      </button>
      {err && <span className="text-[11px] text-danger max-w-[220px] text-right leading-4">{err}</span>}
    </div>
  );
}
