/*
  ABANDONED-CHECKOUT FOLLOW-UP — the decision, pure and tested
  (scripts/test-checkout-followup.mjs). lib/checkout-followup.ts loads the
  inputs and sends.

  WHO GETS ONE EMAIL, AND WHO NEVER DOES

  Source of truth is payment_intents — one row per Cashfree order CREATED by
  a signed-in workspace owner. Not page views, not a form someone half-filled.
  A follow-up is considered only when ALL of these hold:

    1. reconcile.ts has ASKED CASHFREE and closed the intent as `abandoned`
       (confirmed unpaid; it does that after 3 days). An open intent is never
       used: until the provider has answered, "you were not charged" is a guess,
       and money taken but not yet granted is a support case, not a reminder.
    2. The order is between 24 hours and 7 days old (in practice 3–7, given
       rule 1), and has no cortex_payments row.
    3. The workspace did not pay for anything after starting this checkout,
       and is not on an active paid plan now.
    4. We have not already handled this order (sent, skipped, or uncertain),
       and have not emailed this workspace about a checkout in 14 days.
       One order per workspace per run — the newest.
    5. There is an owner with a CONFIRMED email address, and that address is
       not on email_optouts (the same list every other email honours).

  A send that failed is retried on later runs, at most 3 attempts. A send whose
  outcome is UNKNOWN (timeout after the provider may have accepted it) is
  never retried: a second copy is worse than none.
*/

export const MIN_AGE_HOURS = 24;
export const MAX_AGE_DAYS = 7;
export const COOLDOWN_DAYS = 14;
export const MAX_ATTEMPTS = 3;
export const MAX_PER_RUN = 50;

export type FollowupMode = "off" | "dry_run" | "live";

export type IntentRow = {
  order_id: string; org_id: string | null; kind: string | null; ref: string | null;
  amount: number | null; created_at: string; settled_at?: string | null; outcome?: string | null;
};

export type PreviousRow = { status: string; attempts: number };

export type PlanInput = {
  now: number;
  intents: IntentRow[];
  /** Orders that have a cortex_payments row (paid or money-taken). */
  paidOrders: Set<string>;
  /** Latest paid cortex_payments time per org (ms). */
  lastPaidAt: Map<string, number>;
  /** Orgs on a live paid plan right now. */
  activeOrgs: Set<string>;
  /** checkout_followups rows by order_id. */
  previous: Map<string, PreviousRow>;
  /** Latest successful follow-up per org (ms). */
  lastSentAt: Map<string, number>;
  /**
   * Owner address per org. `undefined` (the whole map) = not resolved yet —
   * the runner calls plan() once to find candidates, resolves only their
   * owners, then calls it again. Never guessed.
   */
  recipients?: Map<string, { email: string; confirmed: boolean }>;
  optedOut?: Set<string>;
  maxPerRun?: number;
};

export type Decision =
  | { action: "send" | "retry"; order_id: string; org_id: string; to: string | null; intent: IntentRow }
  | { action: "skip"; order_id: string; org_id: string | null; reason: string };

const DAY = 86_400_000;

export function planFollowups(i: PlanInput): Decision[] {
  const out: Decision[] = [];
  const seenOrgs = new Set<string>();
  let queued = 0;
  const cap = i.maxPerRun ?? MAX_PER_RUN;
  const sorted = [...i.intents].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  for (const it of sorted) {
    const skip = (reason: string) => out.push({ action: "skip", order_id: it.order_id, org_id: it.org_id, reason });
    const created = Date.parse(it.created_at);
    if (!Number.isFinite(created)) { skip("bad date"); continue; }
    const age = i.now - created;
    if (age < MIN_AGE_HOURS * 3_600_000) { skip("too recent"); continue; }
    if (age > MAX_AGE_DAYS * DAY) { skip("too old"); continue; }
    if (!it.org_id) { skip("no workspace"); continue; }
    if (it.kind !== "plan" && it.kind !== "credits") { skip("not a purchase"); continue; }
    if (it.outcome !== "abandoned") { skip(it.outcome ? "settled" : "not confirmed unpaid yet"); continue; }
    if (i.paidOrders.has(it.order_id)) { skip("paid"); continue; }
    if ((i.lastPaidAt.get(it.org_id) ?? 0) >= created) { skip("paid later"); continue; }
    if (i.activeOrgs.has(it.org_id)) { skip("already subscribed"); continue; }

    const prev = i.previous.get(it.order_id);
    let action: "send" | "retry" = "send";
    if (prev) {
      if (prev.status === "failed" && prev.attempts < MAX_ATTEMPTS) action = "retry";
      else { skip(prev.status === "failed" ? "gave up after retries" : `already ${prev.status}`); continue; }
    }
    if (seenOrgs.has(it.org_id)) { skip("one per workspace per run"); continue; }
    const last = i.lastSentAt.get(it.org_id) ?? 0;
    if (action === "send" && last && i.now - last < COOLDOWN_DAYS * DAY) { skip("emailed this workspace recently"); continue; }

    let to: string | null = null;
    if (i.recipients) {
      const r = i.recipients.get(it.org_id);
      if (!r || !r.email) { skip("no owner email"); continue; }
      if (!r.confirmed) { skip("owner email not confirmed"); continue; }
      if (i.optedOut?.has(r.email.toLowerCase())) { skip("opted out"); continue; }
      to = r.email;
    }
    if (queued >= cap) { skip("run cap reached"); continue; }

    seenOrgs.add(it.org_id);
    queued++;
    out.push({ action, order_id: it.order_id, org_id: it.org_id, to, intent: it });
  }
  return out;
}

/** "a***@example.com" — what the operator console shows. */
export function maskEmail(e: string): string {
  const [u, d] = String(e || "").split("@");
  if (!u || !d) return "—";
  return `${u.slice(0, 1)}***@${d}`;
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/**
 * The message. Says only what is known — the provider confirmed the order
 * unpaid (rule 1) — not "your payment failed", which we may not know. No discount, no countdown,
 * no invented scarcity. One link to finish, one way to reply, one way out.
 */
export function renderFollowup(c: {
  firstName: string; itemName: string; amount: number | null; cycle?: string | null;
  startedOn: string; billingUrl: string; unsubscribeUrl: string;
}): { subject: string; body: string } {
  const price = c.amount && c.amount > 0 ? ` (${inr(c.amount)}${c.cycle === "annual" ? " a year" : c.cycle === "monthly" ? " a month" : ""})` : "";
  return {
    subject: `Your ${c.itemName} checkout didn't finish`,
    body: `Hi ${c.firstName},

On ${c.startedOn} you started checkout for ${c.itemName}${price}. The payment was not completed, so you have not been charged.

If you still want it, you can pick up where you left off here:

  ${c.billingUrl}

If something went wrong at the payment step — a card or UPI error, a bank OTP that never came — reply to this email and tell us what you saw. A person reads every reply.

If you decided against it, there is nothing to do. This is the only reminder we send for this checkout.

— Team MNB Cortex

Don't want emails like this? Unsubscribe: ${c.unsubscribeUrl}`,
  };
}
