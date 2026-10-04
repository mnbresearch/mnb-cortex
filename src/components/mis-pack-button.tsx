"use client";
import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";

/*
  Downloads the MIS pack through /api/export/mis-pack. The route may refuse
  (owner's export rule set to approve/blocked); that refusal is shown as a
  sentence rather than a silent nothing.
*/
export function MisPackButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function go() {
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/export/mis-pack");
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setNote(j.error || `Could not build the pack (server answered ${r.status}).`);
        return;
      }
      const blob = await r.blob();
      const name = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "mis-pack.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setNote(`Downloaded ${name}. Recorded in Approvals history.`);
    } catch (e: any) { setNote(`Could not download: ${e?.message || "network error"}.`); }
    finally { setBusy(false); }
  }

  return (
    <div className={compact ? "inline-flex flex-col items-start gap-1" : "rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3"}>
      {!compact && (
        <div>
          <div className="text-sm font-medium">Monthly MIS pack (.xlsx)</div>
          <div className="text-xs text-muted-foreground">KPI overview · 24-month trend with margin formulas · receivables ageing · payables · top customers · collections. From your records, nothing modelled.</div>
        </div>
      )}
      <button type="button" onClick={go} disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border bg-card h-9 px-3 text-sm font-medium hover:bg-accent disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
        {busy ? "Building…" : "Download MIS pack"}
      </button>
      {note && <p className="text-xs text-muted-foreground w-full" role="status">{note}</p>}
    </div>
  );
}
