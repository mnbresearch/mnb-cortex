/**
 * Which single overdue invoice to name — one ranking, used everywhere.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * The landing page promises, three times and in the product's own voice:
 *
 *   "the same screen names the worst thing in what you just sent — WHICH
 *    CUSTOMER, how much, how late"
 *   "names the thing that is about to cost you money — the customer, the
 *    amount, the date"
 *   "Cortex emails you the day an invoice crosses its due date — with the name
 *    and the number."
 *
 * None of that was true. `InsightSignals` had no party field of any kind, so
 * the warning an owner got after their first import read:
 *
 *   "₹4.2 L of receivables is past its due date"
 *
 * — an aggregate. Correct, and not what was sold. The customer's name existed
 * one click away on /receivables and nowhere else, so the alert email could
 * not carry it either.
 *
 * This is the missing half. It is a separate module rather than a few lines
 * inside lib/insights.ts for one reason: /receivables already ranks overdue
 * invoices, in `receivables-aging.tsx`, as
 *
 *   .sort((a, b) => b.amount * b.days - a.amount * a.days)
 *
 * captioned "biggest, oldest money". If the dashboard warning and the
 * receivables page each had their own idea of "worst", an owner would be told
 * to chase Patel Brothers on one screen and Kirloskar on the next, with no way
 * to tell which was right. This repo has been bitten by exactly that before —
 * two conflicting "overdue" labels, two definitions of Orders (MTD) — and the
 * fix each time was one definition in one place. So: one function, both
 * callers.
 *
 * ============================================================================
 * WHY amount x days, AND NOT amount
 * ============================================================================
 *
 * A ₹50,000 invoice 200 days late is a worse problem than a ₹2,00,000 invoice
 * three days late, even though the second is the bigger number. The first has
 * stopped being a receivable and started being a bad debt; the second is a
 * customer who pays on the 5th. Ranking on amount alone surfaces the second
 * and wastes the owner's phone call.
 *
 * ============================================================================
 * NULL IS NOT ZERO, AGAIN
 * ============================================================================
 *
 * Returns `null` — never a placeholder row — when nothing qualifies. Callers
 * must fall back to the aggregate wording. An invoice with no `party` recorded
 * is skipped rather than named "Unknown": the whole point of the claim is to
 * name a customer, and "Unknown owes you ₹2 L" is worse than the aggregate it
 * replaced. It still counts towards the total, because the money is real; it
 * just cannot be the one we name.
 */

/**
 * THE ranking rule: biggest amount for the longest time, worst first.
 *
 * Exported as a comparator so /receivables' "Chase these first" list and the
 * dashboard's single named warning are sorted by the same line of code rather
 * than by two implementations that agree today. Use it with `.sort()` on
 * anything already carrying an amount and a day count.
 */
export function byWorst(a: { amount: number; days: number }, b: { amount: number; days: number }): number {
  return b.amount * b.days - a.amount * a.days;
}

/** The fields this ranking needs. Deliberately narrow so any caller can supply them. */
export type OverdueCandidate = {
  party?: string | null;
  amount?: number | string | null;
  due_date?: string | null;
  status?: string | null;
  type?: string | null;
};

/** The one invoice worth naming. */
export type WorstOverdue = {
  /** The customer's name, exactly as recorded. Never empty. */
  party: string;
  /** Rupees outstanding on that one invoice. */
  amount: number;
  /** Whole days past the due date. Always >= 1. */
  daysLate: number;
};

const n = (v: unknown): number => {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Whole days between an ISO date and `todayIso`, positive when overdue.
 *
 * Both are plain `YYYY-MM-DD` calendar dates, so this is done in UTC on
 * purpose: `Date.UTC` of two date-only strings cannot be shifted across a
 * boundary by the server's timezone, which is how an invoice due today came
 * to read "1 day late" for five and a half hours every night. The caller is
 * responsible for passing an IST calendar date as `todayIso`; metrics.ts
 * already computes one for exactly this reason.
 */
export function daysLate(dueIso: string, todayIso: string): number {
  const d = Date.parse(`${dueIso}T00:00:00Z`);
  const t = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(t)) return 0;
  return Math.floor((t - d) / 86_400_000);
}

/**
 * The single worst open receivable, or null when there is nothing to name.
 *
 * `todayIso` must be a `YYYY-MM-DD` calendar date in the business's own
 * timezone.
 */
export function worstOverdue(rows: OverdueCandidate[], todayIso: string): WorstOverdue | null {
  let best: WorstOverdue | null = null;
  let bestScore = 0;

  for (const r of rows) {
    const status = String(r.status || "pending").toLowerCase();
    const type = String(r.type || "receivable").toLowerCase();
    if (status === "paid") continue;
    if (type === "payable") continue;

    const party = String(r.party || "").trim();
    if (!party) continue;                   // cannot name it; see the header

    const amount = n(r.amount);
    if (amount <= 0) continue;

    /*
      An invoice explicitly marked `overdue` with no due date on file is
      genuinely late — the importer sets that status from the source system —
      but we do not know BY HOW LONG. Scoring it as 0 days would rank it last
      however large it is, so it gets one day: enough to be considered, never
      enough to outrank something measurably worse.
    */
    const late = r.due_date ? daysLate(String(r.due_date), todayIso)
      : status === "overdue" ? 1 : 0;
    if (late < 1) continue;

    const score = amount * late;
    if (score > bestScore) {
      bestScore = score;
      best = { party, amount, daysLate: late };
    }
  }

  return best;
}
