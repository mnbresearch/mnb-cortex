/**
 * Advance tax instalments, and the interest a shortfall actually costs.
 *
 * ============================================================================
 * WHAT /advance-tax DID, AND DID NOT DO
 * ============================================================================
 *
 * The page rendered a four-row table of instalments and a paragraph that read:
 *
 *     "Shortfalls attract interest under sections 234B/234C."
 *
 * It never computed a rupee of it. Worse, the page took a second input —
 * "Advance tax already paid" — fed it into a `remaining` value, and then never
 * rendered that value anywhere. An owner could type ₹80,000 into it and watch
 * literally nothing on the screen change.
 *
 * So the one number an owner actually wants from this page — "I am behind; what
 * is that costing me?" — was the one number it would not give, while naming the
 * exact section that would give it.
 *
 * ============================================================================
 * THE STATUTE, AND THE TRAP IN IT
 * ============================================================================
 *
 * Verified against the Income-tax Act and the Department's own guidance in
 * September 2026. The full schedule for a non-presumptive assessee:
 *
 *     due by      cumulative target      no interest if paid at least
 *     15 Jun            15%                        12%
 *     15 Sep            45%                        36%
 *     15 Dec            75%                        75%
 *     15 Mar           100%                       100%
 *
 * THE TRAP: for the first two instalments the trigger and the base are
 * DIFFERENT NUMBERS. Pay 13% by 15 June and you owe nothing, because 13 is at
 * least 12. Pay 11% and interest is charged on the shortfall from FIFTEEN per
 * cent — not from twelve. The relief is a cliff, not a reduction in the base.
 *
 * Implementing it as "shortfall below 12%" understates the charge for every
 * business that misses the cliff; implementing it as "shortfall below 15% with
 * no relief" overstates it for every business inside the tolerance. Both are
 * plausible readings of a summary and both are wrong, so there is a test for
 * each boundary in scripts/test-advance-tax.mjs.
 *
 * Interest runs at 1% per month simple — three months for the first three
 * instalments, one month for the last. There is no compounding and no
 * part-month proration: the periods are fixed by statute.
 *
 * ============================================================================
 * PRESUMPTIVE TAXPAYERS
 * ============================================================================
 *
 * An assessee under 44AD or 44ADA has ONE instalment: 100% by 15 March. The
 * page said so in prose and modelled the four-instalment schedule for everyone
 * regardless. Getting this wrong tells a presumptive business it is three
 * instalments late when it is not late at all — which is not a rounding error,
 * it is an invented liability.
 *
 * ============================================================================
 * SECTION 234B IS A DIFFERENT CHARGE AND IS NOT ADDED IN
 * ============================================================================
 *
 * 234C is for deferment WITHIN the year. 234B is for paying less than 90% of
 * the assessed tax by year end, and it runs at 1% per month from 1 April of the
 * assessment year until the tax is actually paid — a period that depends on
 * when the owner pays, which this calculator cannot know.
 *
 * So 234B is reported as a monthly RATE and a principal, never as a total. A
 * single "you owe ₹X" that silently assumed a settlement date would be a
 * confident, specific and wrong number about somebody's tax.
 *
 * ============================================================================
 * SECTION NUMBERS
 * ============================================================================
 *
 * The Income-tax Act, 2025 takes effect for tax year 2026-27 and renumbers
 * these: 234C becomes section 425. The familiar 234B/234C labels are kept,
 * because that is what every CA, every notice and every search result uses —
 * the same choice components/tds-calc.tsx documents for the 194-series moving
 * to section 393 — and the new number is shown alongside.
 *
 * Pure and dependency-free, so scripts/test-advance-tax.mjs can execute it.
 */

import { istToday } from "./statutory.ts";

/** Rendered on screen. A fact about when a human last checked, not a promise. */
export const ADVANCE_TAX_AS_OF = "Advance-tax rules · last verified September 2026";

/** Where these provisions live under the Income-tax Act, 2025. */
export const ADVANCE_TAX_SECTION_NOTE =
  "From 1 April 2026 the deferment interest below sits in section 425 of the Income-tax Act, 2025. " +
  "The familiar 234B/234C labels are kept because that is what notices and advisers still use.";

/** Advance tax is only payable once the year's liability crosses this. */
export const ADVANCE_TAX_THRESHOLD = 10_000;

/** 1% per month, simple. Not compounded, not prorated by days. */
export const INTEREST_RATE_PER_MONTH = 0.01;

export type Instalment = {
  /** "15 Jun" — as it appears on a challan. */
  by: string;
  /** Cumulative share of the year's liability due by this date. */
  cum: number;
  /**
   * Pay at least this share by the date and no interest is charged, even
   * though the target is higher. Equal to `cum` where there is no tolerance.
   */
  relief: number;
  /** Months of interest charged on a shortfall at this instalment. */
  months: number;
};

/** The four-instalment schedule. Order matters; it is read cumulatively. */
export const SCHEDULE: Instalment[] = [
  { by: "15 Jun", cum: 0.15, relief: 0.12, months: 3 },
  { by: "15 Sep", cum: 0.45, relief: 0.36, months: 3 },
  { by: "15 Dec", cum: 0.75, relief: 0.75, months: 3 },
  { by: "15 Mar", cum: 1.00, relief: 1.00, months: 1 },
];

/** 44AD / 44ADA: one instalment, the whole liability, by 15 March. */
export const PRESUMPTIVE_SCHEDULE: Instalment[] = [
  { by: "15 Mar", cum: 1.00, relief: 1.00, months: 1 },
];

export type PaymentByDate = {
  /** Matches an Instalment.by — "15 Jun". */
  by: string;
  /** Cumulative rupees paid ON OR BEFORE that date. */
  paidCumulative: number;
};

export type InstalmentResult = {
  by: string;
  /** Percentage of the year's liability targeted by this date. */
  pct: number;
  /** Rupees that should have been paid cumulatively by this date. */
  dueCumulative: number;
  /** This instalment on its own — the cumulative step. */
  instalment: number;
  /** What was actually paid cumulatively by this date. */
  paidCumulative: number;
  /**
   * The shortfall interest is charged on: the gap from the FULL target,
   * not from the relief threshold. Zero when inside the tolerance.
   */
  shortfall: number;
  /** True when the tolerance saved them — worth saying on screen. */
  withinTolerance: boolean;
  months: number;
  interest: number;
};

export type AdvanceTaxResult = {
  /** True when the year's liability is under the ₹10,000 threshold. */
  belowThreshold: boolean;
  rows: InstalmentResult[];
  /** Total 234C interest across the instalments. */
  interest234C: number;
  /** Total paid by the end of the year, per the inputs given. */
  paidByYearEnd: number;
  /** Amount still unpaid at year end. */
  unpaid: number;
  /**
   * 234B applies only if less than 90% of the liability was paid as advance
   * tax. Reported as a principal and a monthly rate, never a total — see the
   * note at the top of this file.
   */
  interest234B: {
    applies: boolean;
    /** The unpaid amount 1%/month runs on. */
    principal: number;
    /** Rupees per month it accrues at. */
    perMonth: number;
  };
};

const r2 = (n: number) => Math.round(n);

/**
 * Compute the schedule and the deferment interest.
 *
 * `payments` is optional and sparse: give what is known. A date with no entry
 * is treated as carrying forward the previous date's cumulative total, which
 * is the correct reading — cumulative payments do not decrease.
 */
export function computeAdvanceTax(input: {
  /** Estimated tax liability for the year, in rupees. */
  tax: number;
  /** Cumulative amounts paid by each due date. */
  payments?: PaymentByDate[];
  /** 44AD / 44ADA — one instalment by 15 March. */
  presumptive?: boolean;
}): AdvanceTaxResult {
  const tax = Math.max(0, Number(input.tax) || 0);
  const schedule = input.presumptive ? PRESUMPTIVE_SCHEDULE : SCHEDULE;

  const paidMap = new Map<string, number>();
  for (const p of input.payments || []) {
    const n = Number(p?.paidCumulative);
    if (p?.by && Number.isFinite(n)) paidMap.set(p.by, Math.max(0, n));
  }

  /*
    Below ₹10,000 of annual liability there is no advance-tax obligation at
    all, so there is no shortfall and no interest. Returning zeros with a flag
    rather than running the arithmetic anyway stops the page telling a small
    proprietor they owe interest on an instalment they never had to pay.
  */
  if (tax < ADVANCE_TAX_THRESHOLD) {
    return {
      belowThreshold: true,
      rows: schedule.map((s) => ({
        by: s.by, pct: s.cum * 100,
        dueCumulative: 0, instalment: 0, paidCumulative: 0,
        shortfall: 0, withinTolerance: true, months: s.months, interest: 0,
      })),
      interest234C: 0,
      paidByYearEnd: 0,
      unpaid: 0,
      interest234B: { applies: false, principal: 0, perMonth: 0 },
    };
  }

  const rows: InstalmentResult[] = [];
  let prevCum = 0;
  let runningPaid = 0;
  let interest234C = 0;

  for (const s of schedule) {
    const dueCumulative = r2(tax * s.cum);
    const instalment = dueCumulative - r2(tax * prevCum);
    prevCum = s.cum;

    /* Cumulative payments never decrease, so an unknown date inherits the
       last known total rather than resetting to zero and inventing arrears. */
    runningPaid = Math.max(runningPaid, paidMap.get(s.by) ?? runningPaid);
    const paidCumulative = runningPaid;

    const reliefAmount = r2(tax * s.relief);
    const withinTolerance = paidCumulative >= reliefAmount;

    /* THE TRAP, in one line: the relief decides WHETHER interest is charged;
       the full target decides WHAT ON. Computing the shortfall from
       `reliefAmount` would understate every charge at the first two dates. */
    const shortfall = withinTolerance ? 0 : Math.max(0, dueCumulative - paidCumulative);
    const interest = r2(shortfall * INTEREST_RATE_PER_MONTH * s.months);
    interest234C += interest;

    rows.push({
      by: s.by, pct: s.cum * 100,
      dueCumulative, instalment, paidCumulative,
      shortfall, withinTolerance, months: s.months, interest,
    });
  }

  const paidByYearEnd = runningPaid;
  const unpaid = Math.max(0, tax - paidByYearEnd);

  /* 234B: only once advance tax falls below 90% of the liability. */
  const applies234B = paidByYearEnd < r2(tax * 0.9);
  return {
    belowThreshold: false,
    rows,
    interest234C: r2(interest234C),
    paidByYearEnd,
    unpaid,
    interest234B: {
      applies: applies234B,
      principal: applies234B ? unpaid : 0,
      perMonth: applies234B ? r2(unpaid * INTEREST_RATE_PER_MONTH) : 0,
    },
  };
}

/**
 * Which instalment is next, for a given day inside a financial year.
 *
 * The page showed four static rows with no notion of today, so an owner in
 * January could not tell at a glance that three dates had already passed. The
 * Indian FY runs 1 April to 31 March, so the June/Sept/Dec dates belong to the
 * calendar year the FY starts in and the March date to the following one.
 *
 * Returns null after 15 March, when nothing is left to pay for the year.
 */
export function nextInstalment(today: Date, presumptive = false): { by: string; date: Date; daysAway: number } | null {
  /*
    ==========================================================================
    IST CALENDAR COMPONENTS, NOT UTC ONES
    ==========================================================================

    This read `today.getUTCFullYear/getUTCMonth/getUTCDate()`. The instant is
    correct — the component is "use client", so `new Date()` is the user's own
    clock — but the UTC *components* of that instant are yesterday's for the
    5h30m after midnight IST. Three wrong answers followed, all about a date
    that costs money under s.234C:

      16 Jun, 02:00 IST   UTC date is the 15th, so `ref` is the 15th, days = 0,
                          and the page says "Next instalment: 15 Jun — today".
                          It was due YESTERDAY. The customer is told they are
                          still on time while interest is already accruing.

      15 Jun, 02:00 IST   "in 1 day" for something due today.

      1 Apr,  02:00 IST   getUTCMonth() is 2 (March), so fyStartYear = y - 1 and
                          the function walks LAST year's four dates, all past,
                          and returns null. On the first day of the financial
                          year the page shows no next instalment at all.

    istToday() is the repo's established answer to exactly this (it is why
    /compliance and /gst are correct) and gives calendar parts in Asia/Kolkata
    whatever timezone the clock is read in — so this is right on the server too
    if the function is ever called there.
  */
  const { y, m: m1, d: dayOfMonth } = istToday(today);
  const m = m1 - 1;                    // istToday is 1-based; the rest here is 0-based
  /* FY starts in April: Jan–Mar belong to the FY that began LAST calendar year. */
  const fyStartYear = m >= 3 ? y : y - 1;

  const dates: Array<{ by: string; date: Date }> = presumptive
    ? [{ by: "15 Mar", date: new Date(Date.UTC(fyStartYear + 1, 2, 15)) }]
    : [
        { by: "15 Jun", date: new Date(Date.UTC(fyStartYear, 5, 15)) },
        { by: "15 Sep", date: new Date(Date.UTC(fyStartYear, 8, 15)) },
        { by: "15 Dec", date: new Date(Date.UTC(fyStartYear, 11, 15)) },
        { by: "15 Mar", date: new Date(Date.UTC(fyStartYear + 1, 2, 15)) },
      ];

  const ref = Date.UTC(y, m, dayOfMonth);
  for (const d of dates) {
    const days = Math.round((d.date.getTime() - ref) / 86_400_000);
    if (days >= 0) return { by: d.by, date: d.date, daysAway: days };
  }
  return null;
}
