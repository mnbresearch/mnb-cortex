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

/**
 * Bank statement → monthly cash position.
 * `monthly` carries inflow/outflow/net per month; `closing` is the end balance.
 * We roll the closing balance backwards through the monthly nets to reconstruct
 * each month's ending cash, which is what the runway KPI needs.
 */
export async function persistBankAnalysis(orgId: string | null | undefined, analysis: any): Promise<number> {
  if (!orgId || !analysis) return 0;
  const svc = serviceClient();
  if (!svc) return 0;

  const monthly: any[] = Array.isArray(analysis.monthly) ? analysis.monthly : [];
  if (!monthly.length) return 0;

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

  if (!rows.length) return 0;
  try {
    const { error } = await svc.from("finance_ledger").upsert(rows, { onConflict: "org_id,period" });
    if (error) return 0;
  } catch { return 0; }

  await recomputeQuietly(orgId);
  return rows.length;
}

/**
 * GST return → filed turnover and tax for the return period.
 * Kept in its own columns so it never overwrites revenue derived from orders;
 * for many Indian SMEs the filed return is the most reliable figure they have.
 */
export async function persistGstAnalysis(orgId: string | null | undefined, analysis: any): Promise<boolean> {
  if (!orgId || !analysis) return false;
  const svc = serviceClient();
  if (!svc) return false;

  const period = toPeriod(analysis.period);
  const turnover = num(analysis.taxableTurnover);
  // No usable period or no turnover — nothing worth recording.
  if (!period || turnover <= 0) return false;

  try {
    const { error } = await svc.from("finance_ledger").upsert(
      [{ org_id: orgId, period, gst_turnover: +turnover.toFixed(2), gst_tax: +num(analysis.totalTax).toFixed(2) }],
      { onConflict: "org_id,period" },
    );
    if (error) return false;
  } catch { return false; }

  await recomputeQuietly(orgId);
  return true;
}
