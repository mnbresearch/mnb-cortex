import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { deriveInsights } from "@/lib/insights";
import { evaluateRules } from "@/lib/alert-rules";
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

/** What cortex_aggregate() returns. Mirrors the SQL exactly. */
type Aggregate = {
  series: { period: string; revenue: number; orders: number }[];
  ordersUnset: number; salesCount: number;
  openRecv: number; overdueRecv: number; openPay: number;
  invoiceCount: number; poCount: number;
  stockValue: number; totalDaily: number; totalOnHand: number; belowReorder: number; itemCount: number;
  avgPerf: number; avgAttend: number; avgAttrition: number; payroll: number; staffCount: number;
};

/**
 * Try the in-database aggregate. Returns null when the function does not exist
 * (migration not run) or errors, so the caller falls back to reading rows.
 *
 * Deliberately silent about a MISSING function and loud about anything else:
 * "not migrated yet" is an expected deployment state, while a genuine SQL error
 * would otherwise hide behind the fallback and never be noticed.
 */
async function tryAggregate(svc: any, orgId: string): Promise<Aggregate | null> {
  try {
    const { data, error } = await svc.rpc("cortex_aggregate", { p_org: orgId });
    if (error) {
      const missing = /could not find the function|does not exist|schema cache/i.test(error.message || "");
      if (!missing) console.error("[metrics] cortex_aggregate failed, using the slow path:", error.message);
      return null;
    }
    if (!data || typeof data !== "object") return null;
    const a = data as any;
    return {
      series: Array.isArray(a.series) ? a.series.map((r: any) => ({
        period: String(r.period), revenue: num(r.revenue), orders: num(r.orders),
      })) : [],
      ordersUnset: num(a.ordersUnset), salesCount: num(a.salesCount),
      openRecv: num(a.openRecv), overdueRecv: num(a.overdueRecv), openPay: num(a.openPay),
      invoiceCount: num(a.invoiceCount), poCount: num(a.poCount),
      stockValue: num(a.stockValue), totalDaily: num(a.totalDaily), totalOnHand: num(a.totalOnHand),
      belowReorder: num(a.belowReorder), itemCount: num(a.itemCount),
      avgPerf: num(a.avgPerf), avgAttend: num(a.avgAttend), avgAttrition: num(a.avgAttrition),
      payroll: num(a.payroll), staffCount: num(a.staffCount),
    };
  } catch { return null; }
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

  /*
    FAST PATH. cortex_aggregate() does all the summing inside Postgres and
    returns a few hundred bytes. The slow path below pulls up to 20,000 rows per
    table into this process — on EVERY write — which is O(total rows) work to
    record one new invoice, and O(n²) bytes when a customer adds rows one at a
    time through the UI.

    The slow path is kept, not deleted: a database that has not run
    2026_tenancy_aggregate.sql yet must keep working exactly as before rather
    than silently producing no metrics. scripts/test-aggregate.mjs checks the
    two agree.
  */
  const agg = await tryAggregate(svc, orgId);

  let orders: Row[] = [], invoices: Row[] = [], items: Row[] = [], staff: Row[] = [], pos: Row[] = [], ledger: Row[] = [];
  try {
    const [so, iv, it, em, po, fl] = await Promise.all([
      agg ? Promise.resolve({ data: [] as Row[] }) : svc.from("sales_orders").select("amount,status,order_date,created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20000),
      agg ? Promise.resolve({ data: [] as Row[] }) : svc.from("invoices").select("amount,status,type,due_date,created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20000),
      agg ? Promise.resolve({ data: [] as Row[] }) : svc.from("inventory_items").select("on_hand,unit_cost,daily_consumption,reorder_level").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20000),
      agg ? Promise.resolve({ data: [] as Row[] }) : svc.from("employees").select("performance,attendance_pct,attrition_risk,monthly_ctc").eq("org_id", orgId).order("created_at", { ascending: false }).limit(5000),
      // Approved purchase orders are money owed. Payables were computed only
      // from invoices, so a ₹14 L PO never reached Working Capital and
      // disappeared from Approvals the moment it was approved.
      agg ? Promise.resolve({ data: [] as Row[] }) : svc.from("purchase_orders").select("amount,status,created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20000),
      // Written by the bank-statement and GST readers — columns this function
      // does not own, but does derive metrics from.
      // Newest first, then reversed: the ledger grows a row per month forever,
      // so an ascending limit would eventually stop containing the current month.
      svc.from("finance_ledger").select("*").eq("org_id", orgId).order("period", { ascending: false }).limit(24),
    ]);
    orders = (so.data as Row[]) || []; invoices = (iv.data as Row[]) || [];
    items = (it.data as Row[]) || []; staff = (em.data as Row[]) || []; pos = (po.data as Row[]) || [];
    ledger = (((fl.data as Row[]) || []).slice().reverse());
  } catch (e: any) {
    return { ok: false, metrics: 0, months: 0, reason: e?.message };
  }

  const hasSales = agg ? agg.salesCount > 0 : orders.length > 0;
  const hasInvoices = agg ? agg.invoiceCount > 0 : invoices.length > 0;
  const hasStock = agg ? agg.itemCount > 0 : items.length > 0;
  const hasStaff = agg ? agg.staffCount > 0 : staff.length > 0;
  const hasPOs = agg ? agg.poCount > 0 : pos.length > 0;
  const cashRows = ledger.filter((r) => r.cash_balance !== null && r.cash_balance !== undefined);
  const gstRows = ledger.filter((r) => r.gst_turnover !== null && r.gst_turnover !== undefined);
  const hasBank = cashRows.length > 0;
  const hasGst = gstRows.length > 0;

  // Nothing to work from — clear the KPIs so a workspace that deleted its data
  // returns to an honest empty state instead of keeping stale numbers.
  if (!hasSales && !hasInvoices && !hasStock && !hasStaff && !hasPOs && !hasBank && !hasGst) {
    try { await svc.from("health_metrics").delete().eq("org_id", orgId); } catch { /* best effort */ }
    // The ledger rows are NOT deleted — bank and GST readings live there and
    // aren't ours to destroy — but the columns this function owns must be
    // zeroed. Leaving them was visible in production: the dashboard printed
    // "No business data yet" directly above a revenue line still plotting the
    // deleted orders, because clearing health_metrics doesn't touch the chart's
    // source.
    try {
      await svc.from("finance_ledger")
        .update({ revenue: 0, receivables: 0, payables: 0, opex: 0 })
        .eq("org_id", orgId);
    } catch { /* best effort */ }
    return { ok: true, metrics: 0, months: 0, reason: "no source data" };
  }

  // ---- Monthly revenue series from won sales orders --------------------------
  const buckets: string[] = Array.from({ length: MONTHS }, (_, i) => monthStart(MONTHS - 1 - i));
  const revenueByMonth = new Map<string, number>(buckets.map((b) => [b, 0]));
  const ordersByMonth = new Map<string, number>(buckets.map((b) => [b, 0]));

  // Counted so the workspace can be TOLD why revenue looks low. Silently
  // dropping these from revenue is correct; leaving the owner to guess why
  // "Orders (MTD): 500" sits beside "Revenue (MTD): ₹0" is not.
  let ordersUnset = 0;

  if (agg) {
    for (const r of agg.series) {
      if (revenueByMonth.has(r.period)) {
        revenueByMonth.set(r.period, r.revenue);
        ordersByMonth.set(r.period, r.orders);
      }
    }
    ordersUnset = agg.ordersUnset;
  } else
  for (const o of orders) {
    // No explicit status = counted, but NOT as realised revenue. An imported
    // CSV with a blank status column must never inflate the revenue figure.
    const status = String(o.status || "").toLowerCase();
    if (status === "lost") continue;
    const k = monthKey(o.order_date || o.created_at);
    if (!k || !revenueByMonth.has(k)) continue;
    if (status === "won") revenueByMonth.set(k, revenueByMonth.get(k)! + num(o.amount));
    else if (!status) ordersUnset++;
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
  if (agg) { overdueRecv = agg.overdueRecv; openRecv = agg.openRecv; openPay = agg.openPay; } else
  for (const inv of invoices) {
    const amt = num(inv.amount);
    const status = String(inv.status || "pending").toLowerCase();
    const type = String(inv.type || "receivable").toLowerCase();
    if (status === "paid") continue;
    if (type === "payable") { openPay += amt; continue; }
    openRecv += amt;
    if (status === "overdue" || (inv.due_date && String(inv.due_date) < today)) overdueRecv += amt;
  }

  // A purchase order that has been sent or received is a commitment to pay,
  // whether or not the supplier's invoice has arrived yet. Drafts are not:
  // they are a suggestion the owner has not acted on.
  if (!agg) for (const po of pos) {
    const st = String(po.status || "").toLowerCase();
    if (st === "sent" || st === "received" || st === "approved") openPay += num(po.amount);
  }

  // ---- Inventory --------------------------------------------------------------
  let stockValue = 0, totalDaily = 0, totalOnHand = 0, belowReorder = 0;
  if (agg) {
    stockValue = agg.stockValue; totalDaily = agg.totalDaily;
    totalOnHand = agg.totalOnHand; belowReorder = agg.belowReorder;
  } else
  for (const it of items) {
    const onHand = num(it.on_hand);
    stockValue += onHand * num(it.unit_cost);
    totalDaily += num(it.daily_consumption);
    totalOnHand += onHand;
    if (num(it.reorder_level) > 0 && onHand < num(it.reorder_level)) belowReorder++;
  }
  const coverDays = totalDaily > 0 ? +(totalOnHand / totalDaily).toFixed(1) : null;
  const itemCount = agg ? agg.itemCount : items.length;

  // ---- People -----------------------------------------------------------------
  const avgPerf = agg ? agg.avgPerf : (hasStaff ? staff.reduce((a, e) => a + num(e.performance), 0) / staff.length : 0);
  const avgAttend = agg ? agg.avgAttend : (hasStaff ? staff.reduce((a, e) => a + num(e.attendance_pct), 0) / staff.length : 0);
  const avgAttrition = agg ? agg.avgAttrition : (hasStaff ? staff.reduce((a, e) => a + num(e.attrition_risk), 0) / staff.length : 0);
  const payroll = agg ? agg.payroll : staff.reduce((a, e) => a + num(e.monthly_ctc), 0);

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

  if (hasInvoices || hasStock || hasPOs) {
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
  if (itemCount) riskParts.push(Math.min(100, (belowReorder / itemCount) * 100));
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
      // UPSERT, because 2026_alert_dismiss.sql adds a unique index on
      // (org_id, metric_key) to stop concurrent recomputes duplicating KPI
      // cards. A plain insert would now fail on every recompute after the
      // first. created_at is refreshed to `stamp`, so the stale-delete below
      // still removes only metrics this run did not produce.
      const { error } = await svc.from("health_metrics")
        .upsert(metrics.map((m) => ({ ...m, org_id: orgId, as_of: today, created_at: stamp })),
                { onConflict: "org_id,metric_key" });
      if (error) return { ok: false, metrics: 0, months: 0, reason: error.message };
    }
    // Leave demo rows alone. seedDemoData writes a curated set of KPIs
    // (including csat, net_profit and gross_margin, which this function never
    // derives) and then recomputes — so without this the sample data destroyed
    // its own headline numbers inside the same request that created them.
    await svc.from("health_metrics").delete().eq("org_id", orgId).lt("created_at", stamp).eq("is_demo", false);
  } catch (e: any) {
    return { ok: false, metrics: 0, months: 0, reason: e?.message };
  }

  // ---- Evaluate the workspace's alert rules ------------------------------------
  // This runs here, rather than in the browser, because that is the difference
  // between "warned the moment a number crosses your line" and "warned if you
  // happen to have the alerts tab open in the browser that holds the rule".
  try {
    const { data: ruleRows } = await svc.from("alert_rules").select("*").eq("org_id", orgId).eq("enabled", true);
    const rules = (ruleRows as any[]) || [];
    if (rules.length) {
      const breaches = evaluateRules(
        rules.map((r) => ({ id: r.id, metric_key: r.metric_key, op: r.op, threshold: Number(r.threshold), enabled: r.enabled })),
        metrics.map((m) => ({ metric_key: m.metric_key, label: m.label, value: Number(m.value), unit: m.unit })),
      );

      // One OPEN alert per rule. Without this, a rule that stays breached would
      // mint a fresh alert on every single save — and a customer who saved
      // twenty rows would find twenty identical warnings and stop reading them.
      // One read, not two. This block runs after EVERY write, so each extra
      // serial round trip is paid on every row a customer saves.
      const { data: alertRows } = await svc.from("alerts")
        .select("rule_id,is_read,dismissed_at").eq("org_id", orgId).not("rule_id", "is", null);
      const all = (alertRows as any[]) || [];

      const alreadyOpen = new Set(all.filter((a) => !a.is_read).map((a) => String(a.rule_id)));

      // A rule the human has DISMISSED while it is still breached must stay
      // quiet. Reading only is_read=false made a dismissed alert look absent,
      // so the very next save re-raised it — indistinguishable, from the
      // owner's side, from a Dismiss button that does not work. It stays
      // suppressed until the rule recovers and breaches again.
      const dismissed = new Set(all.filter((a) => a.dismissed_at).map((a) => String(a.rule_id)));

      const fresh = breaches.filter((b) => !alreadyOpen.has(String(b.rule.id)) && !dismissed.has(String(b.rule.id)));
      if (fresh.length) {
        // Upsert, not insert: two concurrent saves could both find nothing
        // open and both write. The partial unique index on
        // (org_id, rule_id) where is_read = false turns that race into a
        // no-op instead of two identical warnings.
        await svc.from("alerts").upsert(fresh.map((b) => ({
          org_id: orgId,
          rule_id: b.rule.id,
          severity: b.severity,
          title: b.title,
          body: b.body,
          module: "kpi",
        })), { onConflict: "org_id,rule_id", ignoreDuplicates: true });
      }

      // A rule that is no longer breached closes its own alert, so the bell
      // reflects what is true now rather than everything that ever went wrong.
      const stillBreached = new Set(breaches.map((b) => String(b.rule.id)));
      const toClose = [...alreadyOpen].filter((id) => !stillBreached.has(id));
      if (toClose.length) {
        await svc.from("alerts").update({ is_read: true })
          .eq("org_id", orgId).eq("is_read", false).in("rule_id", toClose);
      }
      // Recovery also clears the dismissal, so if the number goes bad again
      // later the owner is told — a dismissal silences THIS episode, not the
      // metric for ever.
      const recovered = [...dismissed].filter((id) => !stillBreached.has(id));
      if (recovered.length) {
        await svc.from("alerts").update({ dismissed_at: null, is_read: true })
          .eq("org_id", orgId).in("rule_id", recovered);
      }
    }
  } catch { /* alerting must never break the save that triggered it */ }

  // ---- Write ai_insights --------------------------------------------------------
  // Same insert-then-delete-stale ordering as health_metrics above, for the same
  // reason: a delete-first leaves a window where the dashboard panel and the AI
  // context both see zero insights.
  try {
    const cashLatest = hasBank ? num(cashRows[cashRows.length - 1].cash_balance) : 0;
    const nets = hasBank ? cashRows.slice(-3).map((r) => num(r.net_profit)) : [];
    const avgNet = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0;

    const derived = deriveInsights({
      hasSales, hasInvoices, hasStock, hasStaff, hasBank,
      revenueNow, revenuePrev,
      ordersNow: ordersByMonth.get(thisMonth) || 0,
      ordersUnset,
      openRecv, overdueRecv, openPay,
      itemCount, belowReorder, coverDays, stockValue,
      avgAttrition, avgAttend, payroll,
      cashClosing: cashLatest, avgNet,
    });

    const istamp = new Date().toISOString();
    if (derived.length) {
      await svc.from("ai_insights").insert(derived.map((d) => ({
        org_id: orgId,
        module: d.module,
        severity: d.severity,
        title: d.title,
        detail: d.detail,
        confidence: d.confidence,
        recommended_actions: d.recommended_actions,
        created_at: istamp,
      })));
    }
    // Clear the previous generation whether or not there are new ones — a
    // workspace that fixed everything should end up with an empty panel, not
    // last week's warnings.
    await svc.from("ai_insights").delete().eq("org_id", orgId).lt("created_at", istamp).eq("is_demo", false);
  } catch { /* insights are advisory; never fail a save over them */ }

  // ---- Write finance_ledger ----------------------------------------------------
  // UPSERT on (org_id, period) with ONLY the columns this function owns. The
  // bank reader owns cash_balance/net_profit and the GST reader owns
  // gst_turnover/gst_tax — a delete-and-reinsert here would silently destroy a
  // paid analysis the customer had already run.
  /*
    Receivables, payables and opex are point-in-time positions — we know what is
    outstanding NOW, not what was outstanding last March. Writing a hard 0 for
    the other eleven months was destroying that history on every single save:
    March's genuine receivables snapshot was overwritten with 0 the next time
    anyone added a row, for ever.

    Not currently visible (the chart reads revenue/net_profit/cash_balance), but
    it silently made a receivables or payables trend impossible to ever build —
    the data was being erased before it could accumulate.

    Two separate upserts rather than one array with different keys per row:
    PostgREST takes the UNION of keys across the payload and fills the missing
    ones with null, so a heterogeneous array would have replaced "wiped to 0"
    with "wiped to null" — the same bug wearing a different hat.
  */

  // 1. Revenue, for all twelve months. This IS recomputed every time, because it
  //    is derived from orders that can be edited or deleted.
  const revenueRows = buckets.map((period) => ({
    org_id: orgId,
    period,
    revenue: +(revenueByMonth.get(period) || 0).toFixed(0),
  }));

  // 2. The point-in-time positions, for the current month only. Past months keep
  //    whatever was true when they were current.
  const positionRow = {
    org_id: orgId,
    period: thisMonth,
    receivables: +openRecv.toFixed(0),
    payables: +openPay.toFixed(0),
    opex: +payroll.toFixed(0),
  };

  // Written UNCONDITIONALLY. Guarding this on `hasSales || hasInvoices` meant a
  // workspace that deleted its sales orders kept the old revenue in the ledger
  // for ever, so the trend chart went on plotting figures nothing else in the
  // app still believed. `revenueRows` already carries zeros in that case, and
  // the upsert only touches the columns this function owns, so a bank or GST
  // analysis is unaffected either way.
  let months = 0;
  try {
    const { error } = await svc.from("finance_ledger").upsert(revenueRows, { onConflict: "org_id,period" });
    if (!error) months = revenueRows.length;
    await svc.from("finance_ledger").upsert([positionRow], { onConflict: "org_id,period" });
  } catch { /* the chart is secondary to the KPIs — don't fail the recompute */ }

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
  try {
    const res = await recomputeMetrics(orgId);
    // Swallowing the reason is right for the CALLER — a failed recompute must
    // not break the import or save that triggered it. But swallowing it
    // everywhere is how a misconfigured service role became invisible: the
    // customer added rows, the KPIs never moved, and nothing anywhere said
    // why. Recording it lets /api/health and the dashboard tell the truth.
    if (!res.ok) await noteRecomputeFailure(orgId, res.reason || "unknown");
    else await clearRecomputeFailure(orgId);
  } catch (e: any) {
    await noteRecomputeFailure(orgId, e?.message || "unknown");
  }
}

/**
 * Last aggregation failure for a workspace, so the UI can explain an empty
 * dashboard instead of implying the customer has no data.
 *
 * Stored in app_settings rather than thrown, because the write that triggered
 * the recompute genuinely did succeed — the row is saved, it is only the
 * derived numbers that are missing.
 */
const RECOMPUTE_KEY = "recompute_error";

async function noteRecomputeFailure(orgId: string, reason: string): Promise<void> {
  try {
    const svc = serviceClient();
    if (!svc) return;   // nowhere to record it; /api/health reports this case
    await svc.from("app_settings").upsert(
      { org_id: orgId, key: RECOMPUTE_KEY, value: JSON.stringify({ at: new Date().toISOString(), reason }) },
      { onConflict: "org_id,key" },
    );
  } catch { /* never let the diagnostic itself break a save */ }
}

async function clearRecomputeFailure(orgId: string): Promise<void> {
  try {
    const svc = serviceClient();
    if (!svc) return;
    await svc.from("app_settings").delete().eq("org_id", orgId).eq("key", RECOMPUTE_KEY);
  } catch { /* best effort */ }
}

/** What the dashboard should warn about, if anything. Null when healthy. */
export async function getRecomputeFailure(orgId: string | null | undefined): Promise<{ at: string; reason: string } | null> {
  if (!orgId) return null;
  try {
    const svc = serviceClient();
    // No service role at all is itself the most common cause, and it is the one
    // case we cannot have recorded — so report it directly.
    if (!svc) return { at: new Date().toISOString(), reason: "service role not configured" };
    const { data } = await svc.from("app_settings").select("value")
      .eq("org_id", orgId).eq("key", RECOMPUTE_KEY).maybeSingle();
    if (!data?.value) return null;
    const parsed = JSON.parse(String((data as any).value));
    return { at: String(parsed.at || ""), reason: String(parsed.reason || "unknown") };
  } catch { return null; }
}
