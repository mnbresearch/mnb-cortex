"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Check, X, Sparkles, AlertCircle, Ban } from "lucide-react";
import {
  prepareCollectionDrafts, approveMessage, cancelMessage, sendApprovedNow, excludeFromCollections,
} from "@/lib/actions";

const rupee = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

type Candidate = {
  invoiceId: string; invoiceNo: string | null; party: string; amount: number;
  daysPastDue: number; attempts: number; blockedBy: string | null;
  contact: { email: string | null; phone: string | null };
};

/**
 * What is about to be said, to whom, before it is said.
 *
 * The whole design intent is that an owner can see the ACTUAL TEXT of every
 * message before approving it. A summary ("3 reminders ready") would be easier
 * to build and would defeat the point: nobody delegates writing to their own
 * customers on the strength of a count.
 *
 * Blocked invoices are shown WITH their reason, not hidden. A short list with
 * no explanation reads as a broken feature; "no email on file for Patel & Co"
 * reads as something the owner can fix in a minute.
 */
export function CollectionsConsole({
  policy, candidates, blocked, pending,
}: {
  policy: { enabled: boolean; autoSend: boolean; maxPerDay: number };
  candidates: Candidate[];
  blocked: Candidate[];
  pending: any[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const drafts = pending.filter((m) => m.status === "draft");
  const approved = pending.filter((m) => m.status === "approved");
  const failed = pending.filter((m) => m.status === "failed");

  /*
    Called via onClick rather than <form action={...}>.

    A server action used as a form action must return void, so the form path
    would silently discard the { ok, error } these actions return — and a
    failed approval would look exactly like a successful one. Calling them
    directly keeps the result, which is the difference between "discarded" and
    "we thought it was discarded".
  */
  async function rowAction(key: string, fd: FormData, fn: (fd: FormData) => Promise<any>) {
    setBusy(key); setMsg(null);
    try {
      const r = await fn(fd);
      if (r?.ok === false) setMsg({ ok: false, text: r.error || "That didn't work." });
      else router.refresh();
    } catch { setMsg({ ok: false, text: "Could not reach the server." }); }
    finally { setBusy(null); }
  }

  const fdOf = (o: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(o)) fd.set(k, v);
    return fd;
  };

  async function run(key: string, fn: () => Promise<any>, describe: (r: any) => string) {
    setBusy(key); setMsg(null);
    try {
      const r = await fn();
      setMsg(r?.ok === false
        ? { ok: false, text: r.error || "That didn't work." }
        : { ok: true, text: describe(r) });
    } catch { setMsg({ ok: false, text: "Could not reach the server." }); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => run("prep", prepareCollectionDrafts, (r) => {
            const reasons = Object.entries(r.reasons || {}).map(([k, v]) => `${v} × ${k}`).join("; ");
            return `Drafted ${r.drafted}.${r.skipped ? ` Skipped ${r.skipped}${reasons ? ` — ${reasons}` : ""}.` : ""}`;
          })}
          disabled={busy !== null || !policy.enabled}
        >
          {busy === "prep" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Draft reminders
        </Button>

        <Button
          variant="outline"
          onClick={() => run("send", sendApprovedNow, (r) =>
            r.note ? r.note : `Sent ${r.sent}${r.failed ? `, ${r.failed} failed` : ""}.`)}
          disabled={busy !== null || approved.length === 0}
        >
          {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send {approved.length ? `${approved.length} approved` : "approved"}
        </Button>

        <div className="text-xs text-muted-foreground ml-auto">
          {policy.autoSend
            ? `Auto-send is ON — drafts are approved automatically, up to ${policy.maxPerDay}/day.`
            : "You approve every message before it sends."}
        </div>
      </Card>

      {msg && (
        <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${msg.ok ? "bg-success/10 text-success border-success/20" : "bg-danger/10 text-danger border-danger/20"}`}>
          {msg.ok ? <Check className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {failed.length > 0 && (
        <Card className="p-4 border-danger/30 bg-danger/5">
          <div className="text-sm font-medium text-danger">{failed.length} reminder{failed.length === 1 ? "" : "s"} could not be sent</div>
          <div className="mt-1 space-y-1">
            {failed.slice(0, 5).map((m) => (
              <div key={m.id} className="text-xs text-muted-foreground">{m.recipient} — {m.error}</div>
            ))}
          </div>
        </Card>
      )}

      {(drafts.length > 0 || approved.length > 0) && (
        <div className="space-y-2">
          <div className="text-sm font-medium">
            {drafts.length > 0 ? `${drafts.length} waiting for your approval` : `${approved.length} approved, ready to send`}
          </div>
          {[...drafts, ...approved].slice(0, 20).map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded border px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{m.channel}</span>
                    <span className="font-medium truncate">{m.recipient}</span>
                    <span className="text-xs text-muted-foreground">attempt {m.attempt}</span>
                    {m.status === "approved" && (
                      <span className="text-[11px] rounded-full border border-success/20 bg-success/10 text-success px-2 py-0.5">approved</span>
                    )}
                  </div>
                  {m.subject && <div className="text-sm font-medium mt-1.5">{m.subject}</div>}
                  {/* The full text. Not a preview — the owner is signing this. */}
                  <pre className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap font-sans leading-6">{m.body}</pre>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {m.status === "draft" && (
                    <Button size="sm" disabled={busy !== null}
                      onClick={() => rowAction(`ok-${m.id}`, fdOf({ id: m.id }), approveMessage)}>
                      {busy === `ok-${m.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy !== null}
                    onClick={() => rowAction(`no-${m.id}`, fdOf({ id: m.id }), cancelMessage)}>
                    {busy === `no-${m.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Discard
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Overdue and chaseable ({candidates.length})</div>
          <div className="divide-y">
            {candidates.map((c) => (
              <div key={c.invoiceId} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{c.party}</span>
                  <span className="text-muted-foreground"> · {c.invoiceNo || "no number"} · {c.daysPastDue}d overdue</span>
                  {c.attempts > 0 && <span className="text-xs text-muted-foreground"> · {c.attempts} sent</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="tabular-nums">{rupee(c.amount)}</span>
                  <button
                    title="Never chase this one"
                    disabled={busy !== null}
                    onClick={() => rowAction(`ex-${c.invoiceId}`,
                      fdOf({ invoice_id: c.invoiceId, party: c.party, amount: String(c.amount) }),
                      excludeFromCollections)}
                    className="text-muted-foreground hover:text-danger transition-colors disabled:opacity-40">
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {blocked.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Not being chased ({blocked.length})</div>
          {/*
            Shown with reasons rather than hidden. "No email on file" is
            something the owner can fix in a minute; a silently short list just
            looks like the feature is broken.
          */}
          <div className="divide-y">
            {blocked.map((c) => (
              <div key={c.invoiceId} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <span>{c.party}</span>
                  <span className="text-muted-foreground"> · {rupee(c.amount)}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{c.blockedBy}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {candidates.length === 0 && blocked.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          Nothing is overdue right now. When an invoice passes its due date, it appears here and Cortex offers to chase it.
        </Card>
      )}
    </div>
  );
}
