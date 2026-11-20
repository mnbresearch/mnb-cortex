"use client";
import { useState } from "react";
import { FileText, Presentation, Sheet, Share2, Copy, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/*
  Deliverables and live sharing for a finished result: Word, PowerPoint, Excel
  (lib/deliverables/build.ts) and a live share link with an expiry, view count
  and revoke (lib/share.ts). Used on agent tasks and grids.
*/
export function DeliverableBar({ kind, refId, exports = true }: { kind: "agent_task" | "grid"; refId: string; exports?: boolean }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<any[]>([]);
  const [days, setDays] = useState(7);
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const base = `/api/agents/tasks/${refId}/export?format=`;

  async function load() {
    const j = await (await fetch(`/api/share?kind=${kind}&ref=${refId}`)).json();
    setLinks(j.links || []); if (j.ready === false) setErr("Share links need their table: run supabase/RUN-2026-11-20-shared-pages.sql.");
  }
  async function create() {
    setBusy(true); setErr(null);
    try {
      const j = await (await fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ref_id: refId, days }) })).json();
      if (!j.ok) setErr(j.error || "Could not create the link."); else { setMade(j.url); load(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {exports && kind === "agent_task" && <>
        <a href={`${base}docx`} className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 text-xs hover:bg-accent"><FileText className="h-3.5 w-3.5" /> Word</a>
        <a href={`${base}pptx`} className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 text-xs hover:bg-accent"><Presentation className="h-3.5 w-3.5" /> PowerPoint</a>
        <a href={`${base}xlsx`} className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 text-xs hover:bg-accent"><Sheet className="h-3.5 w-3.5" /> Excel</a>
      </>}
      <Button size="sm" variant="outline" onClick={() => { setOpen(true); setMade(null); load(); }}><Share2 className="h-3.5 w-3.5" /> Share live link</Button>
      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border bg-card p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center"><p className="flex-1 font-semibold">Share a live, read-only link</p><button aria-label="Close" onClick={() => setOpen(false)} className="-m-3 min-h-11 min-w-11 grid place-items-center"><X className="h-4 w-4" /></button></div>
            <p className="text-sm text-muted-foreground">Anyone with the link sees the current version until it expires or you revoke it. Views are counted. Only people you send it to can find it — it is not indexed.</p>
            <div className="flex items-center gap-2">
              <label className="text-sm">Expires after</label>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-sm">{[1, 7, 30, 90].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</select>
              <Button size="sm" onClick={create} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Create link</Button>
            </div>
            {made && (
              <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
                <input readOnly value={made} className="flex-1 bg-transparent text-xs" onFocus={(e) => e.target.select()} />
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(made); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>
              </div>
            )}
            {made && <p className="text-[11px] text-muted-foreground">Copy it now — for security Cortex keeps only a fingerprint of the link and cannot show it again.</p>}
            {err && <p className="text-xs text-warning">{err}</p>}
            {links.length > 0 && (
              <ul className="divide-y border rounded-md text-xs">
                {links.map((l) => {
                  const live = !l.revoked_at && new Date(l.expires_at).getTime() > Date.now();
                  return (
                    <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1">Created {String(l.created_at).slice(0, 10)} · {l.views} view{l.views === 1 ? "" : "s"} · {l.revoked_at ? "revoked" : live ? `expires ${String(l.expires_at).slice(0, 10)}` : "expired"}</span>
                      {live && <Button size="sm" variant="ghost" onClick={async () => { await fetch("/api/share", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: l.id }) }); load(); }}>Revoke</Button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
