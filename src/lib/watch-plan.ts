/*
  THE NIGHTLY WATCH — what Cortex does about your business without being asked.

  Every workspace's records are read each night and turned into PROPOSALS on
  the Approvals ledger — the same ledger chat and the owner's own buttons use.
  The owner's rules then decide: a reminder waits for a tap (the default for
  anything that contacts a customer), an in-app alert just appears. Nothing
  here sends anything by itself; everything is in the ledger, signed when
  approved, reversible where the action allows it.

  This file is the PLAN: pure, deterministic, tested by scripts/test-watch.mjs.
  lib/watch.ts loads the inputs and hands each proposal to ledger.propose().

  What it watches:
    1. Overdue receivables → a payment reminder per invoice, the costliest
       first (amount × days late), at most five a night, never to a party on
       the do-not-contact list, never twice in a week for the same invoice,
       and not at all when the collections engine is switched on (it drafts
       its own and would double up).
    2. MSME 45-day (Section 43B(h)) → an alert when micro/small suppliers are
       past the window (the deduction is at risk), and a nudge when suppliers
       with old bills have never been classified (the exposure is unknown).
    3. Deals going cold → an alert naming the biggest open deals nobody has
       moved in 14 days.
    4. Quotes left hanging → an alert for open quotes older than 7 days, and
       those already past their validity.
    5. Stock at or below its reorder level → an alert naming the items that
       are out first, with their suppliers.

  Each proposal carries an idempotency key that includes the ISO week, so a
  second run the same week — or the cron firing twice — creates nothing new.
*/

export type WatchInvoice = { id: string; invoice_no: string | null; party: string | null; amount: number; due_date: string | null; status: string | null; type: string | null };
export type WatchMsme = { party: string; udyam_category: string; total_amount: number; oldest_days: number; past_window: boolean; invoice_count: number };
export type WatchDeal = { id: string; deal_name: string | null; customer_name: string | null; value: number; stage: string | null; updated_at: string | null; created_at: string | null };
export type WatchStock = { id: string; name: string | null; on_hand: number; reorder_level: number; supplier: string | null };
export type WatchQuote = { id: string; quote_no: string | null; party: string | null; amount: number; status: string | null; valid_until: string | null; created_at: string | null };

export type WatchInput = {
  orgId: string;
  /** IST calendar date, YYYY-MM-DD. */
  today: string;
  invoices: WatchInvoice[];
  doNotContact: string[];
  collectionsOn: boolean;
  /** Invoice ids already given a reminder proposal in the last 7 days. */
  recentlyReminded: string[];
  msme: WatchMsme[];
  deals: WatchDeal[];
  quotes: WatchQuote[];
  /** Stock lines with a reorder level set. Optional so older callers keep compiling. */
  stock?: WatchStock[];
  /** Same normalisation the rest of the product uses for party names. */
  normalise: (s: string | null | undefined) => string | null;
};

export type WatchProposal = {
  action: "send_payment_reminder" | "raise_alert";
  args: Record<string, unknown>;
  rationale: string;
  evidence: string[];
  key: string;
};

export const MAX_REMINDERS = 5;
export const MIN_DAYS_LATE = 7;
export const MIN_AMOUNT = 1_000;
export const STALE_DEAL_DAYS = 14;
export const STALE_QUOTE_DAYS = 7;

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const daysBetween = (from: string, to: string) => Math.round((day(to) - day(from)) / 86_400_000);
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** ISO year-week, so a key repeats within a week and changes the next. */
export function isoWeek(today: string): string {
  const d = new Date(day(today));
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function planWatch(i: WatchInput): WatchProposal[] {
  const out: WatchProposal[] = [];
  const wk = isoWeek(i.today);
  const valid = (s: string | null | undefined) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);

  /* 1. Reminders */
  if (!i.collectionsOn) {
    const dnc = new Set(i.doNotContact.map((p) => i.normalise(p)).filter(Boolean) as string[]);
    const recent = new Set(i.recentlyReminded);
    const candidates = i.invoices
      .filter((v) => String(v.type || "receivable").toLowerCase() === "receivable")
      .filter((v) => String(v.status ?? "").trim().toLowerCase() !== "paid")
      .filter((v) => valid(v.due_date) && Number(v.amount) >= MIN_AMOUNT)
      .map((v) => ({ v, late: daysBetween(String(v.due_date), i.today) }))
      .filter(({ v, late }) => late >= MIN_DAYS_LATE && !recent.has(v.id) && !dnc.has(i.normalise(v.party) || "\u0000"))
      .sort((a, b) => b.v.amount * b.late - a.v.amount * a.late)
      .slice(0, MAX_REMINDERS);
    for (const { v, late } of candidates) {
      out.push({
        action: "send_payment_reminder",
        args: { invoice_id: v.id, channel: "email", amount: Number(v.amount), ...(v.invoice_no ? { invoice_no: v.invoice_no } : {}) },
        rationale: `${v.party || "This customer"} owes ${inr(v.amount)} on ${v.invoice_no || "an invoice"}, ${late} days past due — one of your costliest overdue bills tonight.`,
        evidence: [`${v.invoice_no || v.id.slice(0, 8)} due ${String(v.due_date).slice(0, 10)}`, `${late} days late`, `${inr(v.amount)} outstanding`],
        key: `watch:${i.orgId}:remind:${v.id}:${wk}`,
      });
    }
  }

  /* 2. MSME 43B(h) */
  const covered = i.msme.filter((r) => (r.udyam_category === "micro" || r.udyam_category === "small") && r.past_window && r.total_amount > 0);
  if (covered.length) {
    const total = covered.reduce((s, r) => s + r.total_amount, 0);
    const worst = [...covered].sort((a, b) => b.oldest_days - a.oldest_days)[0];
    out.push({
      action: "raise_alert",
      args: { severity: "critical", message: `MSME 45-day rule: ${inr(total)} owed to ${covered.length} micro/small supplier${covered.length === 1 ? "" : "s"} is past the window (oldest: ${worst.party}, ${worst.oldest_days} days). Paying late moves the tax deduction to the year you pay — clear these first.` },
      rationale: "Section 43B(h): bills to micro and small suppliers past 45 days lose the deduction for this year.",
      evidence: covered.slice(0, 3).map((r) => `${r.party}: ${inr(r.total_amount)}, ${r.oldest_days} days`),
      key: `watch:${i.orgId}:msme:${wk}`,
    });
  }
  const unknown = i.msme.filter((r) => r.udyam_category === "unclassified" && r.oldest_days >= 30 && r.total_amount > 0);
  if (unknown.length) {
    out.push({
      action: "raise_alert",
      args: { severity: "warning", message: `${unknown.length} supplier${unknown.length === 1 ? "" : "s"} with bills over 30 days old ${unknown.length === 1 ? "is" : "are"} not classified for the MSME 45-day rule, so your tax exposure is unknown. Classify them on the MSME page — it takes a minute.` },
      rationale: "Exposure under 43B(h) cannot be computed until suppliers are marked micro, small, medium or not registered.",
      evidence: unknown.slice(0, 3).map((r) => `${r.party}: ${inr(r.total_amount)}, ${r.oldest_days} days`),
      key: `watch:${i.orgId}:msme-classify:${wk}`,
    });
  }

  /* 3. Deals going cold */
  const cold = i.deals
    .filter((d) => !["won", "lost", "closed"].includes(String(d.stage || "").toLowerCase()))
    .map((d) => ({ d, idle: valid(d.updated_at || d.created_at) ? daysBetween(String(d.updated_at || d.created_at), i.today) : 0 }))
    .filter(({ idle }) => idle >= STALE_DEAL_DAYS)
    .sort((a, b) => (Number(b.d.value) || 0) - (Number(a.d.value) || 0))
    .slice(0, 3);
  if (cold.length) {
    out.push({
      action: "raise_alert",
      args: { severity: "warning", message: `Deals going cold: ${cold.map(({ d, idle }) => `${d.deal_name || d.customer_name || "a deal"} (${inr(Number(d.value) || 0)}, ${idle} days untouched)`).join("; ")}. A follow-up this week keeps them alive.` },
      rationale: `Open deals not moved in ${STALE_DEAL_DAYS}+ days, biggest first.`,
      evidence: cold.map(({ d, idle }) => `${d.deal_name || d.customer_name}: ${d.stage}, ${idle} days`),
      key: `watch:${i.orgId}:deals:${wk}`,
    });
  }

  /* 4. Quotes left hanging */
  const hanging = i.quotes
    .filter((q) => String(q.status || "open").toLowerCase() === "open" && valid(q.created_at) && daysBetween(String(q.created_at), i.today) >= STALE_QUOTE_DAYS)
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
  if (hanging.length) {
    const expired = hanging.filter((q) => valid(q.valid_until) && day(String(q.valid_until)) < day(i.today));
    const total = hanging.reduce((s, q) => s + (Number(q.amount) || 0), 0);
    out.push({
      action: "raise_alert",
      args: { severity: "warning", message: `${hanging.length} quote${hanging.length === 1 ? "" : "s"} worth ${inr(total)} still open after ${STALE_QUOTE_DAYS}+ days${expired.length ? ` (${expired.length} already past validity — renew or close them)` : ""}. Biggest: ${hanging[0].party || hanging[0].quote_no} ${inr(Number(hanging[0].amount) || 0)}. Follow up before the buyer moves on.` },
      rationale: "Quotes not answered within a week rarely close without a nudge.",
      evidence: hanging.slice(0, 3).map((q) => `${q.quote_no || q.id.slice(0, 8)} ${q.party || ""} ${inr(Number(q.amount) || 0)}`),
      key: `watch:${i.orgId}:quotes:${wk}`,
    });
  }

  /* 5. Stock */
  const low = (i.stock || [])
    .filter((it) => Number(it.reorder_level) > 0 && Number(it.on_hand) <= Number(it.reorder_level))
    .sort((a, b) => (Number(a.on_hand) / Number(a.reorder_level)) - (Number(b.on_hand) / Number(b.reorder_level)));
  if (low.length) {
    const out0 = low.filter((it) => Number(it.on_hand) <= 0).length;
    out.push({
      action: "raise_alert",
      args: { severity: out0 ? "critical" : "warning", message: `${low.length} stock item${low.length === 1 ? " is" : "s are"} at or below reorder level${out0 ? ` (${out0} already out)` : ""}: ${low.slice(0, 4).map((it) => `${it.name || it.id.slice(0, 8)} — ${Number(it.on_hand)} left, reorder at ${Number(it.reorder_level)}${it.supplier ? ` (${it.supplier})` : ""}`).join("; ")}. Raise the purchase orders before you lose sales.` },
      rationale: "Items at or below the reorder level you set.",
      evidence: low.slice(0, 3).map((it) => `${it.name}: ${it.on_hand}/${it.reorder_level}`),
      key: `watch:${i.orgId}:stock:${wk}`,
    });
  }

  return out;
}
