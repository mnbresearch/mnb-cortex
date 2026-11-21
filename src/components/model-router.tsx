"use client";
import { useEffect, useState } from "react";
import { Loader2, Route } from "lucide-react";

/*
  Model Router — choose which AI providers serve this workspace, in what order.
  Never locked to one lab: every mode falls through to the next available
  provider. Each agent step shows which provider answered it.
*/
export function ModelRouterSettings() {
  const [d, setD] = useState<any>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { fetch("/api/model-routing").then((r) => r.json()).then(setD).catch(() => setD({ ok: false })); }, []);
  if (!d) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  if (!d.ok) return <p className="text-sm text-muted-foreground">Could not load model routing.</p>;

  async function pick(mode: string) {
    setSaving(mode); setMsg(null);
    try {
      const j = await (await fetch("/api/model-routing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) })).json();
      if (j.ok) { setD({ ...d, mode }); setMsg("Saved. New requests use this order."); } else setMsg(j.error);
    } finally { setSaving(null); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground flex items-start gap-2"><Route className="h-4 w-4 mt-0.5 shrink-0" />Cortex is never locked to one AI lab. Choose the order providers are tried in; if one is busy or down, the next answers. Each agent step shows which one answered it.</p>
      {!d.ready && <p className="text-xs text-warning">Model routing needs its column: run <code>supabase/RUN-2026-11-20-model-router.sql</code>.</p>}
      <div role="radiogroup" aria-label="Model routing" className="grid md:grid-cols-3 gap-3">
        {d.modes.map((m: any) => (
          <button key={m.id} role="radio" aria-checked={d.mode === m.id} disabled={!d.canEdit || !!saving} onClick={() => pick(m.id)}
            className={`text-left rounded-xl border p-4 transition-colors ${d.mode === m.id ? "border-primary bg-primary/5" : "hover:bg-accent/40"} disabled:opacity-70`}>
            <div className="font-medium text-sm flex items-center gap-2">{saving === m.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{m.name}</div>
            <p className="mt-1 text-xs text-muted-foreground leading-5">{m.d}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">{m.order.map((p: any) => p.label).join(" → ")}</p>
          </button>
        ))}
      </div>
      {!d.canEdit && <p className="text-xs text-muted-foreground">Only workspace admins can change this.</p>}
      {msg && <p className="text-xs" role="status">{msg}</p>}
    </div>
  );
}
