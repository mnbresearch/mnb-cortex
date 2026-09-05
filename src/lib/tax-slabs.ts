/**
 * Indian income-tax slabs, in ONE place.
 *
 * WHY THIS FILE EXISTS.
 *
 * Two components computed income tax from their own hardcoded ladders:
 * `tax-estimator.tsx` (a slab array) and `payroll-calc.tsx` (an if/else chain
 * with pre-computed cumulative amounts). Both were FY 2024-25 numbers, both had
 * drifted, and neither carried an effective date on screen.
 *
 * WHAT THEY WERE GETTING WRONG, as of FY 2026-27:
 *
 *   basic exemption      ₹3,00,000  ->  ₹4,00,000
 *   standard deduction   ₹50,000    ->  ₹75,000   (new regime)
 *   87A rebate up to     ₹7,00,000  ->  ₹12,00,000, capped at ₹60,000
 *   the whole slab ladder was the old six-band shape
 *   surcharge            not applied at all
 *   marginal relief      not applied at all
 *
 * Compounded, a salaried person on ₹13 lakh was shown a materially wrong
 * number — and `/tax`'s subtitle is "New vs old regime — see which saves you
 * more", so it is a figure someone uses to choose a regime for the year. The
 * payroll one is worse in a quiet way: it prints "Monthly take-home (approx)"
 * in bold, which is what an owner reads out when making a salary offer.
 *
 * Two calculators cannot disagree if there is only one ladder, so this is it.
 *
 * KEEPING IT HONEST.
 *
 * `RATES_AS_OF` is rendered on screen, the way tds-calc.tsx already does. A tax
 * table without a visible vintage is the actual defect — the numbers go stale
 * every February whatever anyone intends, and the only defence is that the
 * reader can see how old they are. scripts/test-statutory.mjs pins every figure
 * below so that changing one is deliberate and comes with a failing test.
 *
 * Verified against cleartax.in/s/income-tax-slabs on 6 September 2026.
 */

export const RATES_AS_OF = "FY 2026-27 (AY 2027-28)";

/** [upper bound of the band, rate]. The last band is unbounded. */
export type Slab = [number, number];

/**
 * New regime — the DEFAULT regime, and what most people should be shown first.
 *
 *   up to  ₹4,00,000   nil
 *   ₹4L  – ₹8L          5%
 *   ₹8L  – ₹12L        10%
 *   ₹12L – ₹16L        15%
 *   ₹16L – ₹20L        20%
 *   ₹20L – ₹24L        25%
 *   above ₹24L         30%
 */
export const NEW_SLABS: Slab[] = [
  [400_000, 0],
  [800_000, 0.05],
  [1_200_000, 0.10],
  [1_600_000, 0.15],
  [2_000_000, 0.20],
  [2_400_000, 0.25],
  [Infinity, 0.30],
];

/** Old regime, unchanged for years but pinned so a future edit is deliberate. */
export const OLD_SLABS: Slab[] = [
  [250_000, 0],
  [500_000, 0.05],
  [1_000_000, 0.20],
  [Infinity, 0.30],
];

export const STD_DEDUCTION_NEW = 75_000;
export const STD_DEDUCTION_OLD = 50_000;

/** 87A: zero tax up to this taxable income, and the cap on the rebate itself. */
export const REBATE_NEW = { upTo: 1_200_000, max: 60_000 };
export const REBATE_OLD = { upTo: 500_000, max: 12_500 };

export const CESS = 0.04;

/**
 * Surcharge on the TAX (not the income), above these income thresholds.
 *
 * Neither calculator applied this at all, so both understated every high
 * earner — by 10% of their tax at ₹60 lakh and 25% at ₹3 crore. The old regime
 * still goes to 37% above ₹5 crore; the new regime caps at 25%.
 */
export const SURCHARGE: { over: number; newRegime: number; oldRegime: number }[] = [
  /* Grouped in tens, not lakhs — 50_00_000 is easy to misread by a zero. */
  { over: 5_000_000, newRegime: 0.10, oldRegime: 0.10 },  // ₹50 lakh
  { over: 10_000_000, newRegime: 0.15, oldRegime: 0.15 }, // ₹1 crore
  { over: 20_000_000, newRegime: 0.25, oldRegime: 0.25 }, // ₹2 crore
  { over: 50_000_000, newRegime: 0.25, oldRegime: 0.37 }, // ₹5 crore
];

/** Tax across a slab ladder, before rebate, surcharge and cess. */
export function slabTax(taxable: number, slabs: Slab[]): number {
  let tax = 0;
  let prev = 0;
  for (const [upto, rate] of slabs) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, upto) - prev) * rate;
    prev = upto;
  }
  return tax;
}

function surchargeRate(income: number, regime: "new" | "old"): number {
  let r = 0;
  for (const band of SURCHARGE) if (income > band.over) r = regime === "new" ? band.newRegime : band.oldRegime;
  return r;
}

/** The threshold a given income has just crossed, or null below ₹50 lakh. */
function surchargeThreshold(income: number): number | null {
  let t: number | null = null;
  for (const band of SURCHARGE) if (income > band.over) t = band.over;
  return t;
}

/**
 * Tax + surcharge, with the surcharge's own marginal relief.
 *
 * Each surcharge threshold is a cliff: at ₹50,00,001 the 10% band switches on
 * and the bill jumps by well over a lakh for one rupee of extra income. Relief
 * caps tax+surcharge so that the increase never exceeds the increase in income
 * over the threshold. Not modelling it would reproduce exactly the class of
 * defect this file exists to fix — a real discontinuity the calculator shows
 * as if it were the law.
 */
function withSurcharge(taxable: number, slabs: Slab[], regime: "new" | "old", baseTax: number) {
  const rate = surchargeRate(taxable, regime);
  if (rate === 0) return { surcharge: 0, relieved: false };

  let surcharge = baseTax * rate;

  const t = surchargeThreshold(taxable)!;
  /* What someone exactly at the threshold pays — the cliff's lower edge. */
  const atThreshold = slabTax(t, slabs) * (1 + surchargeRate(t, regime));
  const cap = atThreshold + (taxable - t);

  if (baseTax + surcharge > cap) return { surcharge: Math.max(0, cap - baseTax), relieved: true };
  return { surcharge, relieved: false };
}

export type TaxResult = {
  taxable: number;
  /** Slab tax before any rebate. */
  base: number;
  rebate: number;
  surcharge: number;
  cess: number;
  total: number;
  /** True when marginal relief capped the bill — worth telling the user. */
  marginalRelief: boolean;
};

/**
 * The whole computation for one regime.
 *
 * @param income      gross annual income
 * @param deductions  chapter VI-A etc. Ignored under the new regime, which does
 *                    not allow them — silently applying them there was one of
 *                    the ways the old code could flatter a bad choice of regime.
 */
export function computeTax(
  income: number,
  regime: "new" | "old",
  opts: { salaried?: boolean; deductions?: number } = {},
): TaxResult {
  const salaried = opts.salaried ?? true;
  const std = salaried ? (regime === "new" ? STD_DEDUCTION_NEW : STD_DEDUCTION_OLD) : 0;
  const ded = regime === "old" ? Math.max(0, opts.deductions ?? 0) : 0;

  const taxable = Math.max(0, income - std - ded);
  const slabs = regime === "new" ? NEW_SLABS : OLD_SLABS;
  const reb = regime === "new" ? REBATE_NEW : REBATE_OLD;

  const base = slabTax(taxable, slabs);

  /* 87A: a rebate against the tax, capped — not a cliff that zeroes any bill. */
  const rebate = taxable <= reb.upTo ? Math.min(base, reb.max) : 0;
  let afterRebate = Math.max(0, base - rebate);

  /*
    MARGINAL RELIEF, which neither calculator had.

    Just past the rebate threshold the tax jumps far faster than the income:
    at ₹12,10,000 the slab tax is ₹61,500 on ₹10,000 of extra income. Relief
    caps the tax at the excess over the threshold, so the answer is ₹10,000 and
    not ₹61,500. Without it the calculator tells someone a ₹10,000 raise costs
    them ₹61,500 — which is not true, and is exactly the sort of thing a person
    makes a decision on.
  */
  let marginalRelief = false;
  if (taxable > reb.upTo) {
    const excess = taxable - reb.upTo;
    if (afterRebate > excess) { afterRebate = excess; marginalRelief = true; }
  }

  const sur = withSurcharge(taxable, slabs, regime, afterRebate);
  const cess = (afterRebate + sur.surcharge) * CESS;

  return {
    taxable,
    base,
    rebate,
    surcharge: Math.round(sur.surcharge),
    cess: Math.round(cess),
    total: Math.round(afterRebate + sur.surcharge + cess),
    marginalRelief: marginalRelief || sur.relieved,
  };
}
