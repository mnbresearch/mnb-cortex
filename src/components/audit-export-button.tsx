"use client";
import { useState } from "react";
import { Download } from "lucide-react";

/*
  Settings → Security → "Download audit log". Fetches the CSV so a failure can
  be shown on the page with the server's own reason, instead of the browser
  navigating to a JSON error.
*/
export function AuditExportButton() {
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function download() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/workspace/audit-export?days=${encodeURIComponent(days)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => null as any);
        setMsg({ ok: false, text: j?.error || `Download failed (HTTP ${r.status}). Nothing was downloaded.` });
        return;
      }
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "cortex-audit.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
      const rows = r.headers.get("X-Audit-Rows") || "0";
      const absent = (r.headers.get("X-Audit-Absent") || "").split(",").filter(Boolean);
      const cut = r.headers.get("X-Audit-Truncated") === "1";
      setMsg({
        ok: true,
        text: `Downloaded ${rows} rows.` + (cut ? " One source hit the 10,000-row limit — choose a shorter period for the rest." : "")
          + (absent.length ? ` Not yet set up on this workspace: ${absent.join(", ")}.` : ""),
      });
    } catch {
      setMsg({ ok: false, text: "Download failed — check your connection and try again." });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="audit_days" className="text-sm">Period</label>
        <select id="audit_days" value={days} onChange={(e) => setDays(e.target.value)} className="rounded-lg border bg-background h-9 px-3 text-sm">
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="180">Last 180 days</option>
          <option value="365">Last 12 months</option>
        </select>
        <button type="button" onClick={download} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border h-9 px-4 text-sm hover:bg-accent disabled:opacity-60">
          <Download className="h-4 w-4" aria-hidden="true" /> {busy ? "Preparing…" : "Download audit log (CSV)"}
        </button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-muted-foreground" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
