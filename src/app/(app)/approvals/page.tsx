import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { SafeForm } from "@/components/safe-form";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/forms";
import { getApprovals, getUserAndOrg } from "@/lib/data";
import { updateStatus } from "@/lib/actions";
import { inr } from "@/lib/utils";
import { Check, ShieldCheck, X, Undo2, Bot, User, Workflow, Clock, Download, Settings2 } from "lucide-react";
import { CATALOGUE_BY_KEY } from "@/lib/engine/catalogue";
import { listProposals, autonomySuggestions, type Proposal } from "@/lib/engine/ledger";
import { approveProposal, rejectProposal, undoProposal, acceptAutonomy } from "@/lib/engine/server-actions";
import { hasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/*
  /approvals IS NOW THE FRONT DOOR OF THE ACTION ENGINE.

  Before: it listed drafted purchase orders and pending invoices, and
  "Approve & send" flipped a status column — a label with nothing behind it,
  which an earlier audit of this product called out by name.

  Now the top of the page is the proposal queue: everything Cortex wants to do
  and is waiting to be told yes or no. Each card says, in plain words, WHAT
  will happen, WHY Cortex thinks so (its rationale and the evidence it looked
  at), WHERE the proposal came from (chat, a scheduled workflow, autopilot, a
  person), whether it can be UNDONE, and what the owner's own rule said about
  it. Approve runs it through the deterministic executor; the result replaces
  the card. Below the queue is the history, with Undo where undo is real.

  The old PO/invoice sections are kept underneath, unchanged — they are a
  different, older mechanism and removing them would break a working flow
  for the sake of tidiness.
*/

function StatusButton({ table, id, status, label }: { table: string; id: string; status: string; label: string }) {
  return (
    <SafeForm action={updateStatus}>
      <input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} /><input type="hidden" name="path" value="/approvals" />
      <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-8 px-3 text-xs font-medium hover:opacity-90"><Check className="h-3.5 w-3.5" /> {label}</button>
    </SafeForm>
  );
}

const SOURCE_ICON: Record<string, React.ReactNode> = {
  chat: <Bot className="h-3.5 w-3.5" aria-hidden="true" />,
  autopilot: <Clock className="h-3.5 w-3.5" aria-hidden="true" />,
  workflow: <Workflow className="h-3.5 w-3.5" aria-hidden="true" />,
  user: <User className="h-3.5 w-3.5" aria-hidden="true" />,
  api: <Workflow className="h-3.5 w-3.5" aria-hidden="true" />,
};
const SOURCE_LABEL: Record<string, string> = {
  chat: "Cortex suggested this in chat", autopilot: "Autopilot, overnight", workflow: "A scheduled workflow", user: "Asked for by a teammate", api: "Via the API",
};
const EFFECT_LABEL: Record<string, string> = {
  internal_write: "Changes data in this workspace", outbound: "Sends a message to a third party", money: "Affects money owed", export: "Produces a file for you",
};

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ProposalCard({ p, canDecide }: { p: Proposal; canDecide: boolean }) {
  const def = CATALOGUE_BY_KEY[p.action];
  const what = def ? safeDescribe(def.describe, p.args) : p.action;
  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm">{def?.title ?? p.action}</div>
          <div className="text-sm mt-0.5">{what}</div>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground flex items-center gap-1.5" title={SOURCE_LABEL[p.source]}>
          {SOURCE_ICON[p.source]} <span>{SOURCE_LABEL[p.source]}</span>
        </div>
      </div>

      {p.rationale && <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Why: </span>{p.rationale}</p>}

      {Array.isArray(p.evidence) && p.evidence.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">What Cortex looked at ({p.evidence.length})</summary>
          <ul className="mt-1 space-y-0.5 list-disc pl-5">
            {p.evidence.slice(0, 10).map((e, i) => <li key={i} className="break-words">{typeof e === "string" ? e : JSON.stringify(e)}</li>)}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {def && <span>{EFFECT_LABEL[def.effect]}</span>}
        {def && <span>{def.reversible ? "Can be undone" : "Cannot be undone"}</span>}
        {p.policy_reason && <span className="italic">{p.policy_reason}</span>}
        <span>{when(p.created_at)}</span>
      </div>

      {canDecide ? (
        <div className="flex items-center gap-2">
          <SafeForm action={approveProposal} successMessage="Done.">
            <input type="hidden" name="id" value={p.id} /><input type="hidden" name="action" value={p.action} />
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-8 px-3 text-xs font-medium hover:opacity-90">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Approve &amp; run
            </button>
          </SafeForm>
          <SafeForm action={rejectProposal}>
            <input type="hidden" name="id" value={p.id} /><input type="hidden" name="action" value={p.action} />
            <button className="inline-flex items-center gap-1.5 rounded-lg border h-8 px-3 text-xs font-medium hover:bg-accent">
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Reject
            </button>
          </SafeForm>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Needs a {def?.minRank ?? "manager"} or higher to decide.</p>
      )}
    </div>
  );
}

function HistoryRow({ p, canUndo }: { p: Proposal; canUndo: boolean }) {
  const def = CATALOGUE_BY_KEY[p.action];
  const summary = (p.result as any)?.summary as string | undefined;
  const tone =
    p.status === "done" ? "text-success" :
    p.status === "failed" || p.status === "blocked" ? "text-destructive" :
    "text-muted-foreground";
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{def?.title ?? p.action}</span>
          <span className={`text-xs uppercase tracking-wide ${tone}`}>{p.status}</span>
          <span className="text-xs text-muted-foreground">{when(p.executed_at || p.decided_at || p.created_at)}</span>
        </div>
        <div className="text-muted-foreground mt-0.5 break-words">
          {summary || p.error || (def ? safeDescribe(def.describe, p.args) : "")}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {p.status === "done" && p.action === "export_xlsx" && (
          <a href={`/api/actions/${p.id}/file`} className="inline-flex items-center gap-1.5 rounded-lg border h-8 px-3 text-xs font-medium hover:bg-accent">
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
          </a>
        )}
        {p.status === "done" && p.undo && canUndo && (
          <SafeForm action={undoProposal} successMessage="Reversed.">
            <input type="hidden" name="id" value={p.id} /><input type="hidden" name="action" value={p.action} />
            <button className="inline-flex items-center gap-1.5 rounded-lg border h-8 px-3 text-xs font-medium hover:bg-accent">
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Undo
            </button>
          </SafeForm>
        )}
      </div>
    </div>
  );
}

/* describe() is catalogue code, but args came from a model or a form; never let a bad arg take the page down. */
function safeDescribe(fn: (a: Record<string, unknown>) => string, args: Record<string, unknown>): string {
  try { return fn(args || {}); } catch { return "(details unavailable)"; }
}

export default async function Approvals() {
  const [{ pos, invoices, live }, { orgId }] = await Promise.all([getApprovals(), getUserAndOrg()]);
  const [queue, history, isManager, isAdmin] = orgId
    ? await Promise.all([
        listProposals(orgId, { status: ["proposed"], limit: 50 }),
        listProposals(orgId, { status: ["done", "failed", "rejected", "undone", "blocked", "expired"], limit: 40 }),
        hasRole("manager"),
        hasRole("admin"),
      ])
    : [[], [], false, false];
  /* Earned autonomy: offered to admins only, since only they can grant it. */
  const suggestions = orgId && isAdmin ? await autonomySuggestions(orgId).catch(() => []) : [];
  const canDecide = (p: Proposal) => {
    const def = CATALOGUE_BY_KEY[p.action];
    const need = def?.minRank ?? "manager";
    return need === "admin" || need === "owner" ? isAdmin : isManager;
  };

  const empty = pos.length === 0 && invoices.length === 0 && queue.length === 0;

  return (
    <>
      <Topbar title="Approvals" subtitle="Cortex proposes — you decide. Nothing runs on its own until you allow it." />
      <PageShell>
        {!live && (
          <Card className="p-5 bg-warning/10 border-warning/20 text-sm">
            <a href="/login" className="text-primary underline">Sign in</a> to see what Cortex is waiting to do in your workspace.
          </Card>
        )}

        {live && (
          <Section
            title={queue.length ? `Waiting for you (${queue.length})` : "Waiting for you"}
            desc="Each one says what will happen, why, and whether it can be undone. Anything still waiting is emailed to the workspace owner once a day with a one-tap decision link."
            right={<Link href="/approvals/rules" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> Rules</Link>}
          >
            {queue.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                <ShieldCheck className="h-6 w-6 mx-auto mb-2" aria-hidden="true" />
                Nothing is waiting. Ask Cortex in chat to do something, or set a rule so it can act on its own within limits.
              </div>
            ) : (
              <div className="space-y-3">{queue.map((p) => <ProposalCard key={p.id} p={p} canDecide={canDecide(p)} />)}</div>
            )}
          </Section>
        )}

        {suggestions.length > 0 && (
          <Section title="Cortex has earned these" desc="Actions you keep approving and have never rejected or undone. Let Cortex do them on its own, within limits taken from what you approved.">
            <div className="space-y-2">
              {suggestions.map((sg) => {
                const def = CATALOGUE_BY_KEY[sg.action];
                return (
                  <Card key={sg.action} className="p-4 flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{def?.title || sg.action}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {sg.why} Limits: up to {sg.caps.max_per_day} a day{sg.caps.max_amount_inr ? `, up to ${inr(sg.caps.max_amount_inr)} each` : ""}{sg.caps.known_parties_only ? ", only parties Cortex has dealt with before" : ""}.
                        {def && !def.reversible ? " This action cannot be undone once it runs." : ""}
                      </div>
                    </div>
                    <SafeForm action={acceptAutonomy}>
                      <input type="hidden" name="action" value={sg.action} />
                      <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-9 px-3 text-sm font-medium hover:opacity-90"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Let Cortex do this</button>
                    </SafeForm>
                  </Card>
                );
              })}
            </div>
          </Section>
        )}

        {live && history.length > 0 && (
          <Section title="What Cortex has done" desc="The ledger — every action, its result, and Undo where it is possible">
            <div className="space-y-2">{history.map((p) => <HistoryRow key={p.id} p={p} canUndo={canDecide(p)} />)}</div>
          </Section>
        )}

        {live && empty && history.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Drafted purchase orders and pending invoices also appear here when there are any.
          </Card>
        )}

        {live && pos.length > 0 && (
          <Section title="AI-drafted purchase orders" desc="Approve to send to the supplier">
            <div className="space-y-2">
              {pos.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div><div className="font-medium text-sm">{p.po_no} · {p.item}</div><div className="text-xs text-muted-foreground">{p.supplier} · {p.qty} units · {inr(Number(p.amount))}</div></div>
                  <div className="flex items-center gap-2">
                    <StatusButton table="purchase_orders" id={p.id} status="sent" label="Approve & send" />
                    <DeleteButton table="purchase_orders" id={p.id} path="/approvals" />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
        {live && invoices.length > 0 && (
          <Section title="Pending invoices" desc="Mark as paid once received">
            <div className="space-y-2">
              {invoices.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div><div className="font-medium text-sm">{i.invoice_no} · {i.party}</div><div className="text-xs text-muted-foreground">{inr(Number(i.amount))} · due {String(i.due_date).slice(0,10)}</div></div>
                  <StatusButton table="invoices" id={i.id} status="paid" label="Mark paid" />
                </div>
              ))}
            </div>
          </Section>
        )}
      </PageShell>
    </>
  );
}
