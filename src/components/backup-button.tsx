"use client";
import { useState } from "react";
import { Download } from "lucide-react";
export function BackupButton() {
  const [busy, setBusy] = useState(false);
  async function backup() {
    setBusy(true);
    try { const r = await fetch("/api/export");
      if (!r.ok) {
        // Show the server's own reason (e.g. "Export failed — nothing was exported. …"); "sign in" only for a 401.
        const j = await r.json().catch(() => null as any);
        alert(r.status === 401 ? "Sign in to export." : (j?.error || `Export failed (HTTP ${r.status}). Nothing was downloaded.`));
        return;
      }
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "mnb-cortex-backup.json"; a.click(); URL.revokeObjectURL(url);
    } catch { alert("Export failed."); } finally { setBusy(false); }
  }
  return <button onClick={backup} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border h-9 px-4 text-sm hover:bg-accent"><Download className="h-4 w-4" /> {busy ? "Exporting…" : "Export workspace (JSON)"}</button>;
}
