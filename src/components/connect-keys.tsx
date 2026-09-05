"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2, Trash2, Info } from "lucide-react";

type F = { key: string; label: string; placeholder?: string; help?: string };

/**
 * The bring-your-own-AI-key form.
 *
 * Three things this deliberately does that the generic integrations form does
 * not, because this is the one credential form an enterprise buyer will look at
 * closely:
 *
 *   It never shows a stored key back, not even masked. Once saved, the field
 *   goes empty and the card says "connected". A masked value is a value that
 *   was sent to a browser, and there is no reason to send it: nobody needs to
 *   READ their own API key out of our UI, they need to know whether it works.
 *
 *   Testing makes a real model call, and the result is per-provider. "Connected"
 *   with no evidence is how people discover three days later that they pasted
 *   half a key.
 *
 *   Removing is one click and says plainly what happens next — Cortex falls
 *   back to its own key and credit metering resumes. A customer should never
 *   have to guess whether disconnecting breaks their AI.
 */
export function ConnectKeys({
  fields, connected, canManage, encryption,
}: { fields: F[]; connected: boolean; canManage: boolean; encryption: boolean }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "test" | "remove">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isConnected, setConnected] = useState(connected);

  const anyEntered = Object.values(vals).some((v) => v.trim().length > 0);

  async function post(op: string, credentials?: Record<string, string>) {
    const r = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, id: "ai", credentials }),
    });
    return r.json().catch(() => ({ ok: false, error: "The server did not respond." }));
  }

  async function save() {
    setBusy("save"); setMsg(null);
    try {
      const j = await post("connect", vals);
      if (j.ok) {
        setConnected(true);
        setVals({});   // never keep a key in component state after it is stored
        setMsg({ ok: true, text: j.message || "Saved and verified. Cortex is now running on your key." });
      } else {
        setMsg({ ok: false, text: j.error || j.message || "Could not save." });
      }
    } finally { setBusy(""); }
  }

  async function test() {
    setBusy("test"); setMsg(null);
    try {
      const j = await post("test");
      setMsg({ ok: Boolean(j.ok), text: j.message || j.error || "No response." });
    } finally { setBusy(""); }
  }

  async function remove() {
    setBusy("remove"); setMsg(null);
    try {
      const j = await post("disconnect");
      if (j.ok) {
        setConnected(false); setVals({});
        setMsg({ ok: true, text: "Removed. Cortex is back on its own key, and AI credits apply again." });
      } else setMsg({ ok: false, text: j.error || "Could not remove." });
    } finally { setBusy(""); }
  }

  const input = "rounded-lg border bg-background px-3 h-10 text-sm w-full outline-none focus:ring-2 focus:ring-ring";

  return (
    <Card className="p-5 space-y-4">
      {isConnected && (
        <div className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
          <div className="leading-6">
            <span className="font-medium">Running on your own key.</span>{" "}
            <span className="text-muted-foreground">
              AI credits are not being charged. Paste a new value below to replace a key, or remove it
              to go back to the Cortex key.
            </span>
          </div>
        </div>
      )}

      {!canManage && (
        <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Only an admin or owner can change these. You can see the status, not the keys.</span>
        </div>
      )}

      <fieldset disabled={!canManage || !encryption} className="space-y-4 disabled:opacity-60">
        <legend className="sr-only">AI provider API keys</legend>
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`ai-${f.key}`} className="text-sm font-medium block mb-1">{f.label}</label>
            <input
              id={`ai-${f.key}`}
              className={input}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={isConnected ? "•••••••• (saved — type to replace)" : f.placeholder}
              value={vals[f.key] ?? ""}
              onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
              aria-describedby={f.help ? `ai-${f.key}-help` : undefined}
            />
            {f.help && (
              <p id={`ai-${f.key}-help`} className="text-xs text-muted-foreground mt-1 leading-5">{f.help}</p>
            )}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={!anyEntered || busy !== ""}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 text-sm font-medium disabled:opacity-40">
            {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
            {isConnected ? "Save changes" : "Connect"}
          </button>
          {isConnected && (
            <>
              <button type="button" onClick={test} disabled={busy !== ""}
                className="inline-flex items-center gap-2 rounded-lg border h-10 px-4 text-sm font-medium hover:bg-accent disabled:opacity-40">
                {busy === "test" && <Loader2 className="h-4 w-4 animate-spin" />}
                Test each key
              </button>
              <button type="button" onClick={remove} disabled={busy !== ""}
                className="inline-flex items-center gap-2 rounded-lg border border-danger/30 text-danger h-10 px-4 text-sm font-medium hover:bg-danger/5 disabled:opacity-40">
                {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remove
              </button>
            </>
          )}
        </div>
      </fieldset>

      {/*
        role="status" so a screen reader announces the result without the user
        having to go looking for it — this is the whole feedback for an action
        whose success is otherwise invisible.
      */}
      {msg && (
        <div role="status" aria-live="polite"
          className={`text-sm leading-6 ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
        </div>
      )}
    </Card>
  );
}
