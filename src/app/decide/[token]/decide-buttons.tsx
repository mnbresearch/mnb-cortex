"use client";
import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { decideByToken, type DecideResult } from "./actions";

/*
  canApprove=false for actions that move money or contact someone outside the
  team: an email link carries no second factor, so those are approved in the
  app. Rejecting stays available — doing less is always safe. The server
  action enforces the same rule; this only keeps the page honest.
*/
export function DecideButtons({ token, canApprove = true }: { token: string; canApprove?: boolean }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [result, setResult] = useState<DecideResult | null>(null);

  async function go(verb: "approve" | "reject") {
    if (verb === "approve" && !confirm("Approve and run this now?")) return;
    setBusy(verb);
    try { setResult(await decideByToken(token, verb)); }
    catch (e: any) { setResult({ ok: false, error: e?.message || "Could not reach the server." }); }
    finally { setBusy(null); }
  }

  if (result) {
    return (
      <div className={`rounded-lg p-3 text-sm ${result.ok ? "bg-success/10 border border-success/30" : "bg-destructive/5 border border-destructive/30"}`} role="status">
        {result.ok ? (result.verb === "approve" ? `Approved and run. ${result.summary}` : result.summary) : result.error}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {canApprove ? (
      <button type="button" onClick={() => go("approve")} disabled={busy !== null}
        className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-11 px-5 text-sm font-medium disabled:opacity-60">
        {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Approve & run
      </button>
      ) : (
        <a href="/approvals" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-11 px-5 text-sm font-medium">
          <Check className="h-4 w-4" aria-hidden="true" /> Approve in the app
        </a>
      )}
      <button type="button" onClick={() => go("reject")} disabled={busy !== null}
        className="inline-flex items-center gap-2 rounded-lg border h-11 px-5 text-sm font-medium hover:bg-accent disabled:opacity-60">
        {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />} Reject
      </button>
    </div>
  );
}
