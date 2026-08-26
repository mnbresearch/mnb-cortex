import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { recomputeQuietly } from "@/lib/metrics";

/**
 * Persist the results of the paid document analyses.
 *
 * Both the bank-statement and GST readers used to charge credits, return the
 * analysis to the browser, and store nothing — so the customer paid, saw a
 * result, went back to the dashboard and found the same empty state. These
 * writers put the numbers into finance_ledger, which then feeds the dashboard,
 * the cash-runway KPI and the AI's business context.
 *
 * Each writer touches ONLY its own columns and upserts on (org_id, period), so
 * the sales-derived figures and the other reader's figures survive untouched.
 *
 * WHY THESE RETURN A REASON RATHER THAN A NUMBER
 *
 * They used to return 0 / false for four completely different situations:
 * no workspace, no service-role key, nothing worth saving, and a failed write.
 * The route could not tell them apart, so it charged the customer, answered
 * `ok: true, saved: 0`, and moved on. A misconfigured service role therefore
 * billed real money for an analysis that was never stored — repeatedly, with
 * nothing in the UI to explain it.
 *
 * "Nothing to save" is a legitimate outcome and must not be refunded. "Could
 * not save" is our fault and must be. That distinction only exists if it is
 * returned.
 */

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Normalise "2026-03", "Mar 2026", "2026-03-14" → first of that month. */
function toPeriod(key: any): string | null {
  const s = String(key || "").trim();
  if (!s) return null;
  let d: Date | null = null;
  if (/^\d{4}-\d{2}$/.test(s)) d = new Date(`${s}-01T00:00:00Z`);
  else { const t = new Date(s); if (Number.isFinite(t.getTime())) d = t; }
  if (!d || !Number.isFinite(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export type PersistResult = {
  /** Rows actually written. */
  saved: number;
  /**
   * true  — stored, or there was legitimately nothing to store.
   * false — WE failed. The caller must refund and say so.
   */
  ok: boolean;
  /** Present only when ok is false; safe to show a customer. */
  error?: string;
};

const CONFIG_ERROR =
  "Your analysis ran, but Cortex could not save it to your workspace — the server is missing its database credentials. "
  + "You have not been charged. Please contact support so this can be fixed.";

/**
 * Bank statement → monthly cash position.
 * `monthly` carries inflow/outflow/net per month; `closing` is the end balance.
 * We roll the closing balance backwards through the monthly nets to reconstruct
 * each month's ending cash, which is what the runway KPI needs.
 */
export async function persistBankAnalysis(orgId: string | null | undefined, analysis: any): Promise<PersistResult> {
  if (!analysis) return { saved: 0, ok: true };

  // Signed out, or a workspace that never finished being created. Nothing to
  // write to, and not a failure of ours to store something.
  if (!orgId) return { saved: 0, ok: true };

  const svc = serviceClient();
  if (!svc) return { saved: 0, ok: false, error: CONFIG_ERROR };

  const monthly: any[] = Array.isArray(analysis.monthly) ? analysis.monthly : [];
  if (!monthly.length) return { saved: 0, ok: true };

  // Reconstruct end-of-month balances backwards from the statement's closing
  // balance. Without a closing balance we still record the net movement, and
  // leave cash_balance null rather than guessing an absolute position.
  const closing = analysis.closing === null || analysis.closing === undefined ? null : num(analysis.closing);
  const balances: (number | null)[] = new Array(monthly.length).fill(null);
  if (closing !== null) {
    let running = closing;
    for (let i = monthly.length - 1; i >= 0; i--) {
      balances[i] = +running.toFixed(2);
      running -= num(monthly[i].net);
    }
  }

  const rows = monthly
    .map((m, i) => {
      const period = toPeriod(m.key || m.label);
      if (!period) return null;
      const row: Record<string, any> = { org_id: orgId, period, net_profit: +num(m.net).toFixed(2) };
      if (balances[i] !== null) row.cash_balance = balances[i];
      return row;
    })
    .filter(Boolean) as Record<string, any>[];

  // The model returned months we could not date. Not our failure to store, but
  // worth being honest that nothing landed.
  if (!rows.length) return { saved: 0, ok: true };

  try {
    const { error } = await svc.from("finance_ledger").upsert(rows, { onConflict: "org_id,period" });
    if (error) return { saved: 0, ok: false, error: `Your analysis ran but could not be saved: ${error.message}. You have not been charged.` };
  } catch (e: any) {
    return { saved: 0, ok: false, error: `Your analysis ran but could not be saved: ${e?.message || "unknown error"}. You have not been charged.` };
  }

  await recomputeQuietly(orgId);
  return { saved: rows.length, ok: true };
}

/**
 * GST return → filed turnover and tax for the return period.
 * Kept in its own columns so it never overwrites revenue derived from orders;
 * for many Indian SMEs the filed return is the most reliable figure they have.
 */
export async function persistGstAnalysis(orgId: string | null | undefined, analysis: any): Promise<PersistResult> {
  if (!analysis) return { saved: 0, ok: true };
  if (!orgId) return { saved: 0, ok: true };

  const svc = serviceClient();
  if (!svc) return { saved: 0, ok: false, error: CONFIG_ERROR };

  const period = toPeriod(analysis.period);
  const turnover = num(analysis.taxableTurnover);
  // No usable period or no turnover — nothing worth recording.
  if (!period || turnover <= 0) return { saved: 0, ok: true };

  try {
    const { error } = await svc.from("finance_ledger").upsert(
      [{ org_id: orgId, period, gst_turnover: +turnover.toFixed(2), gst_tax: +num(analysis.totalTax).toFixed(2) }],
      { onConflict: "org_id,period" },
    );
    if (error) return { saved: 0, ok: false, error: `Your return was read but could not be saved: ${error.message}. You have not been charged.` };
  } catch (e: any) {
    return { saved: 0, ok: false, error: `Your return was read but could not be saved: ${e?.message || "unknown error"}. You have not been charged.` };
  }

  await recomputeQuietly(orgId);
  return { saved: 1, ok: true };
}
