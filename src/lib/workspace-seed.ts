import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserAndOrg } from "@/lib/data";
import { EMPTY_SEED, type WorkspaceSeed } from "@/lib/seed-types";

export { EMPTY_SEED, type WorkspaceSeed };

/**
 * The workspace's own figures, for the calculators that were asking the owner
 * to type them in.
 *
 * ============================================================================
 * THE PROBLEM THIS EXISTS FOR
 * ============================================================================
 *
 * A census of all 132 modules found roughly twenty pages of the same shape:
 * a correct, well-tested piece of arithmetic wrapped around `useState` values
 * that were invented. /ccc told the owner "Roughly ₹52,05,479 is tied up in
 * your cycle" from a receivables figure, a payables figure and an inventory
 * figure that were all made up — while `invoices` and `inventory_items` sat in
 * the database one query away. /ratios rendered a banker-grade report on a
 * company that does not exist. /runway asked for a bank balance that Cortex had
 * already extracted from a statement.
 *
 * None of those pages is broken. Each is an engine with no fuel line.
 *
 * components/example-figures.tsx was built to distinguish the two honest
 * states — `source="example"` (invented) and `source="yours"` (seeded from the
 * workspace) — and the `"yours"` branch had never been used anywhere, because
 * nothing ever produced a seed. This module is the missing half.
 *
 * ============================================================================
 * WHY THIS DOES NOT READ THE KPI TABLE FOR MONEY
 * ============================================================================
 *
 * `health_metrics` is the obvious place to get these figures and it is the
 * wrong one. It is a display bag: one row per (org_id, metric_key), each with
 * its own `unit`, labelled for a dashboard card rather than for arithmetic.
 * Three of its keys read like the fields a calculator wants and are not:
 *
 *   metric_key      label                        unit     what it is NOT
 *   ------------    -------------------------    -----    ------------------------
 *   inventory       "Inventory Cover"            days     not a rupee stock value
 *   receivables     "Receivables past due"       INR      not total open receivables
 *   revenue         "Revenue (MTD)"              INR      not annual, and part-month
 *
 * An earlier draft of this file used all three as fallbacks. Seeding the
 * `inventory` KPI into /ccc's "Avg inventory" field would have put 9 — nine
 * DAYS of cover — into a rupee input and told an owner they hold ₹9 of stock,
 * with a green "these figures come from your workspace" banner over it.
 *
 * So every money figure here comes from the transactional tables and the
 * finance ledger, where a column means one thing. `cash_balance`,
 * `gst_turnover` and `gst_tax` are read from the ledger — the same rows
 * lib/metrics.ts reads to BUILD those KPI cards — rather than from the cards.
 *
 * ============================================================================
 * SPARSE LEDGER COLUMNS
 * ============================================================================
 *
 * `cash_balance`, `net_profit`, `gst_turnover` and `gst_tax` had their
 * defaults dropped precisely so that "not known" is storable. They are
 * populated by different events — a bank statement, a P&L import, a GST return
 * — so the latest ledger row very often has revenue and no cash.
 *
 * Taking `rows[0]` and reading every column off it would therefore report a
 * workspace as having no cash whenever its most recent month happened to be a
 * sales-only month. Each field instead finds the latest row that actually
 * carries it. lib/metrics.ts does the same thing and for the same reason.
 *
 * ============================================================================
 * COST
 * ============================================================================
 *
 * One Promise.all of six reads, all indexed on org_id, all bounded. It is
 * called from server components that were previously doing no I/O at all, so
 * it is not free — but it replaces the thing those pages were doing instead,
 * which was inventing a business.
 *
 * Everything is wrapped so that a missing table or an unapplied migration
 * degrades to nulls rather than throwing: a calculator must still render for a
 * workspace whose schema predates any of this.
 */

/** Finite and non-zero, else unknown. A stored 0 in a sparse column is noise. */
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** Sum a column, treating a missing value as absent rather than as zero. */
function sumOf(rows: any[] | null | undefined, pick: (r: any) => unknown): number | null {
  if (!rows?.length) return null;
  let total = 0, seen = 0;
  for (const r of rows) {
    const n = Number(pick(r));
    if (Number.isFinite(n)) { total += n; seen++; }
  }
  return seen ? total : null;
}

/**
 * The newest row whose `col` is actually populated.
 *
 * `rows` arrives newest-first, so this is a scan for the first row that knows
 * the answer rather than an assumption that the newest row knows everything.
 */
function latestWith(rows: any[], col: string): any | null {
  for (const r of rows) {
    const n = Number(r?.[col]);
    if (r?.[col] !== null && r?.[col] !== undefined && Number.isFinite(n)) return r;
  }
  return null;
}

export async function getWorkspaceSeed(): Promise<WorkspaceSeed> {
  const { user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return EMPTY_SEED;

  /*
    A LOCKED WORKSPACE GETS THE CALCULATOR, NOT ITS OWN NUMBERS.

    /calculators and /deadlines are in PAYWALL_ALLOW because the public
    footer calls them free and they must stay free after signup. But "free
    calculators" promises the CALCULATOR — a tool that works out an answer
    from numbers you type. It does not promise that an unpaid workspace gets
    its own receivables, payroll and cash position read back to it, which is
    the paid product.

    Both promises are kept exactly by letting the page render and returning
    the empty seed: the tool works, the banner honestly says "example", and
    nothing about their business is shown to a workspace that has not paid
    for it.

    Failure is open in the paying direction on purpose — if the billing read
    throws, the seed is returned rather than withheld, because breaking a
    paying customer's page is worse than being generous to a locked one.
  */
  try {
    const { getBillingStatus } = await import("@/lib/billing");
    const billing = await getBillingStatus();
    if (billing?.locked) return EMPTY_SEED;
  } catch { /* see above: do not withhold on an error */ }

  try {
    const sb = await createClient();

    const [ledgerRes, invoiceRes, stockRes, staffRes, orderRes] = await Promise.all([
      sb.from("finance_ledger").select("*").eq("org_id", orgId)
        .order("period", { ascending: false }).limit(24),
      /* Both invoice types in one read. `status` is compared case-insensitively
         because every Tally and Vyapar export writes "Paid" — the same trap the
         AI tools and /receivables document at length. */
      sb.from("invoices").select("type, amount, status").eq("org_id", orgId).limit(5000),
      sb.from("inventory_items").select("on_hand, unit_cost").eq("org_id", orgId).limit(5000),
      sb.from("employees").select("monthly_ctc").eq("org_id", orgId).limit(2000),
      sb.from("sales_orders").select("amount, customer_name, status").eq("org_id", orgId).limit(5000),
    ]);

    const ledger = ((ledgerRes.data as any[]) || []);

    /* ---- Revenue, COGS and opex, over the SAME periods -------------------
       Taking the trailing twelve where they exist. When fewer months are on
       file the figure is annualised from the months present and
       `revenueMonths` reports how many those were, so a consumer can refuse to
       make an annual claim off one month of trade instead of quietly making
       one. Revenue, COGS and opex are scaled by the same factor or the derived
       margins would be nonsense. */
    const revRows = ledger.filter((r) => Number.isFinite(Number(r.revenue)) && Number(r.revenue) !== 0).slice(0, 12);
    const revenueMonths = revRows.length;
    const scale = revenueMonths > 0 ? 12 / revenueMonths : 0;
    const rawRevenue = sumOf(revRows, (r) => r.revenue);
    const revenue = rawRevenue === null ? null : Math.round(rawRevenue * scale);
    const rawCogs = sumOf(revRows, (r) => r.cogs);
    const cogs = rawCogs === null ? null : Math.round(rawCogs * scale);
    const rawOpex = sumOf(revRows, (r) => r.opex);
    const opex = rawOpex === null ? null : Math.round(rawOpex * scale);
    /* Only the rows that actually recorded a bottom line contribute, and the
       scale is theirs, not revenue's — annualising six months of profit by the
       revenue window's twelve-month factor would halve it. */
    const profitRows = revRows.filter((r) => r.net_profit !== null && r.net_profit !== undefined
      && Number.isFinite(Number(r.net_profit)));
    const rawNetProfit = sumOf(profitRows, (r) => r.net_profit);
    const netProfitAnnual = rawNetProfit === null || !profitRows.length
      ? null
      : Math.round(rawNetProfit * (12 / profitRows.length));

    const ebitdaRows = revRows.filter((r) => r.ebitda !== null && r.ebitda !== undefined
      && Number.isFinite(Number(r.ebitda)) && Number(r.ebitda) !== 0);
    const rawEbitda = sumOf(ebitdaRows, (r) => r.ebitda);
    const ebitdaAnnual = rawEbitda === null || !ebitdaRows.length
      ? null
      : Math.round(rawEbitda * (12 / ebitdaRows.length));

    /* ---- Monthly profit -------------------------------------------------
       Deliberately NOT passed through `num()`: a recorded loss is a negative
       number and a recorded break-even month is a real zero, and both are
       facts about the business. `latestWith` already established the column is
       populated, so there is no unknown left to guard against. */
    const profitRow = latestWith(ledger, "net_profit");
    const monthlyProfit = profitRow ? Number(profitRow.net_profit) : null;

    /* Inflow and outflow for the SAME month, so /runway's burn reconciles with
       the profit figure instead of being an annual average of a different
       period. Cost is derived by subtraction rather than as cogs + opex,
       because those two columns do not have to account for every rupee that
       moved and net_profit is the row's own authoritative bottom line. */
    const monthlyRevenue = profitRow ? num(profitRow.revenue) : null;
    const monthlyCost = monthlyRevenue !== null && monthlyProfit !== null
      ? Math.round(monthlyRevenue - monthlyProfit)
      : null;
    const monthlyCogs = profitRow ? num(profitRow.cogs) : null;
    const monthlyOpex = profitRow ? num(profitRow.opex) : null;

    /* ---- Cash, with the month it belongs to ------------------------------
       A cash balance is a claim about a moment. The dashboard once printed a
       March statement as the position in September, and /cash13 used it as the
       opening balance of a 13-week FORWARD model. Any page that seeds cash
       gets the date with it and is expected to say so. */
    const cashRow = latestWith(ledger, "cash_balance");
    const cash = cashRow ? num(cashRow.cash_balance) : null;
    const cashPeriod = cashRow ? String(cashRow.period || "").slice(0, 7) : "";
    const cashAsOf = cash !== null && /^\d{4}-\d{2}$/.test(cashPeriod)
      ? new Date(cashPeriod + "-01T00:00:00Z")
          .toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })
      : null;
    const cashAgeMonths = cash !== null && /^\d{4}-\d{2}$/.test(cashPeriod)
      ? Math.max(0, Math.round((Date.now() - new Date(cashPeriod + "-01T00:00:00Z").getTime()) / (30 * 86_400_000)))
      : null;

    /* ---- GST, from the last return that was actually filed ---------------- */
    const gstRow = latestWith(ledger, "gst_turnover");
    const gstTurnover = gstRow ? num(gstRow.gst_turnover) : null;
    const gstTax = gstRow ? num(gstRow.gst_tax) : null;

    /* ---- Open receivables and payables ------------------------------------ */
    const open = ((invoiceRes.data as any[]) || [])
      .filter((r) => String(r.status ?? "").trim().toLowerCase() !== "paid");
    const receivables = sumOf(open.filter((r) => r.type === "receivable"), (r) => r.amount);
    const payables = sumOf(open.filter((r) => r.type === "payable"), (r) => r.amount);

    /* ---- Stock at cost ----------------------------------------------------
       Rows whose unit_cost was never entered contribute 0 rather than being
       excluded, which understates rather than overstates the holding. A
       calculator that seeds this is stating a floor, not a valuation. */
    const stockRows = ((stockRes.data as any[]) || []);
    const inventoryValue = sumOf(stockRows,
      (r) => (Number(r.on_hand) || 0) * (Number(r.unit_cost) || 0));

    /* ---- People ----------------------------------------------------------- */
    const staffRows = ((staffRes.data as any[]) || []);
    const monthlyPayroll = sumOf(staffRows, (r) => r.monthly_ctc);

    /* ---- Customers and order size ----------------------------------------
       Won orders only. Counting open and lost ones would inflate both the
       customer count and the average order value with business that never
       closed. Names are normalised the same way the rest of the product does
       it, so "Acme Pvt Ltd" and "acme pvt ltd " are one customer. */
    const won = ((orderRes.data as any[]) || [])
      .filter((r) => String(r.status ?? "").trim().toLowerCase() === "won");
    const wonTotal = sumOf(won, (r) => r.amount);
    const customers = new Set(
      won.map((r) => String(r.customer_name ?? "").trim().toLowerCase()).filter(Boolean));

    const customerCount = customers.size || null;
    /* Both inputs or nothing: a per-customer figure built on a guessed
       denominator is a guess wearing a decimal point. */
    const arpuMonthly = revenue !== null && customerCount
      ? Math.round(revenue / 12 / customerCount)
      : null;

    const seed: WorkspaceSeed = {
      revenue, revenueMonths, cogs, opex, netProfitAnnual, ebitdaAnnual, arpuMonthly,
      monthlyProfit, monthlyRevenue, monthlyCost, monthlyCogs, monthlyOpex,
      cash, cashAsOf, cashAgeMonths,
      receivables, payables, inventoryValue,
      monthlyPayroll,
      headcount: staffRows.length || null,
      customerCount,
      avgOrderValue: wonTotal !== null && won.length ? Math.round(wonTotal / won.length) : null,
      gstTurnover, gstTax,
      hasAny: false,
    };

    /* `revenueMonths` is a count, not a figure — a workspace with no revenue
       has 0 there and that must not read as "something is known". */
    seed.hasAny = (Object.keys(seed) as (keyof WorkspaceSeed)[])
      .filter((k) => k !== "hasAny" && k !== "revenueMonths")
      .some((k) => seed[k] !== null);

    return seed;
  } catch {
    /* A calculator must still render for a workspace whose schema predates any
       of this. Nulls everywhere means every page falls back to its example
       defaults and says so, which is exactly the old behaviour. */
    return EMPTY_SEED;
  }
}
