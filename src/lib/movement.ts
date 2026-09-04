import "server-only";
import { serviceClient } from "@/lib/supabase/server";

/**
 * What moved, and by how much, since last week.
 *
 * WHAT THIS BACKS.
 *
 * The whole product is positioned on early warning, and two paid bullets say so
 * explicitly: "Whose receivables moved this week" on Practice, and the weekly
 * brief on Watch. Neither was computable. `health_metrics` holds one row per
 * metric and recomputeMetrics() overwrites it on every write, so the instant a
 * number changes the old one is gone — there was no yesterday to compare to.
 *
 * 2026_metric_snapshots.sql keeps a daily copy; this reads it.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE.
 *
 * Never report a movement we cannot date. A workspace that started using Cortex
 * on Tuesday has no "last week", and the honest output is "not enough history
 * yet" — not a change of 0%, which reads as "nothing is wrong" and is exactly
 * the false reassurance an early-warning product must never give. Every result
 * carries the date it compared against, so the sentence on screen can say
 * "since 28 August" rather than the unfalsifiable "this week".
 */

export type Movement = {
  metricKey: string;
  current: number;
  previous: number;
  /** The date the comparison was made against. Always shown to the user. */
  previousAsOf: string;
  delta: number;
  /** null when the previous value was zero — see the SQL for why not 0. */
  deltaPct: number | null;
};

export type MovementReport = {
  movements: Movement[];
  /** False when there is no snapshot old enough to compare against. */
  haveHistory: boolean;
  /** Days of history actually available, so the UI can say "check back in N days". */
  daysOfHistory: number;
};

const EMPTY: MovementReport = { movements: [], haveHistory: false, daysOfHistory: 0 };

/**
 * @param minPct  Suppress movements smaller than this. A receivables figure
 *                that wobbles 0.4% because one invoice was raised is noise, and
 *                a weekly brief full of noise is a brief nobody reads.
 */
export async function getMovement(orgId: string, days = 7, minPct = 5): Promise<MovementReport> {
  if (!orgId) return EMPTY;
  const svc = serviceClient();
  if (!svc) return EMPTY;

  /*
    How much history exists, asked separately and FIRST.

    Without this, "no rows returned" is ambiguous between "nothing moved" and
    "we have never seen this workspace before", and those need opposite words
    on screen. Reporting the second as the first is the false reassurance above.
  */
  let daysOfHistory = 0;
  try {
    const { data } = await svc.from("metric_snapshots")
      .select("as_of").eq("org_id", orgId).order("as_of", { ascending: true }).limit(1);
    const first = (data as any[])?.[0]?.as_of;
    if (first) {
      const t = new Date(first).getTime();
      if (Number.isFinite(t)) daysOfHistory = Math.max(0, Math.round((Date.now() - t) / 86_400_000));
    }
  } catch {
    /* Table absent — the migration has not been applied. Say we have no
       history rather than inventing one; the caller renders "not yet". */
    return EMPTY;
  }

  if (daysOfHistory < days) return { ...EMPTY, daysOfHistory };

  try {
    const { data, error } = await svc.rpc("cortex_metric_movement", {
      p_org: orgId, p_days: days, p_min_pct: minPct,
    });
    if (error) return { ...EMPTY, daysOfHistory };
    const movements: Movement[] = ((data as any[]) || []).map((r) => ({
      metricKey: String(r.metric_key),
      current: Number(r.current_value) || 0,
      previous: Number(r.previous_value) || 0,
      previousAsOf: String(r.previous_as_of),
      delta: Number(r.delta) || 0,
      deltaPct: r.delta_pct === null || r.delta_pct === undefined ? null : Number(r.delta_pct),
    }));
    return { movements, haveHistory: true, daysOfHistory };
  } catch {
    return { ...EMPTY, daysOfHistory };
  }
}

/**
 * One movement as a sentence an owner can check.
 *
 * The date is not decoration. "Receivables are up 38% this week" cannot be
 * verified against anything; "up 38% since 28 August, from ₹12.4L to ₹17.1L"
 * can be checked against their own ledger in thirty seconds, and a number a
 * customer can check is the only kind worth showing them.
 */
export function describeMovement(m: Movement, label: string, unit?: string): string {
  const fmt = (n: number) =>
    unit === "INR" || unit === "₹" ? `₹${Math.round(n).toLocaleString("en-IN")}` : `${Math.round(n * 10) / 10}${unit ? " " + unit : ""}`;
  const dir = m.delta > 0 ? "up" : "down";
  const when = new Date(m.previousAsOf).toLocaleDateString("en-IN", { day: "numeric", month: "long" });
  const size = m.deltaPct === null
    ? `from ${fmt(m.previous)}`
    : `${Math.abs(m.deltaPct)}%`;
  return `${label} ${dir} ${size} since ${when} — ${fmt(m.previous)} to ${fmt(m.current)}.`;
}
