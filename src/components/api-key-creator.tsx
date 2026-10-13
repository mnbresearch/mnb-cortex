"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Copy, Check, AlertTriangle } from "lucide-react";
import { generateApiKey, rotateApiKey } from "@/lib/actions";
import { API_SCOPES, SCOPE_PRESETS, type ApiScope } from "@/lib/api-keys";

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
type Issued = { key?: string | null; prefix?: string; error?: string } | undefined;

/** The one-time reveal, shared by create and rotate. */
export function KeyReveal({ value, note }: { value: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-4" role="status">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Copy this now — it will not be shown again.</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cortex stores only a hash of your key, so nobody here can look it up for you later. If you lose it,
            rotate it.{note ? ` ${note}` : ""}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 min-w-0 break-all rounded-lg border bg-background px-3 py-2 text-xs">{value}</code>
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg border min-h-11 px-3 text-xs hover:bg-accent shrink-0"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SCOPE_LIST = Object.entries(API_SCOPES) as [ApiScope, string][];

export function ApiKeyCreator({ canWrite = true, writePlan = "Practice" }: { canWrite?: boolean; writePlan?: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  /* Read-only by default: least privilege. Writing is a deliberate tick. */
  const [scopes, setScopes] = useState<ApiScope[]>([...SCOPE_PRESETS.read]);
  const [expiry, setExpiry] = useState("365");
  const [key, setKey] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const toggle = (s: ApiScope) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setKey(null);
    if (!scopes.length) { setErr("Choose at least one permission."); return; }
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("label", label.trim() || "API key");
        for (const s of scopes) fd.append("scopes", s);
        fd.set("expiry", expiry);
        const r: Issued = await generateApiKey(fd);
        if (r?.error) { setErr(r.error); return; }
        setKey(r?.key || null);
        setLabel("");
        /* The key list below is server-rendered: refresh it so the new key (status, scopes, expiry) appears. The reveal lives in state and survives. */
        router.refresh();
      } catch (e: any) {
        setErr(e?.message || "Could not create a key.");
      }
    });
  }

  return (
    <div className="mb-4">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="api-key-label" className="block text-xs text-muted-foreground mb-1">Label</label>
            <input
              id="api-key-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Zapier, backend"
              maxLength={80}
              className="w-full rounded-lg border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="api-key-expiry" className="block text-xs text-muted-foreground mb-1">Expires</label>
            <select id="api-key-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)}
              className="rounded-lg border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="30">in 30 days</option>
              <option value="90">in 90 days</option>
              <option value="180">in 180 days</option>
              <option value="365">in 1 year</option>
              <option value="never">never</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground min-h-11 px-4 text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" /> {pending ? "Generating…" : "Generate key"}
          </button>
        </div>
        <fieldset className="rounded-lg border p-3">
          <legend className="px-1 text-xs text-muted-foreground">Permissions — a key can do only what is ticked</legend>
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            <button type="button" onClick={() => setScopes([...SCOPE_PRESETS.read])} className="rounded-md border px-2 min-h-8 hover:bg-accent">Read only</button>
            {canWrite && <button type="button" onClick={() => setScopes([...SCOPE_PRESETS.ingest])} className="rounded-md border px-2 min-h-8 hover:bg-accent">Push data only</button>}
            <button type="button" onClick={() => setScopes(canWrite ? [...SCOPE_PRESETS.full] : [...SCOPE_PRESETS.read])} className="rounded-md border px-2 min-h-8 hover:bg-accent">Everything{canWrite ? "" : " you can"}</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {SCOPE_LIST.map(([s, desc]) => (
              <label key={s} className={`flex items-start gap-2 text-xs min-h-8 ${s === "ingest:write" && !canWrite ? "opacity-60" : ""}`}>
                <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} className="mt-0.5" disabled={s === "ingest:write" && !canWrite} />
                <span><code className="bg-secondary px-1 rounded">{s}</code> <span className="text-muted-foreground">{desc}{s === "ingest:write" && !canWrite ? ` — ${writePlan} and above` : ""}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>

      {err && <p className="text-sm text-danger mt-2" role="alert">{err}</p>}
      {key && <KeyReveal value={key} />}
    </div>
  );
}

/**
 * Rotate (old key keeps working for the grace period) or regenerate (old key
 * dies now). Both ask for the second factor server-side and show the new key once.
 */
export function ApiKeyRotate({ id }: { id: string }) {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [grace, setGrace] = useState("24");
  const [pending, start] = useTransition();
  function go(g: string) {
    if (g === "0" && !confirm("Regenerate: the current key stops working immediately. Continue?")) return;
    setErr(""); setKey(null);
    start(async () => {
      try {
        const fd = new FormData(); fd.set("id", id); fd.set("grace", g);
        const r: Issued = await rotateApiKey(fd);
        if (r?.key) setKey(r.key);
        if (r?.error) setErr(r.error);
        if (r?.key) router.refresh();
      } catch (e: any) { setErr(e?.message || "Could not rotate the key."); }
    });
  }
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <label className="sr-only" htmlFor={`grace-${id}`}>Old key keeps working for</label>
        <select id={`grace-${id}`} value={grace} onChange={(e) => setGrace(e.target.value)} className="rounded-md border bg-background px-2 min-h-8">
          <option value="24">old key works 24 h more</option>
          <option value="168">old key works 7 days more</option>
        </select>
        <button type="button" disabled={pending} onClick={() => go(grace)} className="rounded-md border px-2.5 min-h-8 hover:bg-accent disabled:opacity-60">
          {pending ? "Working…" : "Rotate"}
        </button>
        <button type="button" disabled={pending} onClick={() => go("0")} className="rounded-md border px-2.5 min-h-8 text-danger hover:bg-danger/10 disabled:opacity-60">
          Regenerate now
        </button>
      </div>
      {err && <p className="text-xs text-danger mt-1" role="alert">{err}</p>}
      {key && <KeyReveal value={key} note="The replaced key is listed below with its end date." />}
    </div>
  );
}
