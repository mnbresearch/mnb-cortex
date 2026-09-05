"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { deleteWorkspace, exportWorkspaceJson } from "@/lib/actions";
import { AlertTriangle, Download } from "lucide-react";

/**
 * The delete-workspace control.
 *
 * Shown only to the owner. Everything here is designed around the fact that
 * this is the one action in the product with no undo — so the UI's job is to
 * slow the user down exactly enough, and to make sure that if they do go
 * through with it, they leave holding their data.
 *
 * Three deliberate choices:
 *
 *   The export button comes FIRST and is the visually prominent one. Someone
 *   arriving here angry at 11pm should trip over "download everything" before
 *   they reach the destructive control.
 *
 *   The confirm field wants the workspace NAME, not the word "DELETE". A fixed
 *   word is typed by reflex; a name has to be read off the screen, which is the
 *   half-second where people reconsider.
 *
 *   The button stays disabled until the name matches, so the failure is
 *   visible before the click rather than as an error after it.
 */
export function DeleteWorkspace({ orgName }: { orgName: string }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"" | "export" | "delete">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [exported, setExported] = useState(false);

  const matches = confirm.trim() === orgName.trim();

  async function onExport() {
    setBusy("export"); setMsg(null);
    try {
      const r = await exportWorkspaceJson();
      if (!r.ok || !r.json) { setMsg({ ok: false, text: r.error || "Could not build the export." }); return; }
      const blob = new Blob([r.json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${orgName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-cortex-export.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExported(true);
      setMsg({ ok: true, text: "Downloaded. Keep it somewhere safe — this is the only copy after deletion." });
    } finally { setBusy(""); }
  }

  async function onDelete() {
    if (!matches) return;
    setBusy("delete"); setMsg(null);
    try {
      const fd = new FormData();
      fd.set("confirm", confirm);
      const r = await deleteWorkspace(fd);
      if (!r.ok) { setMsg({ ok: false, text: r.error || "Could not delete the workspace." }); return; }
      /* Hard navigation, not a router push: every cached server component on
         this session belongs to a workspace that no longer exists. */
      window.location.href = "/login?deleted=1";
    } finally { setBusy(""); }
  }

  return (
    <Card className="p-5 border-danger/30 bg-danger/5 space-y-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
        <div>
          <div className="font-medium text-sm">Delete this workspace</div>
          <p className="text-sm text-muted-foreground mt-1 leading-6 max-w-2xl">
            Permanently removes every invoice, order, customer, document, alert, memory, API key and
            connected credential in <strong>{orgName}</strong>, and revokes access for everyone on the
            team. This cannot be undone and we cannot recover it for you.
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-6 max-w-2xl">
            Completed payment records are kept and anonymised rather than deleted — they are tax
            records, and Indian law requires both of us to retain them.
          </p>
        </div>
      </div>

      <div>
        <button type="button" onClick={onExport} disabled={busy !== ""}
          className="inline-flex items-center gap-2 rounded-lg border bg-background h-9 px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">
          <Download className="h-4 w-4" />
          {busy === "export" ? "Preparing…" : "Download everything first"}
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-sm block">
          <span className="text-muted-foreground block mb-1">
            Type <strong className="text-foreground">{orgName}</strong> to confirm
          </span>
          <input
            className="rounded-lg border bg-background px-3 h-9 text-sm w-full max-w-sm outline-none focus:ring-2 focus:ring-ring"
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder={orgName} autoComplete="off" spellCheck={false} />
        </label>
        {!exported && matches && (
          <p className="text-xs text-warning">
            You have not downloaded an export. Once this is gone, it is gone.
          </p>
        )}
        <button type="button" onClick={onDelete} disabled={!matches || busy !== ""}
          className="rounded-lg bg-danger text-white h-9 px-4 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
          {busy === "delete" ? "Deleting…" : "Delete this workspace permanently"}
        </button>
      </div>

      {msg && (
        <div className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>
      )}
    </Card>
  );
}
