/**
 * Derive the workspace's insights from signals already computed by
 * recomputeMetrics().
 *
 * WHY THIS EXISTS: `ai_insights` was read in three places — the dashboard's
 * "AI Insights & recommended actions" panel, every module page, and the
 * business-context block handed to the AI — and written in exactly one place:
 * supabase/seed.sql, the demo seeder. So the feature looked alive in a demo
 * workspace and was permanently, silently empty for every real paying
 * customer, and the AI was handed a literal `ACTIVE INSIGHTS:` header with
 * nothing under it.
 *
 * DELIBERATELY NOT AI-GENERATED. These are the observations that must be
 * correct every single time — "₹4.2 L is overdue", "nine SKUs are below
 * reorder level". A model can phrase those beautifully and occasionally get
 * the number wrong, and a wrong number on a finance dashboard is worse than no
 * insight at all. It also costs nothing, needs no key, and cannot rate-limit.
 * The language model's job is the conversation on top of these facts, not the
 * facts.
 *
 * No file/network imports on purpose, so this is unit-testable in isolation.
 */

export type Severity = "green" | "yellow" | "red";

export type DerivedInsight = {
  module: string;
  severity: Severity;
  title: string;
  detail: string;
  confidence: number;
  recommended_actions: string[];
};

/** Everything recomputeMetrics() already has in hand when it calls this. */
export type InsightSignals = {
  hasSales: boolean;
  hasInvoices: boolean;
  hasStock: boolean;
  hasStaff: boolean;
  hasBank: boolean;

  revenueNow: number;
  revenuePrev: number;
  ordersNow: number;
  /** Orders in the window with no status set — these contribute 0 revenue. */
  ordersUnset: number;

  openRecv: number;
  overdueRecv: number;
  openPay: number;

  itemCount: number;
  belowReorder: number;
  coverDays: number | null;
  stockValue: number;

  avgAttrition: number;
  avgAttend: number;
  payroll: number;

  cashClosing: number;
  /** Mean net profit over the last few months; negative means burning. */
  avgNet: number;
};

/** Indian-format money, short enough to sit in a card. */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(a)}`;
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * Pure, deterministic. Returns at most `limit` insights, worst first, so the
 * dashboard panel shows what actually matters rather than the first thing that
 * happened to be computed.
 */
export function deriveInsights(s: InsightSignals, limit = 8): DerivedInsight[] {
  const out: DerivedInsight[] = [];

  /* ---- Receivables ------------------------------------------------------- */
  if (s.hasInvoices && s.overdueRecv > 0) {
    const share = pct(s.overdueRecv, s.openRecv);
    out.push({
      module: "finance",
      severity: share >= 30 ? "red" : share >= 10 ? "yellow" : "green",
      title: `${inrShort(s.overdueRecv)} of receivables is past its due date`,
      detail: `That is ${share.toFixed(0)}% of the ${inrShort(s.openRecv)} you are owed. Overdue money is the cheapest cash you will ever raise — it is already yours, and collecting it costs no interest and no equity.`,
      confidence: 0.99,
      recommended_actions: [
        "Open Receivables and sort by days overdue",
        "Send reminders on anything past 45 days",
        "Call the largest single overdue account today",
      ],
    });
  }

  /* ---- Payables outweighing receivables ---------------------------------- */
  if (s.hasInvoices && s.openPay > 0 && s.openPay > s.openRecv) {
    const gap = s.openPay - s.openRecv;
    out.push({
      module: "finance",
      severity: gap > s.openRecv ? "red" : "yellow",
      title: `You owe ${inrShort(gap)} more than you are owed`,
      detail: `Payables of ${inrShort(s.openPay)} against receivables of ${inrShort(s.openRecv)}. If the timing of those two does not line up, a profitable month can still miss payroll.`,
      confidence: 0.95,
      recommended_actions: [
        "Check which payables can move to next month without a penalty",
        "Chase receivables due before your largest payable",
      ],
    });
  }

  /* ---- Cash runway ------------------------------------------------------- */
  if (s.hasBank && s.avgNet < 0 && s.cashClosing > 0) {
    const months = s.cashClosing / Math.abs(s.avgNet);
    out.push({
      module: "finance",
      severity: months < 3 ? "red" : months < 6 ? "yellow" : "green",
      title: `About ${months.toFixed(1)} months of cash left at the current burn`,
      detail: `Closing balance ${inrShort(s.cashClosing)} against an average monthly loss of ${inrShort(Math.abs(s.avgNet))}. This assumes the burn stays flat, which it rarely does.`,
      confidence: 0.85,
      recommended_actions: months < 6
        ? ["Model a 20% cost reduction in Runway", "Decide the date by which you need funding or profitability"]
        : ["Keep watching monthly — this is comfortable but not permanent"],
    });
  }

  /* ---- Revenue direction -------------------------------------------------- */
  if (s.hasSales && s.revenuePrev > 0) {
    const change = ((s.revenueNow - s.revenuePrev) / s.revenuePrev) * 100;
    if (change <= -10) {
      out.push({
        module: "sales",
        severity: change <= -25 ? "red" : "yellow",
        title: `Revenue is down ${Math.abs(change).toFixed(0)}% on last month`,
        detail: `${inrShort(s.revenueNow)} so far this month against ${inrShort(s.revenuePrev)} last month. Part of this may simply be that the month is not over.`,
        confidence: 0.8,
        recommended_actions: [
          "Compare against the same month last year, not just last month",
          "Check whether a large order slipped rather than disappeared",
        ],
      });
    } else if (change >= 20) {
      out.push({
        module: "sales",
        severity: "green",
        title: `Revenue is up ${change.toFixed(0)}% on last month`,
        detail: `${inrShort(s.revenueNow)} against ${inrShort(s.revenuePrev)}. Worth knowing whether this is one large order or broad-based before you plan around it.`,
        confidence: 0.8,
        recommended_actions: ["Check whether stock and staffing can hold this level"],
      });
    }
  }

  /* ---- Orders recorded but not counted as revenue ------------------------- */
  // This one exists because the failure is invisible otherwise: an import
  // without a status column produces "Orders (MTD): 500" beside "Revenue: ₹0",
  // and nothing anywhere tells the owner why.
  if (s.hasSales && s.ordersUnset > 0) {
    out.push({
      module: "sales",
      severity: s.revenueNow === 0 && s.ordersUnset >= s.ordersNow ? "red" : "yellow",
      title: `${s.ordersUnset} order${s.ordersUnset === 1 ? "" : "s"} not counted in revenue`,
      detail: `They have no status set, so Cortex records them as orders but not as money earned — that is why revenue can read lower than you expect. Orders only count once marked "won".`,
      confidence: 1,
      recommended_actions: [
        "Open Sales and set the status on those orders",
        "If importing, include a status column so this does not recur",
      ],
    });
  }

  /* ---- Stock -------------------------------------------------------------- */
  if (s.hasStock && s.belowReorder > 0) {
    const share = pct(s.belowReorder, s.itemCount);
    out.push({
      module: "production",
      severity: share >= 25 ? "red" : "yellow",
      title: `${s.belowReorder} of ${s.itemCount} items are below reorder level`,
      detail: `A stockout costs you the sale and the customer's patience, and usually shows up as an urgent, expensive purchase two weeks later.`,
      confidence: 0.98,
      recommended_actions: [
        "Open Reorder to see which items and how many days of cover remain",
        "Raise purchase orders for anything under a week of cover",
      ],
    });
  }

  if (s.hasStock && s.coverDays !== null && s.coverDays < 15) {
    out.push({
      module: "production",
      severity: s.coverDays < 7 ? "red" : "yellow",
      title: `Only ${s.coverDays.toFixed(1)} days of inventory cover`,
      detail: `Across all items, at the current rate of consumption. If your supplier lead time is longer than this, you are already late ordering.`,
      confidence: 0.9,
      recommended_actions: ["Compare cover against your supplier lead times"],
    });
  }

  /* ---- People ------------------------------------------------------------- */
  if (s.hasStaff && s.avgAttrition >= 0.2) {
    out.push({
      module: "hr",
      severity: s.avgAttrition >= 0.35 ? "red" : "yellow",
      title: `Average attrition risk is ${(s.avgAttrition * 100).toFixed(0)}%`,
      detail: `Replacing someone typically costs several months of their salary once you count hiring, notice period and the time to get productive. Your monthly payroll is ${inrShort(s.payroll)}.`,
      confidence: 0.7,
      recommended_actions: [
        "Open Workforce and look at who is flagged highest",
        "Have the conversation before the resignation, not after",
      ],
    });
  }

  if (s.hasStaff && s.avgAttend > 0 && s.avgAttend < 85) {
    out.push({
      module: "hr",
      severity: s.avgAttend < 75 ? "red" : "yellow",
      title: `Average attendance is ${s.avgAttend.toFixed(1)}%`,
      detail: `Below roughly 85%, schedules start slipping and overtime quietly replaces the missing hours at a higher cost.`,
      confidence: 0.75,
      recommended_actions: ["Check whether absence is concentrated in one team or shift"],
    });
  }

  /* ---- Working capital ---------------------------------------------------- */
  if (s.hasInvoices || s.hasStock) {
    const wc = s.openRecv + s.stockValue - s.openPay;
    if (wc < 0) {
      out.push({
        module: "finance",
        severity: "red",
        title: `Working capital is negative at ${inrShort(wc)}`,
        detail: `Receivables plus stock do not cover what you owe. This is survivable while collections are reliable and dangerous the moment one large customer is late.`,
        confidence: 0.9,
        recommended_actions: [
          "Identify your single largest payable and its due date",
          "Accelerate collection on anything already overdue",
        ],
      });
    }
  }

  const rank: Record<Severity, number> = { red: 0, yellow: 1, green: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, limit);
}
