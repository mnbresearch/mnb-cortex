import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { normalizeCustomerName } from "@/lib/customer-match";

/*
  THE HANDLERS — what each catalogue action actually does.

  Deterministic code, no model in the loop. Each handler receives the
  VALIDATED arguments (see catalogue.validateArgs) and the workspace id the
  server resolved from the session — never from the arguments. It returns a
  result for the ledger and, where the action can be reversed, an `undo`
  payload that `undoHandler` knows how to apply.

  Rules every handler follows:

  · Scope every query by org_id. The service role bypasses RLS, so the
    `.eq("org_id", orgId)` is the ONLY tenant boundary on this path.
  · Check the row count on writes. PostgREST reports a zero-row UPDATE as
    success with no error. A handler that does not `.select()` and count will
    report "done" for a row that did not exist — the exact defect this
    codebase has fixed ten times over.
  · Never invent. If the row is gone, say so. If the action half-worked, say
    which half.
  · Return undo only when undo is real. A false "reversible" is worse than an
    honest "cannot be undone", because the person approving relies on it.
*/

export type HandlerResult =
  | { ok: true; result: Record<string, unknown>; undo: Record<string, unknown> | null; summary: string }
  | { ok: false; error: string };

type Ctx = { orgId: string; proposalId: string; actorId: string | null };

const svcOrFail = () => {
  const svc = serviceClient();
  if (!svc) throw new Error("Service role is not configured on this server.");
  return svc;
};

/* ------------------------------------------------------------------------ */

async function updateInvoiceDueDate(args: Record<string, unknown>, ctx: Ctx): Promise<HandlerResult> {
  const svc = svcOrFail();
  const { data: before, error: readErr } = await svc.from("invoices")
    .select("id, invoice_no, due_date, party").eq("org_id", ctx.orgId).eq("id", String(args.invoice_id)).maybeSingle();
  if (readErr) return { ok: false, error: `Could not read the invoice: ${readErr.message}` };
  if (!before) return { ok: false, error: "That invoice no longer exists in this workspace." };

  const { data: rows, error } = await svc.from("invoices")
    .update({ due_date: String(args.due_date) })
    .eq("org_id", ctx.orgId).eq("id", String(args.invoice_id)).select("id");
  if (error) return { ok: false, error: `Could not update the due date: ${error.message}` };
  if (!rows || rows.length !== 1) return { ok: false, error: "The update touched no rows — the invoice may have been deleted." };

  return {
    ok: true,
    summary: `Due date of ${(before as any).invoice_no || "the invoice"} moved from ${(before as any).due_date || "unset"} to ${args.due_date}.`,
    result: { invoice_id: (before as any).id, from: (before as any).due_date, to: args.due_date },
    undo: { kind: "set_due_date", invoice_id: (before as any).id, due_date: (before as any).due_date },
  };
}

async function markInvoicePaid(args: Record<string, unknown>, ctx: Ctx): Promise<HandlerResult> {
  const svc = svcOrFail();
  const { data: before, error: readErr } = await svc.from("invoices")
    .select("id, invoice_no, status, amount, party").eq("org_id", ctx.orgId).eq("id", String(args.invoice_id)).maybeSingle();
  if (readErr) return { ok: false, error: `Could not read the invoice: ${readErr.message}` };
  if (!before) return { ok: false, error: "That invoice no longer exists in this workspace." };
  if (String((before as any).status || "").toLowerCase() === "paid") {
    return { ok: false, error: `${(before as any).invoice_no || "This invoice"} is already marked paid.` };
  }

  /* The collections thread as it was BEFORE — the paid trigger marks it
     recovered, and an honest undo has to put it back, or the money stays
     counted as "recovered by Cortex" and the invoice is never chased again. */
  const { data: threadBefore } = await svc.from("collection_threads")
    .select("id, status").eq("org_id", ctx.orgId).eq("invoice_id", String(args.invoice_id)).maybeSingle();

  const { data: rows, error } = await svc.from("invoices")
    .update({ status: "paid" })
    .eq("org_id", ctx.orgId).eq("id", String(args.invoice_id)).select("id");
  if (error) return { ok: false, error: `Could not mark it paid: ${error.message}` };
  if (!rows || rows.length !== 1) return { ok: false, error: "The update touched no rows — the invoice may have been deleted." };

  /*
    The invoices table has no paid_on column. The date the owner gave us is
    recorded HERE, in the ledger, rather than invented onto a column that does
    not exist. If a paid_on column is ever added, this is where to find the
    historical values to backfill it from.
  */
  return {
    ok: true,
    summary: `${(before as any).invoice_no || "Invoice"} (₹${Math.round(Number((before as any).amount) || 0).toLocaleString("en-IN")}, ${(before as any).party}) marked paid${args.paid_on ? ` on ${args.paid_on}` : ""}.`,
    result: { invoice_id: (before as any).id, amount: (before as any).amount, paid_on: args.paid_on ?? null, previous_status: (before as any).status },
    undo: {
      kind: "set_status", invoice_id: (before as any).id, status: (before as any).status || "pending",
      thread: threadBefore && ["open", "paused"].includes(String((threadBefore as any).status)) ? { id: (threadBefore as any).id, status: (threadBefore as any).status } : null,
    },
  };
}

async function addDoNotContact(args: Record<string, unknown>, ctx: Ctx): Promise<HandlerResult> {
  const svc = svcOrFail();
  const party = String(args.party).trim();
  const { data: pol, error: readErr } = await svc.from("collection_policies")
    .select("org_id, do_not_contact").eq("org_id", ctx.orgId).maybeSingle();
  if (readErr) return { ok: false, error: `Could not read the collections policy: ${readErr.message}` };

  const existing: string[] = Array.isArray((pol as any)?.do_not_contact) ? (pol as any).do_not_contact : [];
  const norm = normalizeCustomerName(party);
  const already = existing.some((x) => normalizeCustomerName(x) === norm);
  if (already) return { ok: false, error: `"${party}" is already on the do-not-contact list.` };

  const next = [...existing, party].slice(0, 500);
  if (pol) {
    const { data: rows, error } = await svc.from("collection_policies")
      .update({ do_not_contact: next }).eq("org_id", ctx.orgId).select("org_id");
    if (error) return { ok: false, error: `Could not update the list: ${error.message}` };
    if (!rows || rows.length !== 1) return { ok: false, error: "The update touched no rows." };
  } else {
    const { error } = await svc.from("collection_policies").insert({ org_id: ctx.orgId, do_not_contact: next });
    if (error) return { ok: false, error: `Could not create the collections policy: ${error.message}` };
  }

  /* Pause any open thread for this party so a queued draft does not go out. */
  let paused = 0;
  try {
    const { data: threads } = await svc.from("collection_threads")
      .select("id, party").eq("org_id", ctx.orgId).eq("status", "open");
    const ids = ((threads as any[]) || []).filter((t) => normalizeCustomerName(t.party) === norm).map((t) => t.id);
    if (ids.length) {
      const { data: rows } = await svc.from("collection_threads").update({ status: "paused" }).in("id", ids).eq("org_id", ctx.orgId).select("id");
      paused = rows?.length || 0;
    }
  } catch { /* the list is the control; pausing threads is a courtesy */ }

  return {
    ok: true,
    summary: `"${party}" added to do-not-contact${paused ? `; ${paused} open reminder thread${paused === 1 ? "" : "s"} paused` : ""}.`,
    result: { party, reason: args.reason ?? null, threads_paused: paused },
    undo: { kind: "remove_dnc", party },
  };
}

async function sendPaymentReminder(args: Record<string, unknown>, ctx: Ctx): Promise<HandlerResult> {
  /*
    Through the collections engine, not around it. prepareDrafts applies every
    guard that makes collections safe — do-not-contact, attempt caps, sending
    hours, the platform kill switch, "stop on payment" — and sendApproved only
    sends what is approved. This handler approves exactly ONE draft: the one
    for this invoice. It never composes a message and never chooses a
    recipient; both come from the invoice's party through the template engine.
  */
  const svc = svcOrFail();
  const invoiceId = String(args.invoice_id);
  const { data: inv, error: readErr } = await svc.from("invoices")
    .select("id, invoice_no, party, amount, status").eq("org_id", ctx.orgId).eq("id", invoiceId).maybeSingle();
  if (readErr) return { ok: false, error: `Could not read the invoice: ${readErr.message}` };
  if (!inv) return { ok: false, error: "That invoice no longer exists in this workspace." };
  if (String((inv as any).status || "").toLowerCase() === "paid") return { ok: false, error: "That invoice is already paid — no reminder sent." };

  const { prepareDrafts, sendApproved } = await import("@/lib/collections");
  const { data: org } = await svc.from("organizations").select("name").eq("id", ctx.orgId).maybeSingle();
  const prep = await prepareDrafts(ctx.orgId, String((org as any)?.name || "our company"));

  const { data: thread } = await svc.from("collection_threads")
    .select("id, status, attempts").eq("org_id", ctx.orgId).eq("invoice_id", invoiceId).maybeSingle();
  if (!thread) {
    const why = Object.entries(prep.reasons || {}).map(([k, v]) => `${k} ×${v}`).join(", ");
    return { ok: false, error: `Collections did not draft a reminder for this invoice${why ? ` (this run: ${why})` : ""}. It may be inside the do-not-contact list, not yet past the first reminder day, or at the attempt cap.` };
  }

  const wantChannel = String(args.channel || "email");
  const { data: drafts } = await svc.from("collection_messages")
    .select("id, channel, status").eq("org_id", ctx.orgId).eq("thread_id", (thread as any).id).eq("status", "draft");
  const draft = ((drafts as any[]) || []).find((d) => d.channel === wantChannel) || ((drafts as any[]) || [])[0];
  if (!draft) return { ok: false, error: `No draft is waiting for this invoice — the last reminder may be too recent, or the thread is ${(thread as any).status}.` };

  const { data: approvedRows, error: apErr } = await svc.from("collection_messages")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("org_id", ctx.orgId).eq("id", draft.id).eq("status", "draft").select("id");
  if (apErr) return { ok: false, error: `Could not approve the draft: ${apErr.message}` };
  if (!approvedRows || approvedRows.length !== 1) return { ok: false, error: "The draft changed state before it could be approved." };

  const sent = await sendApproved(ctx.orgId);

  const { data: after } = await svc.from("collection_messages").select("status, recipient, error").eq("id", draft.id).maybeSingle();
  const mineSent = String((after as any)?.status) === "sent";
  if (!mineSent) {
    return { ok: false, error: `The reminder was approved but not sent${(after as any)?.error ? `: ${(after as any).error}` : (sent.note ? ` — ${sent.note}` : ".")}` };
  }

  return {
    ok: true,
    summary: `${draft.channel} reminder sent for ${(inv as any).invoice_no || "the invoice"} to ${(after as any)?.recipient || (inv as any).party}.${sent.sent > 1 ? ` (${sent.sent - 1} other already-approved reminder${sent.sent === 2 ? "" : "s"} went out in the same run.)` : ""}`,
    result: { invoice_id: invoiceId, message_id: draft.id, channel: draft.channel, recipient: (after as any)?.recipient ?? null, run: sent },
    undo: null, // a sent message cannot be unsent
  };
}

async function raiseAlert(args: Record<string, unknown>, ctx: Ctx): Promise<HandlerResult> {
  const svc = svcOrFail();
  const sev = String(args.severity || "warning");
  const colour = sev === "critical" ? "red" : sev === "info" ? "green" : "yellow";
  const { data, error } = await svc.from("alerts").insert({
    org_id: ctx.orgId, severity: colour, module: "actions",
    title: String(args.message).slice(0, 120),
    body: String(args.message),
  }).select("id").maybeSingle();
  if (error) return { ok: false, error: `Could not raise the alert: ${error.message}` };
  if (!data) return { ok: false, error: "The alert was not created." };
  return {
    ok: true,
    summary: `Alert raised: "${String(args.message).slice(0, 80)}".`,
    result: { alert_id: (data as any).id, severity: sev },
    undo: { kind: "delete_alert", alert_id: (data as any).id },
  };
}

async function exportXlsx(args: Record<string, unknown>, ctx: Ctx): Promise<HandlerResult> {
  /*
    The workbook itself is produced on download (see api/actions/[id]/file),
    from live data at that moment, because there is nowhere to park a file:
    this product deliberately uses no object storage. What the ledger records
    is WHAT was asked for and how many rows it covered when approved, so the
    history is honest about scope without pretending to hold bytes it does not.
  */
  const { countRowsFor } = await import("@/lib/engine/xlsx");
  const n = await countRowsFor(String(args.dataset), ctx.orgId, Number(args.days) || 365);
  return {
    ok: true,
    summary: `Workbook ready: ${String(args.dataset).replace(/_/g, " ")} (${n} row${n === 1 ? "" : "s"}). Download from the ledger.`,
    result: { dataset: args.dataset, rows: n, days: Number(args.days) || 365 },
    undo: { kind: "noop" },
  };
}

/* ------------------------------------------------------------------------ */

async function transformWorkbook(): Promise<HandlerResult> {
  /*
    Only reachable if something proposes this through the engine (chat, a
    workflow). The engine has no file to work on — uploads are never stored —
    so the honest answer is a pointer to the page that does.
  */
  return { ok: false, error: "Workbook transforms run from the Excel page, where you upload the file: /excel. They cannot be queued." };
}

/*
  Two customer-record actions. Both read the row first (so the summary names
  the customer and the undo carries the exact prior value), write with the
  row count checked, and scope by org_id.
*/
async function addCustomerNote(args: Record<string, unknown>, ctx: Ctx): Promise<HandlerResult> {
  const svc = svcOrFail();
  const { data: before, error: readErr } = await svc.from("customers")
    .select("id, name, notes").eq("org_id", ctx.orgId).eq("id", String(args.customer_id)).maybeSingle();
  if (readErr) return { ok: false, error: `Could not read the customer: ${readErr.message}` };
  if (!before) return { ok: false, error: "That customer no longer exists in this workspace." };
  const prev = (before as any).notes as string | null;
  const stamp = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  const line = `[${stamp}] ${String(args.note).trim()}`;
  const next = prev && prev.trim() ? `${prev.trimEnd()}\n${line}` : line;
  if (next.length > 5000) return { ok: false, error: "The notes on this customer are already at the 5,000-character limit." };

  const { data: rows, error } = await svc.from("customers").update({ notes: next })
    .eq("org_id", ctx.orgId).eq("id", String(args.customer_id)).select("id");
  if (error) return { ok: false, error: `Could not save the note: ${error.message}` };
  if (!rows || rows.length !== 1) return { ok: false, error: "The update touched no rows — the customer may have been deleted." };
  return {
    ok: true,
    summary: `Noted on ${(before as any).name}: "${String(args.note).slice(0, 80)}".`,
    result: { customer_id: (before as any).id, line },
    undo: { kind: "set_notes", customer_id: (before as any).id, notes: prev },
  };
}

async function setCustomerStatus(args: Record<string, unknown>, ctx: Ctx): Promise<HandlerResult> {
  const svc = svcOrFail();
  const { data: before, error: readErr } = await svc.from("customers")
    .select("id, name, status").eq("org_id", ctx.orgId).eq("id", String(args.customer_id)).maybeSingle();
  if (readErr) return { ok: false, error: `Could not read the customer: ${readErr.message}` };
  if (!before) return { ok: false, error: "That customer no longer exists in this workspace." };
  if ((before as any).status === args.status) return { ok: false, error: `${(before as any).name} is already ${args.status}.` };

  const { data: rows, error } = await svc.from("customers").update({ status: String(args.status) })
    .eq("org_id", ctx.orgId).eq("id", String(args.customer_id)).select("id");
  if (error) return { ok: false, error: `Could not change the status: ${error.message}` };
  if (!rows || rows.length !== 1) return { ok: false, error: "The update touched no rows — the customer may have been deleted." };
  return {
    ok: true,
    summary: `${(before as any).name}: ${(before as any).status || "unset"} → ${args.status}.`,
    result: { customer_id: (before as any).id, from: (before as any).status, to: args.status },
    undo: { kind: "set_customer_status", customer_id: (before as any).id, status: (before as any).status },
  };
}

export const HANDLERS: Record<string, (args: Record<string, unknown>, ctx: Ctx) => Promise<HandlerResult>> = {
  add_customer_note: addCustomerNote,
  set_customer_status: setCustomerStatus,
  transform_workbook: transformWorkbook,
  update_invoice_due_date: updateInvoiceDueDate,
  mark_invoice_paid: markInvoicePaid,
  add_do_not_contact: addDoNotContact,
  send_payment_reminder: sendPaymentReminder,
  raise_alert: raiseAlert,
  export_xlsx: exportXlsx,
};

/**
 * Reverse a done action. Only called for proposals whose stored `undo` is
 * non-null; the ledger refuses to offer undo otherwise.
 */
export async function undoHandler(undo: Record<string, unknown>, ctx: Ctx): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const svc = svcOrFail();
  switch (String(undo.kind)) {
    case "set_due_date": {
      const { data, error } = await svc.from("invoices").update({ due_date: (undo.due_date as string) ?? null })
        .eq("org_id", ctx.orgId).eq("id", String(undo.invoice_id)).select("id");
      if (error) return { ok: false, error: error.message };
      if (!data || data.length !== 1) return { ok: false, error: "The invoice no longer exists." };
      return { ok: true, summary: `Due date restored to ${undo.due_date ?? "unset"}.` };
    }
    case "set_status": {
      const { data, error } = await svc.from("invoices").update({ status: String(undo.status) })
        .eq("org_id", ctx.orgId).eq("id", String(undo.invoice_id)).select("id");
      if (error) return { ok: false, error: error.message };
      if (!data || data.length !== 1) return { ok: false, error: "The invoice no longer exists." };
      const th = undo.thread as { id?: string; status?: string } | null | undefined;
      if (th?.id) {
        /* Only a thread the paid trigger closed — never one that has moved on since. */
        const { data: reopened, error: thErr } = await svc.from("collection_threads")
          .update({ status: th.status || "open", recovered_at: null, recovered_amount: null })
          .eq("org_id", ctx.orgId).eq("id", th.id).eq("status", "recovered").select("id");
        if (thErr) return { ok: true, summary: `Invoice status restored to ${undo.status}, but its reminder thread could not be reopened: ${thErr.message}. Reopen it in Collections.` };
        if (reopened && reopened.length === 1) return { ok: true, summary: `Invoice status restored to ${undo.status}, and its reminder thread reopened (${th.status}). Cancelled drafts are re-drafted on the next collections run.` };
      }
      return { ok: true, summary: `Invoice status restored to ${undo.status}.` };
    }
    case "remove_dnc": {
      const { data: pol } = await svc.from("collection_policies").select("do_not_contact").eq("org_id", ctx.orgId).maybeSingle();
      const list: string[] = Array.isArray((pol as any)?.do_not_contact) ? (pol as any).do_not_contact : [];
      const norm = normalizeCustomerName(String(undo.party));
      const next = list.filter((x) => normalizeCustomerName(x) !== norm);
      const { data, error } = await svc.from("collection_policies").update({ do_not_contact: next }).eq("org_id", ctx.orgId).select("org_id");
      if (error) return { ok: false, error: error.message };
      if (!data || data.length !== 1) return { ok: false, error: "The collections policy row is gone." };
      return { ok: true, summary: `"${undo.party}" removed from do-not-contact. Paused threads were left paused — resume them in Collections if you want chasing to restart.` };
    }
    case "delete_alert": {
      const { data, error } = await svc.from("alerts").delete().eq("org_id", ctx.orgId).eq("id", String(undo.alert_id)).select("id");
      if (error) return { ok: false, error: error.message };
      if (!data || data.length !== 1) return { ok: false, error: "The alert was already removed." };
      return { ok: true, summary: "Alert removed." };
    }
    case "set_notes": {
      const { data, error } = await svc.from("customers").update({ notes: (undo.notes as string | null) ?? null })
        .eq("org_id", ctx.orgId).eq("id", String(undo.customer_id)).select("id");
      if (error) return { ok: false, error: error.message };
      if (!data || data.length !== 1) return { ok: false, error: "The customer no longer exists." };
      return { ok: true, summary: "Notes restored to what they were before." };
    }
    case "set_customer_status": {
      const { data, error } = await svc.from("customers").update({ status: (undo.status as string | null) ?? null })
        .eq("org_id", ctx.orgId).eq("id", String(undo.customer_id)).select("id");
      if (error) return { ok: false, error: error.message };
      if (!data || data.length !== 1) return { ok: false, error: "The customer no longer exists." };
      return { ok: true, summary: `Customer status restored to ${undo.status ?? "unset"}.` };
    }
    case "noop":
      return { ok: true, summary: "Nothing to reverse — the export produced a file for you and changed no data." };
    default:
      return { ok: false, error: `Unknown undo kind "${String(undo.kind)}".` };
  }
}
