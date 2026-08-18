"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { INDUSTRIES } from "@/lib/agents/catalog";
import { Loader2, Sparkles } from "lucide-react";

// First-run: ask a new workspace what it does, then tailor the whole app to it.
export function IndustryPrompt() {
  const [busy, setBusy] = useState("");
  const [hidden, setHidden] = useState(false);
  const [err, setErr] = useState("");
  if (hidden) return null;

  async function pick(id: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/workspace/industry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ industry: id }) });
      const j = await r.json();
      if (j.ok) { location.reload(); return; }
      // The route can legitimately refuse (only admins/owners may set this).
      // Discarding j.error left a button that just quietly did nothing.
      setErr(j.error || "Could not save that. Please try again.");
    } catch { setErr("Network error. Please try again."); }
    setBusy("");
  }

  return (
    <Card className="p-5 border-primary/30 bg-primary/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg brand-gradient grid place-items-center text-white"><Sparkles className="h-4 w-4" /></span>
          <div>
            <div className="font-semibold leading-tight">What does your business do?</div>
            <div className="text-xs text-muted-foreground">Pick your industry — Cortex tailors your dashboard, tools and agents to you.</div>
          </div>
        </div>
        <button onClick={() => setHidden(true)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Skip</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {INDUSTRIES.filter((i) => i.id !== "generic").map((i) => (
          <button key={i.id} onClick={() => pick(i.id)} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 h-9 text-sm hover:bg-accent hover:border-primary/40 transition-colors disabled:opacity-50">
            {busy === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span>{i.emoji}</span>} {i.name}
          </button>
        ))}
      </div>
      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
    </Card>
  );
}
