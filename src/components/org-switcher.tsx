"use client";
import { useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

export function OrgSwitcher({ orgs, activeId }: { orgs: { id: string; name: string }[]; activeId: string | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (orgs.length < 2) return null; // only useful with multiple workspaces

  const active = orgs.find((o) => o.id === activeId) || orgs[0];

  async function pick(id: string) {
    if (id === activeId) { setOpen(false); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/org/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org_id: id }) });
      const j = await r.json();
      if (j.ok) location.reload(); else { alert(j.error || "Could not switch"); setBusy(false); }
    } catch { setBusy(false); }
  }

  return (
    <div className="px-3 pt-3 relative">
      <button onClick={() => setOpen((v) => !v)} disabled={busy}
        className="w-full flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-sm hover:bg-accent transition-colors">
        <span className="flex items-center gap-2 min-w-0">
          <span className="h-5 w-5 shrink-0 rounded brand-gradient grid place-items-center text-white text-[10px] font-bold">
            {active?.name?.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate font-medium">{active?.name}</span>
        </span>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="absolute left-3 right-3 mt-1 z-50 rounded-lg border bg-card shadow-lg overflow-hidden">
          {orgs.map((o) => (
            <button key={o.id} onClick={() => pick(o.id)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-sm hover:bg-accent transition-colors text-left">
              <span className="truncate">{o.name}</span>
              {o.id === activeId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
