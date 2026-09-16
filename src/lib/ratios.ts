/**
 * Financial ratios, and — the part that matters — when NOT to grade one.
 *
 * WHY THIS IS A MODULE AND NOT ARITHMETIC INSIDE THE COMPONENT.
 *
 * It used to be eight lines inside components/financial-ratios.tsx, built on
 * `const s = (a, b) => b ? a / b : 0`. Two things followed from that, and both
 * told a failing business it was healthy:
 *
 *   NEGATIVE EQUITY. Debt of ₹1.2 Cr against equity of −₹10 L gives a
 *   debt/equity of −12.00, and −12 passes the test `de <= 1`, so the worst
 *   balance sheet on the page rendered green next to the words "≤1
 *   conservative". Return on equity divided a −₹10 L loss by −₹10 L of equity
 *   and printed +100%, green, against "≥15% strong" — the two negatives
 *   cancelling into what looked like the best number on the screen.
 *
 *   MISSING INPUTS. A zero denominator returned 0, and 0 is a number, so an
 *   unfilled form got graded as though it had been measured.
 *
 * Grading is therefore a three-way outcome, not a boolean: a ratio is good,
 * marginal, bad, or it is `null` — not computable — and a null is never
 * coloured, never compared to a threshold, and never sent to the model as a
 * figure. A pure module is the only way to assert that against real numbers;
 * the previous version could only be checked by eye.
 */

export type Grade = "good" | "warn" | "bad" | "na";

export type RatioInputs = {
  currentAssets: number; currentLiabilities: number; inventory: number;
  debt: number; equity: number; ebit: number; interest: number;
  revenue: number; totalAssets: number; netProfit: number;
};

export type Ratios = {
  /** False when equity is zero or negative — leverage and returns are then meaningless. */
  equityOk: boolean;
  current: number | null;
  quick: number | null;
  de: number | null;
  coverage: number | null;
  assetTurn: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
};

/**
 * null when the denominator is not a positive quantity.
 *
 * Deliberately `> 0` rather than `!== 0`: a negative denominator does not make
 * a ratio small, it flips its sign, which is exactly how −12 came to satisfy
 * "conservative leverage".
 */
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function computeRatios(v: RatioInputs): Ratios {
  const equityOk = v.equity > 0;
  return {
    equityOk,
    current: div(v.currentAssets, v.currentLiabilities),
    quick: div(v.currentAssets - v.inventory, v.currentLiabilities),
    de: equityOk ? v.debt / v.equity : null,
    coverage: div(v.ebit, v.interest),
    assetTurn: div(v.revenue, v.totalAssets),
    netMargin: v.revenue > 0 ? (v.netProfit / v.revenue) * 100 : null,
    roe: equityOk ? (v.netProfit / v.equity) * 100 : null,
    roa: div(v.netProfit, v.totalAssets),
  };
}

/** A null value grades "na". Nothing else can. */
export function grade(
  value: number | null,
  good: (n: number) => boolean,
  warn: (n: number) => boolean,
): Grade {
  if (value === null) return "na";
  return good(value) ? "good" : warn(value) ? "warn" : "bad";
}

export type RatioSpec = {
  key: string;
  label: string;
  group: "Liquidity" | "Leverage" | "Efficiency & returns";
  /** Shown when the ratio computed. */
  hint: string;
  /** Shown instead when it did not, so "—" is never unexplained. */
  naHint: string;
  value: (r: Ratios) => number | null;
  good: (n: number) => boolean;
  warn: (n: number) => boolean;
  fmt: (n: number) => string;
};

const f2 = (n: number) => n.toFixed(2);
const fx = (n: number) => n.toFixed(1) + "x";
const fp = (n: number) => n.toFixed(1) + "%";

export const RATIO_SPECS: RatioSpec[] = [
  { key: "current", label: "Current ratio", group: "Liquidity", hint: "≥1.5 healthy",
    naHint: "enter current liabilities",
    value: (r) => r.current, good: (n) => n >= 1.5, warn: (n) => n >= 1, fmt: f2 },
  { key: "quick", label: "Quick ratio", group: "Liquidity", hint: "≥1 healthy",
    naHint: "enter current liabilities",
    value: (r) => r.quick, good: (n) => n >= 1, warn: (n) => n >= 0.8, fmt: f2 },

  { key: "de", label: "Debt / equity", group: "Leverage", hint: "≤1 conservative",
    naHint: "equity must be positive to gauge leverage",
    value: (r) => r.de, good: (n) => n <= 1, warn: (n) => n <= 2, fmt: f2 },
  { key: "coverage", label: "Interest coverage", group: "Leverage", hint: "≥3x safe",
    naHint: "no interest expense entered",
    value: (r) => r.coverage, good: (n) => n >= 3, warn: (n) => n >= 1.5, fmt: fx },

  { key: "assetTurn", label: "Asset turnover", group: "Efficiency & returns", hint: "higher is better",
    naHint: "enter total assets",
    value: (r) => r.assetTurn, good: (n) => n >= 1, warn: (n) => n >= 0.5, fmt: fx },
  { key: "netMargin", label: "Net margin", group: "Efficiency & returns", hint: "≥10% strong",
    naHint: "enter revenue",
    value: (r) => r.netMargin, good: (n) => n >= 10, warn: (n) => n >= 5, fmt: fp },
  { key: "roe", label: "Return on equity", group: "Efficiency & returns", hint: "≥15% strong",
    naHint: "equity must be positive for ROE to mean anything",
    value: (r) => r.roe, good: (n) => n >= 15, warn: (n) => n >= 8, fmt: fp },
  { key: "roa", label: "Return on assets", group: "Efficiency & returns", hint: "≥8% strong",
    naHint: "enter total assets",
    value: (r) => r.roa, good: (n) => n >= 8, warn: (n) => n >= 4, fmt: fp },
];

export type RatioRow = { key: string; label: string; group: RatioSpec["group"]; val: string; grade: Grade; hint: string };

export function ratioRows(r: Ratios): RatioRow[] {
  return RATIO_SPECS.map((s) => {
    const v = s.value(r);
    return v === null
      ? { key: s.key, label: s.label, group: s.group, val: "—", grade: "na" as const, hint: s.naHint }
      : { key: s.key, label: s.label, group: s.group, val: s.fmt(v), grade: grade(v, s.good, s.warn), hint: s.hint };
  });
}
