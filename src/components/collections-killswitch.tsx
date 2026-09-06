"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, ShieldCheck, ShieldOff } from "lucide-react";

/**
 * The operator kill switch for outbound collections.
 *
 * WHY IT NEEDED A UI AT ALL.
 *
 * The switch existed end to end already — `platform_switches.collections_enabled`,
 * the `cortex_collections_enabled()` guard the sender checks before every run,
 * the health check that surfaces it, and `setCollectionsSwitch()` itself. What
 * did not exist was any way to REACH it: zero call sites. Stopping the system
 * meant opening the Supabase SQL editor and writing an UPDATE by hand.
 *
 * That is the wrong shape for this particular control. Collections sends email
 * and WhatsApp to the customer's customers, in the customer's name, from their
 * own domain and sender. If it starts writing something wrong, or sending at
 * the wrong hour, or chasing people who had been excluded, the damage lands on
 * a third party who never chose to use this product — and it compounds every
 * minute the run continues. A control whose response time depends on finding
 * database credentials under pressure is not an emergency control.
 *
 * Global rather than per-workspace, deliberately: if something is wrong with
 * how Cortex writes or when it sends, it is wrong everywhere, and picking
 * through workspaces one at a time during an incident makes the incident
 * longer.
 *
 * Turning it back ON asks for confirmation too. Re-enabling a paused sender is
 * the moment a queue that has been accumulating gets flushed, so it deserves
 * the same deliberateness as stopping it.
 */
export function CollectionsKillSwitch({ enabled, reason, updatedAt }: {
  enabled: boolean; reason?: string | null; updatedAt?: string | null;
}) {
  const [on, setOn] = useState(enabled);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function flip(next: boolean) {
    setBusy(true); setMsg(null);
    try {
      /* Through /api/superadmin, the same path every other operator action
         uses. Importing the server action directly would pull a `server-only`
         module into a client component and break the build. */
      const res = await fetch("/api/superadmin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "collectionsSwitch", on: next, reason: why }),
      }).then((r) => r.json());
      if (res.ok) {
        setOn(Boolean(res.on));
        setConfirming(false);
        setMsg({ ok: true, text: next
          ? "Collections resumed. Queued messages will send on the next run."
          : "Collections STOPPED platform-wide. Nothing further will be sent until you resume." });
      } else {
        setMsg({ ok: false, text: res.error || "Could not flip the switch." });
      }
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Could not reach the server." });
    } finally { setBusy(false); }
  }

  return (
    <Card className={`p-5 space-y-4 ${on ? "" : "border-danger/40 bg-danger/5"}`}>
      <div className="flex items-start gap-3">
        {on
          ? <ShieldCheck className="h-5 w-5 text-success mt-0.5 shrink-0" aria-hidden="true" />
          : <ShieldOff className="h-5 w-5 text-danger mt-0.5 shrink-0" aria-hidden="true" />}
        <div className="flex-1">
          <div className="font-semibold">Outbound collections</div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {on
              ? "Running. Approved messages send to customers on the normal schedule."
              : "STOPPED platform-wide. No workspace is sending anything."}
          </p>
          {!on && reason && <p className="text-sm mt-1"><b>Reason given:</b> {reason}</p>}
          {updatedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Last changed {new Date(updatedAt).toLocaleString("en-IN")}
            </p>
          )}
        </div>
      </div>

      {/* The state itself is announced — an operator using a screen reader
          during an incident needs to hear that the stop actually took. */}
      <p role="status" aria-live="polite" className="sr-only">
        Outbound collections are {on ? "running" : "stopped"}.
      </p>

      {on ? (
        !confirming ? (
          <Button variant="outline" className="border-danger/40 text-danger hover:bg-danger/10"
            onClick={() => setConfirming(true)}>
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Stop all collections
          </Button>
        ) : (
          <div className="space-y-3 rounded-lg border border-danger/40 p-3">
            <p className="text-sm">
              This stops outbound email and WhatsApp for <b>every workspace</b>, immediately.
              Nothing is deleted — queued messages stay queued and send when you resume.
            </p>
            <label className="block">
              <span className="text-sm text-muted-foreground">Why (shown in the health check and to whoever looks next)</span>
              <input
                value={why} onChange={(e) => setWhy(e.target.value)}
                aria-label="Reason for stopping collections"
                placeholder="e.g. wrong template went out on the 09:00 run"
                className="mt-1 w-full rounded-lg border bg-background px-3 h-11 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <div className="flex gap-2">
              <Button onClick={() => flip(false)} disabled={busy}
                className="bg-danger text-white hover:opacity-90">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Stopping…</> : "Yes, stop everything"}
              </Button>
              <Button variant="outline" onClick={() => { setConfirming(false); setMsg(null); }} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            Resuming will send anything that queued while stopped, on the next run.
            Check the queue before you do.
          </p>
          <Button onClick={() => flip(true)} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Resuming…</> : "Resume collections"}
          </Button>
        </div>
      )}

      {msg && (
        <p role={msg.ok ? "status" : "alert"} aria-live={msg.ok ? "polite" : "assertive"}
          className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </Card>
  );
}
