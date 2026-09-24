/**
 * The shape of a workspace seed, and nothing else.
 *
 * WHY THIS IS A SEPARATE FILE FROM lib/workspace-seed.ts
 *
 * The seed is produced on the server: workspace-seed.ts opens a Supabase client
 * and carries `import "server-only"`, which throws if it is ever pulled into a
 * client bundle. But the ~20 calculators that consume a seed are all
 * `"use client"` components, and they need the TYPE to declare their prop.
 *
 * `import type` is erased at compile time and would technically be safe, but
 * the repo already has a transitive client/server boundary test (added after a
 * boundary error blocked every deploy for a day) and "this particular import
 * is fine, trust me" is exactly the kind of exception that test exists to stop
 * anyone having to reason about. A types-only module with no imports of its own
 * cannot violate the boundary in any direction, so there is nothing to reason
 * about.
 *
 * ============================================================================
 * THE ONE RULE, RESTATED HERE BECAUSE THIS IS THE FILE CONSUMERS READ
 * ============================================================================
 *
 * `null` means UNKNOWN. It never means zero.
 *
 * A workspace that has imported invoices but never a bank statement genuinely
 * has no cash balance. Seeding 0 would make /runway announce "0 months of
 * runway" — not a cautious default, but a false and alarming claim about
 * someone's business. Every field is nullable and every consumer must decide,
 * per field, whether to fall back to its own example default.
 */

export type WorkspaceSeed = {
  /**
   * Annual revenue, from the finance ledger's recorded periods.
   *
   * Annualised when fewer than twelve months are on file — `revenueMonths`
   * says how many were actually read, so a page can decline to make an annual
   * claim off two months of trade.
   */
  revenue: number | null;
  /** How many ledger months carried a revenue figure. 0 when revenue is null. */
  revenueMonths: number;

  /** Annual cost of goods sold, over the same periods as `revenue`. */
  cogs: number | null;
  /** Annual operating expenses, over the same periods as `revenue`. */
  opex: number | null;
  /**
   * Annual net profit, over the same periods as `revenue`.
   *
   * Deliberately NOT `monthlyProfit * 12`. One month of a seasonal business
   * annualised twelve-fold is how a ratio report comes to grade a healthy
   * company as failing, or the reverse.
   */
  netProfitAnnual: number | null;
  /**
   * Annual EBITDA, over the same periods as `revenue`.
   *
   * Read from the ledger's own `ebitda` column rather than derived as
   * revenue − cogs − opex, because those three columns are not obliged to
   * account for every rupee and a derived EBITDA would silently disagree with
   * the one the rest of the product reports.
   */
  ebitdaAnnual: number | null;

  /**
   * Monthly revenue per customer — the "ARPU" the subscription calculators ask
   * for, computed as annual revenue ÷ 12 ÷ distinct won-order customers.
   *
   * Null unless BOTH inputs are known, because a per-customer figure derived
   * from a guessed customer count is a guess wearing a decimal point.
   */
  arpuMonthly: number | null;

  /** Latest recorded MONTHLY net profit. Negative for a loss — do not clamp. */
  monthlyProfit: number | null;
  /**
   * Revenue and total cost from THE SAME ledger month as `monthlyProfit`.
   *
   * /runway needs monthly inflow and monthly outflow separately, and the
   * obvious source — annual `revenue` divided by twelve — is a trailing
   * average that belongs to a different period from the profit figure. Mixing
   * them produces a burn rate that does not reconcile with the profit shown on
   * the same screen, off by whatever the business's seasonality happens to be.
   *
   * Taken from one row, `monthlyCost - monthlyRevenue` is exactly
   * `-monthlyProfit`, so every figure on the page agrees with every other.
   */
  monthlyRevenue: number | null;
  monthlyCost: number | null;
  /**
   * COGS and opex from that same month, split out.
   *
   * /pnl builds an income statement and needs the two halves separately;
   * `monthlyCost` is their total plus anything else that moved. Both are
   * nullable independently of `monthlyCost`, because a ledger row can carry a
   * bottom line without a cost breakdown.
   */
  monthlyCogs: number | null;
  monthlyOpex: number | null;

  /**
   * Latest recorded cash balance, in rupees.
   *
   * Sparse by nature: a cash balance only exists once a bank statement has
   * been analysed, and it is attached to the month of that statement, not to
   * today. `cashAsOf` and `cashAgeMonths` travel with it precisely so no page
   * can present a six-month-old balance as the position now — the dashboard
   * had exactly that bug and it is documented at length in lib/metrics.ts.
   */
  cash: number | null;
  /** "Mar 2026" — the month the cash balance belongs to. */
  cashAsOf: string | null;
  /** Whole months between that statement and today. */
  cashAgeMonths: number | null;

  /**
   * Open (unpaid) receivables, summed from `invoices`.
   *
   * NOT the `receivables` health metric, which is "Receivables PAST DUE" — a
   * strict subset. Substituting one for the other understates nothing and
   * overstates nothing; it silently answers a different question.
   */
  receivables: number | null;
  /** Open (unpaid) payables, summed from `invoices`. */
  payables: number | null;

  /**
   * Stock at cost: sum of on_hand x unit_cost, in rupees.
   *
   * NOT the `inventory` health metric, which is "Inventory Cover" in DAYS.
   * Seeding 9 (days) into a rupee field would have told an owner they hold ₹9
   * of stock.
   */
  inventoryValue: number | null;

  /** Monthly payroll cost, summed from employees.monthly_ctc. */
  monthlyPayroll: number | null;
  headcount: number | null;

  /** Distinct customers with at least one won order. */
  customerCount: number | null;
  /** Mean value of a won order. */
  avgOrderValue: number | null;

  /** Turnover from the last filed GST return on the ledger. */
  gstTurnover: number | null;
  /** Tax from that same return. */
  gstTax: number | null;

  /** True when at least one field above is non-null. */
  hasAny: boolean;
};

/** A seed that knows nothing. Every consumer falls back to its own defaults. */
export const EMPTY_SEED: WorkspaceSeed = {
  revenue: null, revenueMonths: 0, cogs: null, opex: null, netProfitAnnual: null,
  ebitdaAnnual: null, arpuMonthly: null,
  monthlyProfit: null, monthlyRevenue: null, monthlyCost: null,
  monthlyCogs: null, monthlyOpex: null,
  cash: null, cashAsOf: null, cashAgeMonths: null,
  receivables: null, payables: null, inventoryValue: null,
  monthlyPayroll: null, headcount: null,
  customerCount: null, avgOrderValue: null,
  gstTurnover: null, gstTax: null,
  hasAny: false,
};

/**
 * Did any of the fields this particular calculator cares about arrive?
 *
 * Every consumer needs the same three lines — pick my fields, see if any is
 * non-null, choose the banner — and getting it wrong in the lenient direction
 * (`seed.hasAny`) is the failure that matters: /runway would show "these
 * figures come from your workspace" on a workspace that had supplied employees
 * and nothing else, i.e. none of the figures on screen.
 *
 * So consumers ask about THEIR fields, never about the seed as a whole.
 */
export function seededFrom(seed: WorkspaceSeed | undefined, ...fields: (keyof WorkspaceSeed)[]): boolean {
  if (!seed) return false;
  return fields.some((f) => seed[f] !== null && seed[f] !== undefined);
}

/**
 * The banner state for a calculator: "yours" only when something real landed.
 *
 * Deliberately returns the same union ExampleFigures takes, so a consumer
 * writes `<ExampleFigures source={seedSource(seed, "cash")} />` and cannot
 * accidentally pass a boolean that coerces to the wrong branch.
 */
export function seedSource(seed: WorkspaceSeed | undefined, ...fields: (keyof WorkspaceSeed)[]): "example" | "yours" {
  return seededFrom(seed, ...fields) ? "yours" : "example";
}

/**
 * Use a seeded figure, or fall back to the calculator's own example default.
 *
 * `null` and `undefined` both mean unknown. A real recorded zero — a month
 * that genuinely booked no revenue — is a fact and is used as one.
 */
export function orDefault(value: number | null | undefined, fallback: number): number {
  return value === null || value === undefined || !Number.isFinite(value) ? fallback : value;
}
