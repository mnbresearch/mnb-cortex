"use client";
import { useState, useTransition } from "react";

/*
  Operator control for the abandoned-checkout follow-up. Talks to
  /api/superadmin (superadmin-actions.ts is server-only, so it is not imported
  here — test-boundaries.mjs enforces that).

  Going LIVE asks for confirmation and is only offered after the operator has
  had the chance to send themselves a test.
*/
export function FollowupPanel({ mode: initial, migrated }: { mode: "off" | "dry_run" | "live"; migrated: boolean }) {
  const [mode, setMode] = useState(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const call = (body: any) => fetch("/api/superadmin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

  function set(m: "off" | "dry_run" | "live") {
    if (m === "live" && !confirm("Go live: real emails will be sent to owners of workspaces whose checkout Cashfree confirmed unpaid (one each, at most every 14 days). Continue?")) return;
    start(async () => {
      const r = await call({ op: "followupMode", mode: m }).catch(() => ({ ok: false, error: "Network error" }));
      if (r.ok) { setMode(m); setMsg(`Mode is now ${m.replace("_", " ")}.`); } else setMsg(r.error || "Could not change the mode.");
    });
  }
  function test() {
    start(async () => {
      const r = await call({ op: "followupTest" }).catch(() => ({ ok: false, error: "Network error" }));
      setMsg(r.ok ? `Test sent to ${r.to}. Check the inbox before going live.` : (r.error || "Test not sent."));
    });
  }
  if (!migrated) return <p className="text-sm text-muted-foreground">Run <code className="text-xs">supabase/migrations/2026_zzzx_checkout_followup.sql</code> to enable. Until then nothing is sent.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Follow-up mode">
        {(["off", "dry_run", "live"] as const).map((m) => (
          <button key={m} type="button" disabled={pending || mode === m} onClick={() => set(m)} aria-pressed={mode === m}
            className={`rounded-lg border min-h-11 px-3 text-sm ${mode === m ? (m === "live" ? "bg-success/15 border-success/40" : "bg-secondary") : "hover:bg-accent"} disabled:opacity-80`}>
            {m === "dry_run" ? "Dry run" : m === "live" ? "Live" : "Off"}
          </button>
        ))}
        <button type="button" disabled={pending} onClick={test} className="rounded-lg border min-h-11 px-3 text-sm hover:bg-accent">Send me a test</button>
      </div>
      {msg && <p className="text-xs mt-2" role="status">{msg}</p>}
    </div>
  );
}
