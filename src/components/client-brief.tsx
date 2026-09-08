"use client";
import { useState } from "react";
import { FileText, Loader2, Check, Copy, Printer, X } from "lucide-react";

/*
  THE BUTTON THAT TURNS THE CONSOLE INTO A DELIVERABLE.

  Practice already tells the firm which client needs attention. This is the step
  after: a letter about that client, in the firm's own name, that a partner can
  read, adjust and send. Without it, acting on the console means retyping the
  numbers into a Word document twenty-five times a month — which means it does
  not happen, and the console becomes something looked at once.

  It is EDITABLE before it is copied, on purpose. A CA who cannot change the
  wording will not put their name on it, and the one who can will send it every
  week. The textarea is the feature, not a fallback.

  No Cortex branding anywhere in the output. See lib/practice-brief.ts.
*/

type Brief = {
  clientName: string;
  firmName: string;
  periodLabel: string;
  text: string;
  html: string;
  quiet: boolean;
};

export function ClientBrief({ orgId, clientName }: { orgId: string; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  async function load() {
    setOpen(true);
    if (brief) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/practice/brief?org=${encodeURIComponent(orgId)}`);
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) { setErr(j?.error || "Could not build that brief."); return; }
      setBrief(j.brief); setDraft(j.brief.text);
    } catch {
      setErr("Could not reach the server. Try again in a moment.");
    } finally { setBusy(false); }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard blocked (insecure context, or the browser refused). Select
         the text so a manual copy still works rather than failing silently. */
      const el = document.getElementById("brief-draft") as HTMLTextAreaElement | null;
      el?.select();
    }
  }

  function print() {
    if (!brief) return;
    /*
      Printed from a fresh document rather than the app page, so the sidebar,
      the topbar and the workspace chrome do not end up on a letter going to a
      client. `draft` is used rather than brief.html so the partner's edits
      survive into the printed copy — escaped, because it is user text going
      into a document.
    */
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>${esc(brief.clientName)} — position review</title>` +
      `<style>body{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#111;` +
      `line-height:1.65;max-width:680px;margin:40px auto;padding:0 24px;white-space:pre-wrap}` +
      `@media print{body{margin:0}}</style></head><body>${esc(draft)}` +
      `<script>window.onload=()=>window.print()</script></body></html>`,
    );
    w.document.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={load}
        className="inline-flex items-center gap-1.5 rounded-full border h-8 px-3 text-xs font-medium hover:bg-accent transition-colors"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Client brief
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
          role="dialog" aria-modal="true" aria-label={`Client brief for ${clientName}`}>
          <div className="w-full max-w-2xl rounded-2xl border bg-card p-5 shadow-2xl max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{clientName} — client brief</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Written in your firm&rsquo;s name. Edit anything you disagree with before you send it.
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close"
                className="text-muted-foreground hover:text-foreground rounded-md min-h-11 min-w-11 inline-flex items-center justify-center">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {busy && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" aria-hidden="true" />
                Reading this client&rsquo;s position…
              </div>
            )}

            {err && <p role="alert" className="mt-4 text-sm text-danger">{err}</p>}

            {brief && !busy && (
              <>
                {brief.quiet && (
                  <p className="mt-3 rounded-lg border border-success/25 bg-success/5 p-3 text-xs">
                    Nothing needed attention for this client this week. The brief says so plainly rather than
                    manufacturing a concern — a firm that sends twenty-five worried letters teaches its clients
                    not to read them.
                  </p>
                )}
                <label className="block mt-4">
                  <span className="sr-only">Brief text, editable</span>
                  <textarea
                    id="brief-draft"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={18}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={copy} className="inline-flex items-center gap-2 rounded-full btn-ink h-10 px-4 text-sm font-medium">
                    {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    {copied ? "Copied" : "Copy for email"}
                  </button>
                  <button onClick={print} className="inline-flex items-center gap-2 rounded-full border h-10 px-4 text-sm font-medium hover:bg-accent transition-colors">
                    <Printer className="h-4 w-4" aria-hidden="true" /> Print / PDF
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Cortex is not named anywhere in this document. It goes out as {brief.firmName}&rsquo;s work, because it is.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
