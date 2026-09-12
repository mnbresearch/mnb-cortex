"use client";
import { useState, useTransition } from "react";
import { KeyRound, Copy, Check, AlertTriangle } from "lucide-react";
import { generateApiKey } from "@/lib/actions";

/*
  CREATE A KEY, AND SHOW IT EXACTLY ONCE.

  Cortex now stores only a SHA-256 of an API key (2026_zzze_api_key_hash.sql),
  so this is the single moment the plaintext exists anywhere the customer can
  reach. That makes the reveal a real design problem rather than a detail:

    - NOT a redirect to /developers?key=… — that writes a live credential into
      browser history, the Referer header of every subsequent request, and any
      proxy or analytics log in between.
    - NOT a cookie — a secret that travels on every request to the origin, to
      be read back on a later render, is a secret with a much longer life than
      it needs.

  So it is returned from the server action straight into component state, shown
  once, and never persisted. Reload the page and it is gone, because it is gone.

  A `<form action={...}>` cannot do this — a form action must return void — so
  this is a client component that awaits the action and keeps the result.
*/
export function ApiKeyCreator() {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setKey(null); setCopied(false);
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("label", label.trim() || "API key");
        const r = await generateApiKey(fd);
        setKey(r?.key || null);
        setLabel("");
      } catch (e: any) {
        setErr(e?.message || "Could not create a key.");
      }
    });
  }

  return (
    <div className="mb-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="api-key-label" className="block text-xs text-muted-foreground mb-1">Label</label>
          <input
            id="api-key-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Zapier, backend"
            className="w-full rounded-lg border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground min-h-11 px-4 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" /> {pending ? "Generating…" : "Generate key"}
        </button>
      </form>

      {err && <p className="text-sm text-danger mt-2">{err}</p>}

      {key && (
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-4" role="status">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Copy this now — it will not be shown again.</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cortex stores only a hash of your key, so nobody here can look it up for you later. If you lose it,
                delete it and generate another.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 min-w-0 break-all rounded-lg border bg-background px-3 py-2 text-xs">{key}</code>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(key); setCopied(true); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border min-h-11 px-3 text-xs hover:bg-accent shrink-0"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
