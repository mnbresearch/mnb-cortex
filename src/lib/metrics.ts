import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { emitQuietly } from "@/lib/webhooks";

/**
 * The aggregation layer.
 *
 * The dashboard KPI grid reads `health_metrics`, the revenue/profit/cash chart
 * reads `finance_ledger`, and getBusinessContext() — which feeds chat, Deep Dive,
 * Autopilot, reports and the weekly email — reads `health_metrics` too.
 *
 * Nothing used to write either table except the demo seeder, so a customer could
 * import thousands of rows and still see "No business data yet". This module
 * derives both tables from the data customers actually put in.
 *
 * Two hard rules:
 *  1. NEVER invent a number. A metric we cannot honestly compute is simply not
 *     emitted, so the dashboard shows fewer real KPIs rather than fabricated ones.
 *  2. Cheap enough to run inline after every write (a handful of indexed reads
 *     on one org), because on Vercel Hobby a cron can only run once a day and a
 *     customer must not wait until tomorrow to see their own data.
 */

type Row = Record<string, any>;

const MONTHS = 12;
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** First day of the month, N months back from this month, as YYYY-MM-DD. */
function monthStart(offset: number): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - offset, 1)).toISOString().slice(0, 10);
}
function monthKey(dateish: any): string {
  const d = new Date(dateish);
  if (!Number.isFinite(d.getTime())) return "";
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

type Metric = {
  metric_key: string; label: string; value: number; unit: string;
  delta_pct: number; status: "green" | "yellow" | "red"; trend: number[];
};

/** Percentage change, guarding divide-by-zero. */
function delta(now: number, prev: number): number {
  if (!prev) return 0;
  return +(((now - prev) / Math.abs(prev)) * 100).toFixed(1);
}

/** Pick a traffic light from thresholds. `higherIsBetter` flips the comparison. */
function band(value: number, warn: number, bad: number, higherIsBetter = true): "green" | "yellow" | "red" {
  if (higherIsBetter) return value >= warn ? "green" : value >= bad ? "yellow" : "red";
  return value <= warn ? "green" : value <= bad ? "yellow" : "red";
}

/**
 * Recompute `health_metrics` and `finance_ledger` for one workspace from its
 * real rows. Safe to call repeatedly; it fully replaces both tables for the org.
 */
export async function recomputeMetrics(orgId: string): Promise<{ ok: boolean; metrics: number; months: number; reason?: string }> {
  if (!orgId) return { ok: false, metrics: 0, months: 0, reason: "no org" };
  const svc = serviceClient();
  if (!svc) return { ok: false, metrics: 0, months: 0, reason: "service role not configured" };

  const since = monthStart(MONTHS - 1);

  let orders: Row[] = [], invoices: Row[] = [], items: Row[] = [], staff: Row[] = [], ledger: Row[] = [];
  try {
    const [so, iv, it, em, fl] = await Promise.all([
      svc.from("sales_orders").select("amount,status,order_date,created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20000),
      svc.from("invoices").select("amount,status,type,due_date,created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20000),
      svc.from("inventory_items").select("on_hand,unit_cost,daily_consumption,reorder_level").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20000),
      svc.from("employees").select("performance,attendance_pct,attrition_risk,monthly_ctc").eq("org_id", orgId).order("created_at", { ascending: false }).limit(5000),
      // Written by the bank-statement and GST readers — columns this function
      // does not own, but does derive metrics from.
      // Newest first, then reversed: the ledger grows a row per month forever,
      // so an ascending limit would eventually stop containing the current month.
      svc.from("finance_ledger").select("*").eq("org_id", orgId).order("period", { ascending: false }).limit(24),
    ]);
    orders = (so.data as Row[]) || []; invoices = (iv.data as Row[]) || [];
    items = (it.data as Row[]) || []; staff = (em.data as Row[]) || []; ledger = (((fl.data as Row[]) || []).slice().reverse());
  } catch (e: any) {
    return { ok: false, metrics: 0, months: 0, reason: e?.message };
  }

  const hasSales = orders.length > 0;
  const hasInvoices = invoices.length > 0;
  const hasStock = items.length > 0;
  const hasStaff = staff.length > 0;
  const cashRows = ledger.filter((r) => r.cash_balance !== null && r.cash_balance !== undefined);
  const gstRows = ledger.filter((r) => r.gst_turnover !== null && r.gst_turnover !== undefined);
  const hasBank = cashRows.length > 0;
  const hasGst = gstRows.length > 0;

  // Nothing to work from — clear the KPIs so a workspace that deleted its data
  // returns to an honest empty state instead of keeping stale numbers. The
  // ledger is left alone: bank and GST readings live there and aren't ours.
  if (!hasSales && !hasInvoices && !hasStock && !hasStaff && !hasBank && !hasGst) {
    try { await svc.from("health_metrics").delete().eq("org_id", orgId); } catch { /* best effort */ }
    return { ok: true, metrics: 0, months: 0, reason: "no source data" };
  }

  // ---- Monthly revenue series from won sales orders --------------------------
  const buckets: string[] = Array.from({ length: MONTHS }, (_, i) => monthStart(MONTHS - 1 - i));
  const revenueByMonth = new Map<string, number>(buckets.map((b) => [b, 0]));
  const ordersByMonth = new Map<string, number>(buckets.map((b) => [b, 0]));

  for (const o of orders) {
    // No explicit status = counted, but NOT as realised revenue. An imported
    // CSV with a blank status column must never inflate the revenue figure.
    const status = String(o.status || "").toLowerCase();
    if (status === "lost") continue;
    const k = monthKey(o.order_date || o.created_at);
    if (!k || !revenueByMonth.has(k)) continue;
    if (status === "won") revenueByMonth.set(k, revenueByMonth.get(k)! + num(o.amount));
    ordersByMonth.set(k, ordersByMonth.get(k)! + 1);
  }

  const thisMonth = buckets[buckets.length - 1];
  const lastMonth = buckets[buckets.length - 2];
  const revenueNow = revenueByMonth.get(thisMonth) || 0;
  const revenuePrev = revenueByMonth.get(lastMonth) || 0;
  const revTrend = buckets.slice(-7).map((b) => +(revenueByMonth.get(b) || 0).toFixed(0));

  // ---- Receivables / payables from invoices ----------------------------------
  const today = new Date().toISOString().slice(0, 10);
  let overdueRecv = 0, openRecv = 0, openPay = 0;
  for (const inv of invoices) {
    const amt = num(inv.amount);
    const status = String(inv.status || "pending").toLowerCase();
    const type = String(inv.type || "receivable").toLowerCase();
    if (status === "paid") continue;
    if (type === "payable") { openPay += amt; continue; }
    openRecv += amt;
    if (status === "overdue" || (inv.due_date && String(inv.due_date) < today)) overdueRecv += amt;
  }

  // ---- Inventory --------------------------------------------------------------
  let stockValue = 0, totalDaily = 0, totalOnHand = 0, belowReorder = 0;
  for (const it of items) {
    const onHand = num(it.on_hand);
    stockValue += onHand * num(it.unit_cost);
    totalDaily += num(it.daily_consumption);
    totalOnHand += onHand;
    if (num(it.reorder_level) > 0 && onHand < num(it.reorder_level)) belowReorder++;
  }
  const coverDays = totalDaily > 0 ? +(totalOnHand / totalDaily).toFixed(1) : null;

  // ---- People -----------------------------------------------------------------
  const avgPerf = hasStaff ? staff.reduce((a, e) => a + num(e.performance), 0) / staff.length : 0;
  const avgAttend = hasStaff ? staff.reduce((a, e) => a + num(e.attendance_pct), 0) / staff.length : 0;
  const avgAttrition = hasStaff ? staff.reduce((a, e) => a + num(e.attrition_risk), 0) / staff.length : 0;
  const payroll = staff.reduce((a, e) => a + num(e.monthly_ctc), 0);

  // ---- Assemble only the metrics we can honestly compute ----------------------
  const metrics: Metric[] = [];

  if (hasSales) {
    metrics.push({
      metric_key: "revenue", label: "Revenue (MTD)", value: +revenueNow.toFixed(0), unit: "INR",
      delta_pct: delta(revenueNow, revenuePrev),
      status: revenueNow >= revenuePrev ? "green" : revenueNow >= revenuePrev * 0.9 ? "yellow" : "red",
      trend: revTrend,
    });

    // Value, delta and sparkline must all describe the same population, or the
    // card reads "Open Orders: 40, +12%" where the 40 and the 12% are different
    // things. This one is "orders placed this month".
    const nowCount = ordersByMonth.get(thisMonth) || 0;
    const prevCount = ordersByMonth.get(lastMonth) || 0;
    metrics.push({
      metric_key: "orders", label: "Orders (MTD)", value: nowCount, unit: "count",
      delta_pct: delta(nowCount, prevCount),
      status: nowCount >= prevCount ? "green" : "yellow",
      trend: buckets.slice(-7).map((b) => ordersByMonth.get(b) || 0),
    });

    // Year-on-year growth, only when we actually have a comparable month.
    const yearAgo = buckets[0];
    const revYearAgo = revenueByMonth.get(yearAgo) || 0;
    if (revYearAgo > 0) {
      const growth = delta(revenueNow, revYearAgo);
      metrics.push({
        metric_key: "growth", label: "Growth Rate (YoY)", value: growth, unit: "%",
        delta_pct: growth, status: band(growth, 10, 0), trend: [],
      });
    }
  }

  if (hasInvoices) {
    metrics.push({
      metric_key: "receivables", label: "Receivables Overdue", value: +overdueRecv.toFixed(0), unit: "INR",
      delta_pct: 0,
      status: openRecv > 0 ? band((overdueRecv / openRecv) * 100, 10, 30, false) : "green",
      trend: [],
    });
  }

  if (hasInvoices || hasStock) {
    const wc = openRecv + stockValue - openPay;
    metrics.push({
      metric_key: "working_capital", label: "Working Capital", value: +wc.toFixed(0), unit: "INR",
      delta_pct: 0, status: wc >= 0 ? "green" : "red", trend: [],
    });
  }

  if (coverDays !== null) {
    metrics.push({
      metric_key: "inventory", label: "Inventory Cover", value: coverDays, unit: "days",
      delta_pct: 0, status: band(coverDays, 15, 7), trend: [],
    });
  }

  if (hasStaff) {
    if (avgPerf > 0) {
      const idx = +((avgPerf / 5) * 100).toFixed(0);
      metrics.push({
        metric_key: "productivity", label: "Employee Productivity", value: idx, unit: "index",
        delta_pct: 0, status: band(idx, 75, 55), trend: [],
      });
    }
    if (avgAttend > 0) {
      metrics.push({
        metric_key: "attendance", label: "Average Attendance", value: +avgAttend.toFixed(1), unit: "%",
        delta_pct: 0, status: band(avgAttend, 92, 85), trend: [],
      });
    }
  }

  // ---- Cash & runway, from a bank statement the owner uploaded ---------------
  if (hasBank) {
    const latest = cashRows[cashRows.length - 1];
    const closing = num(latest.cash_balance);
    const prev = cashRows.length > 1 ? num(cashRows[cashRows.length - 2].cash_balance) : 0;
    metrics.push({
      metric_key: "cash_balance", label: "Cash Balance", value: +closing.toFixed(0), unit: "INR",
      delta_pct: delta(closing, prev),
      status: closing > 0 ? (closing >= prev ? "green" : "yellow") : "red",
      trend: cashRows.slice(-7).map((r) => +num(r.cash_balance).toFixed(0)),
    });

    // Runway only when they are actually burning cash — a profitable month has
    // no runway to report, and printing a number there would be nonsense.
    const nets = cashRows.slice(-3).map((r) => num(r.net_profit));
    const avgNet = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0;
    if (avgNet < 0 && closing > 0) {
      const months = +(closing / Math.abs(avgNet)).toFixed(1);
      metrics.push({
        metric_key: "cash", label: "Cash Runway", value: months, unit: "months",
        delta_pct: 0, status: band(months, 6, 3), trend: [],
      });
    }
  }

  // ---- Filed GST turnover ------------------------------------------------------
  if (hasGst) {
    const latest = gstRows[gstRows.length - 1];
    const turnover = num(latest.gst_turnover);
    const prev = gstRows.length > 1 ? num(gstRows[gstRows.length - 2].gst_turnover) : 0;
    metrics.push({
      metric_key: "gst_turnover", label: "Turnover (last GST return)", value: +turnover.toFixed(0), unit: "INR",
      delta_pct: delta(turnover, prev),
      status: turnover >= prev ? "green" : "yellow",
      trend: gstRows.slice(-7).map((r) => +num(r.gst_turnover).toFixed(0)),
    });
  }

  // Composite risk from the signals we genuinely have. Only emitted when at
  // least one component is measurable, and the label says what fed it.
  const riskParts: number[] = [];
  if (openRecv > 0) riskParts.push(Math.min(100, (overdueRecv / openRecv) * 100));
  if (items.length) riskParts.push(Math.min(100, (belowReorder / items.length) * 100));
  if (hasStaff) riskParts.push(Math.min(100, avgAttrition * 100));
  if (riskParts.length) {
    const risk = +(riskParts.reduce((a, b) => a + b, 0) / riskParts.length).toFixed(0);
    metrics.push({
      metric_key: "risk", label: "Risk Score", value: risk, unit: "score",
      delta_pct: 0, status: band(risk, 25, 50, false), trend: [],
    });
  }

  // ---- Write health_metrics ----------------------------------------------------
  // Insert the new rows BEFORE deleting the old ones. A delete-then-insert
  // leaves a window where the workspace has zero metrics, and this now runs on
  // every write — a concurrent dashboard render would flash "No business data
  // yet" and the AI would be handed an empty snapshot.
  const stamp = new Date().toISOString();
  try {
    if (metrics.length) {
      const { error } = await svc.from("health_metrics")
        .insert(metrics.map((m) => ({ ...m, org_id: orgId, as_of: today, created_at: stamp })));
      if (error) return { ok: false, metrics: 0, months: 0, reason: error.message };
    }
    await svc.from("health_metrics").delete().eq("org_id", orgId).lt("created_at", stamp);
  } catch (e: any) {
    return { ok: false, metrics: 0, months: 0, reason: e?.message };
  }

  // ---- Write finance_ledger ----------------------------------------------------
  // UPSERT on (org_id, period) with ONLY the columns this function owns. The
  // bank reader owns cash_balance/net_profit and the GST reader owns
  // gst_turnover/gst_tax — a delete-and-reinsert here would silently destroy a
  // paid analysis the customer had already run.
  const rows = buckets.map((period) => ({
    org_id: orgId,
    period,
    revenue: +(revenueByMonth.get(period) || 0).toFixed(0),
    receivables: period === thisMonth ? +openRecv.toFixed(0) : 0,
    payables: period === thisMonth ? +openPay.toFixed(0) : 0,
    opex: period === thisMonth ? +payroll.toFixed(0) : 0,
  }));

  let months = 0;
  if (hasSales || hasInvoices) {
    try {
      const { error } = await svc.from("finance_ledger").upsert(rows, { onConflict: "org_id,period" });
      if (!error) months = rows.length;
    } catch { /* the chart is secondary to the KPIs — don't fail the recompute */ }
  }

  emitQuietly(orgId, "metrics.recomputed", {
    org_id: orgId,
    metrics: metrics.map((m) => ({ key: m.metric_key, label: m.label, value: m.value, unit: m.unit, status: m.status })),
  });
  return { ok: true, metrics: metrics.length, months };
}

/**
 * Wrapper for write paths. Awaited (so the page that triggered it renders fresh
 * KPIs), but never throws — a failed recompute must not break the import or save
 * that caused it, and the daily sweep will catch it.
 */
export async function recomputeQuietly(orgId: string | null | undefined): Promise<void> {
  if (!orgId) return;
  try { await recomputeMetrics(orgId); } catch { /* swept nightly */ }
}
