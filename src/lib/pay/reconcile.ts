import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { getOrder } from "@/lib/pay/cashfree";
import { settleOrder } from "@/lib/pay/settle";
import { PAYMENTS_TABLE } from "@/lib/pay/table";
import { operatorAlert } from "@/lib/operator-alert";

/**
 * PAYMENT RECONCILIATION. Ask the provider what it took, and compare.
 *
 * WHY THIS IS THE MOST IMPORTANT THING IN THE MONEY PATH.
 *
 * Every other guard in settle.ts and the webhook handler makes a single
 * delivery correct. None of them helps when the delivery never arrives. A
 * webhook can be lost for reasons entirely outside this code: a deploy
 * restarting the function mid-POST, a signature mismatch after a key rotation,
 * an outage that outlasts Cashfree's retry schedule, a 500 from a database
 * blip on the last attempt. When that happens the money is at Cashfree and
 * the customer has nothing, and — before this file — no query existed that
 * could find them. `settleOrder` had exactly two callers, both event-driven.
 *
 * The honest description of that state is "we do not know whether our records
 * match the money". That is what a reconciliation job is for, and it is why it
 * was one of the launch conditions.
 *
 * THREE QUEUES, and each one is a different way of being owed something.
 *
 *   1. INTENTS THAT NEVER SETTLED. payment_intents holds one row per checkout
 *      started. Any row with no matching settled payment, older than the grace
 *      window, gets asked about directly: getOrder() → if PAID, settle it now.
 *      This is the queue that catches a lost webhook.
 *
 *   2. PAID BUT NOT GRANTED. `status='paid' and granted_at is null` means we
 *      claimed the order and never confirmed the entitlement. settleOrder is
 *      re-entrant now, so re-running it repairs the grant.
 *
 *   3. STUCK IN A FAILURE STATUS. grant_failed, grant_unverified — money in,
 *      entitlement unconfirmed, and Cashfree has long since stopped retrying.
 *
 * WHAT IT WILL NOT DO.
 *
 * It never grants on its own authority. Every repair goes through settleOrder,
 * which re-verifies the order against Cashfree, re-checks the amount against
 * the catalogue, and is idempotent — so a reconciliation run cannot invent an
 * entitlement, and running it twice cannot double one.
 *
 * It does not touch an intent younger than the grace window, because a
 * customer who is still on the Cashfree page is not a discrepancy.
 *
 * It gives up on an intent that has been unpaid for longer than ABANDON_DAYS
 * and marks it abandoned. Most checkouts are abandoned; keeping them in the
 * queue for ever would bury the real cases.
 */

/** How long after checkout we start asking questions. A customer can plausibly
 *  still be typing a card number; twenty minutes is past that and well inside
 *  Cashfree's own retry window, so this is a backstop, not a race. */
const GRACE_MINUTES = 20;

/** An intent unpaid for this long is an abandoned checkout, not a lost payment. */
const ABANDON_DAYS = 3;

/** Cap the work per run: this shares a serverless function budget. */
const MAX_PER_QUEUE = 40;

export type ReconcileReport = {
  ok: boolean;
  checked: number;
  /** Payments found at Cashfree that we had not settled, now settled. */
  recovered: Array<{ orderId: string; orgId?: string; amount?: number; what: string }>;
  /** Still wrong after we tried. These need a human. */
  unresolved: Array<{ orderId: string; orgId?: string; why: string }>;
  /** Abandoned checkouts closed off. */
  abandoned: number;
  /** Rows confirmed fine (either granted, or genuinely unpaid). */
  clean: number;
  error?: string;
};

export async function reconcilePayments(opts?: { dryRun?: boolean }): Promise<ReconcileReport> {
  const report: ReconcileReport = { ok: true, checked: 0, recovered: [], unresolved: [], abandoned: 0, clean: 0 };
  const svc = serviceClient();
  if (!svc) return { ...report, ok: false, error: "no service role" };

  const dry = Boolean(opts?.dryRun);
  /* Unresolved rows we have not reported before. Only these interrupt a human. */
  let newlyUnresolved = 0;
  const now = Date.now();
  const graceCutoff = new Date(now - GRACE_MINUTES * 60_000).toISOString();
  const abandonCutoff = new Date(now - ABANDON_DAYS * 86_400_000).toISOString();

  /* ---- Queue 1: intents with no settled payment -------------------------- */
  /*
    ORDERED BY WHEN WE LAST LOOKED, OLDEST FIRST — not by when the intent was
    created.

    Sorting by created_at puts the oldest row at the head permanently, and
    nothing removes a row Cashfree cannot answer for. Once forty such rows
    exist, the caps below mean no genuinely lost payment is ever examined
    again: the job runs nightly, reports the same forty, and quietly stops
    reconciling. Rotating on reconcile_checked_at (nulls first, so anything
    never examined comes before anything already examined) makes the queue
    fair, which is what the cron_cursors table does for the nightly sweep.
  */
  const { data: intents, error: intentsErr } = await svc.from("payment_intents")
    .select("order_id, org_id, kind, ref, amount, created_at")
    .is("settled_at", null)
    .lt("created_at", graceCutoff)
    .order("reconcile_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_QUEUE);
  /*
    A FAILED QUERY MUST NOT READ AS "NOTHING TO DO".

    Both queue queries discarded their error. If reconcile_checked_at is not
    migrated yet — the very condition the settle path is written to tolerate —
    PostgREST rejects the ORDER clause, `data` comes back null, both loops
    iterate zero rows, and the run reports ok with checked: 0 and alerts
    nobody. The mechanism that finds lost payments would have been silently
    switched off, and the only symptom is a number that is always zero.
  */
  if (intentsErr) {
    await operatorAlert({
      kind: "reconcile_query_failed",
      severity: "red",
      title: "Payment reconciliation could not read the intents queue",
      body: `${intentsErr.message}. Nothing was checked. If this mentions reconcile_checked_at, run `
        + `supabase/migrations/2026_zzzi_payment_integrity.sql.`,
    });
    return { ...report, ok: false, error: `intents queue unreadable: ${intentsErr.message}` };
  }

  for (const it of ((intents as any[]) || [])) {
    report.checked++;
    const orderId = String(it.order_id);
    /* Stamp it as examined FIRST, so a row that throws or times out later in
       this loop still moves to the back of the queue instead of blocking it. */
    if (!dry) await stamp(svc, "payment_intents", orderId);

    /* Did it settle after all? The webhook may have landed without the intent
       being closed — closing it is best-effort by design. */
    const { data: existing } = await svc.from(PAYMENTS_TABLE)
      .select("status, granted_at").eq("order_id", orderId).maybeSingle();
    if ((existing as any)?.granted_at) {
      if (!dry) await closeIntent(svc, orderId, "settled");
      report.clean++;
      continue;
    }

    /*
      ASK CASHFREE. This is the diff: our records say nothing was granted; the
      provider knows whether it took the money.
    */
    const order = await getOrder(orderId);
    if (order.unknown) {
      /* Could not reach the provider. Leave the intent open — an unanswered
         question is not an answer, and the next run asks again. */
      report.unresolved.push({ orderId, orgId: it.org_id, why: "could not reach Cashfree to confirm this order" });
      continue;
    }
    if (!order.paid) {
      if (new Date(it.created_at).getTime() < new Date(abandonCutoff).getTime()) {
        if (!dry) await closeIntent(svc, orderId, "abandoned");
        report.abandoned++;
      } else {
        report.clean++;
      }
      continue;
    }

    /* PAID AT CASHFREE, NOT GRANTED HERE. This is the case the whole file
       exists for. */
    if (dry) {
      report.recovered.push({ orderId, orgId: it.org_id, amount: order.amount, what: "would settle (dry run)" });
      continue;
    }
    const res = await settleOrder(orderId);
    if (res.ok) {
      await closeIntent(svc, orderId, "settled_by_reconcile");
      report.recovered.push({
        orderId, orgId: res.orgId || it.org_id, amount: order.amount,
        what: res.kind === "credits" ? `${res.credits} credits` : `plan ${res.plan || it.ref}`,
      });
    } else {
      report.unresolved.push({ orderId, orgId: res.orgId || it.org_id, why: res.error || "settlement refused" });
    }
  }

  /* ---- Queue 2 and 3: our own rows that took money and granted nothing --- */
  const { data: stuck, error: stuckErr } = await svc.from(PAYMENTS_TABLE)
    .select("order_id, org_id, kind, ref, amount, status, granted_at, created_at, reconcile_note")
    .is("granted_at", null)
    .in("status", ["paid", "grant_failed", "grant_unverified"])
    .lt("created_at", graceCutoff)
    .order("reconcile_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_QUEUE);
  if (stuckErr) {
    await operatorAlert({
      kind: "reconcile_query_failed",
      severity: "red",
      title: "Payment reconciliation could not read the ungranted queue",
      body: `${stuckErr.message}. Intents were checked; payments were not.`,
    });
    return { ...report, ok: false, error: `ungranted queue unreadable: ${stuckErr.message}` };
  }

  for (const p of ((stuck as any[]) || [])) {
    report.checked++;
    const orderId = String(p.order_id);
    if (!dry) await stamp(svc, PAYMENTS_TABLE, orderId);

    /*
      A RENEWAL ROW IS NOT REPAIRABLE THROUGH settleOrder.

      Subscription claims have synthetic ids (`sub_<mandate>_<payment>`) which
      are not Cashfree order ids, so getOrder would report "not found" and
      settleOrder would refuse. Extending a mandate's period is the
      subscription handler's job and it needs the mandate, not the order. So
      these are escalated rather than guessed at — a wrong repair here grants a
      paid period nobody paid for.
    */
    if (String(p.kind || "").startsWith("subscription")) {
      const why = `recurring debit on mandate ${p.ref} recorded as ${p.status} with no confirmed grant — extend by hand`;
      report.unresolved.push({ orderId, orgId: p.org_id, why });
      /* Only NEW diagnoses interrupt anybody — see the note on `escalate`. */
      if (!p.reconcile_note) newlyUnresolved++;
      if (!dry) await note(svc, orderId, why);
      continue;
    }

    if (dry) {
      report.recovered.push({ orderId, orgId: p.org_id, amount: p.amount, what: "would re-settle (dry run)" });
      continue;
    }
    const res = await settleOrder(orderId);
    if (res.ok) {
      report.recovered.push({
        orderId, orgId: res.orgId || p.org_id, amount: p.amount,
        what: res.already ? "already granted — row marked" : (res.kind === "credits" ? `${res.credits} credits` : `plan ${res.plan || p.ref}`),
      });
    } else {
      const why = String(res.error || "settlement refused");
      report.unresolved.push({ orderId, orgId: res.orgId || p.org_id, why });
      if (!p.reconcile_note) newlyUnresolved++;
      /* Leave the diagnosis on the row. The operator console shows it, and the
         next run sorts this row behind anything it has not looked at yet. */
      if (!dry) await note(svc, orderId, why);
    }
  }

  /* ---- Say something, to someone ---------------------------------------- */
  /*
    EMAIL ONLY WHAT IS NEW.

    Several rows are permanently unrepairable by design — a wrong amount, an
    unrecognised plan, a renewal that needs a person. They stay in the queue
    because they genuinely are unresolved, and the first version emailed the
    whole list every night for ever. An alert that arrives nightly regardless
    of whether anything changed is an alert nobody reads, which is how the
    invisible states in this file's history became invisible in the first
    place.

    reconcile_note is the record of "already reported". A row keeps its place
    in the report — the operator console still lists it — but only a diagnosis
    we have not sent before interrupts anyone.
  */
  if (!dry && (report.recovered.length || report.unresolved.length)) {
    await operatorAlert({
      kind: report.unresolved.length ? "reconcile_unresolved" : "reconcile_recovered",
      severity: newlyUnresolved > 0 ? "red" : "amber",
      title: report.unresolved.length
        ? `${report.unresolved.length} payment(s) still unreconciled${newlyUnresolved ? ` (${newlyUnresolved} new)` : " (all previously reported)"}`
        : `Reconciliation repaired ${report.recovered.length} payment(s)`,
      body: [
        report.recovered.length ? `Recovered: ${report.recovered.map((r) => `${r.orderId} (${r.what})`).join("; ")}` : "",
        report.unresolved.length ? `NEEDS A HUMAN: ${report.unresolved.map((r) => `${r.orderId} — ${r.why}`).join("; ")}` : "",
      ].filter(Boolean).join(" | ").slice(0, 3000),
      email: newlyUnresolved > 0,
    });
  }

  return report;
}

async function closeIntent(svc: any, orderId: string, outcome: string): Promise<void> {
  const { error } = await svc.from("payment_intents")
    .update({ settled_at: new Date().toISOString(), outcome })
    .eq("order_id", orderId);
  /* An open intent is the safe state — it gets re-examined — so a failure here
     is logged rather than escalated. Logged, though: silently failing to close
     intents would make every run repeat the same work for ever. */
  if (error) console.error(`[reconcile] could not close intent ${orderId}:`, error.message);
}

/** Leave the diagnosis on the row: the console reads it, and it is what stops
 *  the same problem being emailed every night. */
async function note(svc: any, orderId: string, why: string): Promise<void> {
  const { error } = await svc.from(PAYMENTS_TABLE)
    .update({ reconcile_note: why.slice(0, 300) }).eq("order_id", orderId);
  if (error) console.error(`[reconcile] could not note ${orderId}:`, error.message);
}

/** Record that we looked, so the queue rotates and one bad row cannot block it. */
async function stamp(svc: any, table: string, orderId: string): Promise<void> {
  const { error } = await svc.from(table)
    .update({ reconcile_checked_at: new Date().toISOString() })
    .eq("order_id", orderId);
  if (error) console.error(`[reconcile] could not stamp ${table}.${orderId}:`, error.message);
}
