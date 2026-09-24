/**
 * EPF, EPS and ESI — one ladder, because there were two.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 *
 * Two pages of this product answered the same statutory question differently:
 *
 *   components/epf-calc.tsx      const pfWage = basic;                // uncapped
 *   components/payroll-calc.tsx  Math.min(basic, 15_000 * 12)         // capped
 *
 * On a ₹25,000 basic, /epf said the employee contributes ₹3,000 a month and
 * /payroll said ₹1,800. An owner preparing an offer hits both screens, and one
 * of them is wrong for their business — but the product never said which, or
 * that there was a choice at all.
 *
 * lib/tax-slabs.ts was written to end exactly this class of defect, and its
 * note says so: "Two calculators cannot disagree if there is only one ladder."
 * Nobody built the ladder for EPF.
 *
 * ============================================================================
 * AND BOTH ANSWERS WERE DEFENSIBLE, WHICH IS THE INTERESTING PART
 * ============================================================================
 *
 * This is not a case of one file being wrong. Under the EPF & MP Act:
 *
 *   - The statutory wage ceiling for mandatory PF is ₹15,000 a month. An
 *     employer's MINIMUM obligation is 12% of ₹15,000.
 *   - EPS (the pension slice) is ALWAYS computed on ₹15,000, never more —
 *     8.33% of ₹15,000 = ₹1,250, and that cap is not optional.
 *   - An employer MAY contribute on the full basic instead. Many Indian SMEs
 *     do, and for an employee earning above the ceiling it is a materially
 *     better package.
 *
 * So the honest model is not "pick the right one" — it is a POLICY the business
 * has, which the product should ask about and then apply consistently. That is
 * what `aboveCeiling` is. The default is `false` (the statutory minimum),
 * because that is what an SME does unless it has decided otherwise, and it is
 * what payroll-calc already assumed.
 *
 * Nothing is removed by this file: /epf keeps every number it showed, and gains
 * the ability to model the policy it was silently assuming.
 *
 * ============================================================================
 * VERIFICATION
 * ============================================================================
 *
 * Checked against the EPFO and ESIC published rates in September 2026. The
 * stamp below is a fact about when a human last looked, not a claim that the
 * rates cannot change — scripts/test-statutory.mjs fails if it drifts more
 * than eighteen months behind the clock.
 */

/** Rendered on screen. See the note above on what this date means. */
export const EPF_RATES_AS_OF = "EPFO/ESIC rates · last verified September 2026";

/** Monthly wage ceiling for mandatory PF and for the EPS calculation. */
export const PF_WAGE_CEILING_MONTHLY = 15_000;

/** Monthly GROSS ceiling for ESI eligibility. Gross, not basic. */
export const ESI_GROSS_CEILING_MONTHLY = 21_000;

export const EPF_RATE = 0.12;        // employee, and employer's total
export const EPS_RATE = 0.0833;      // employer's share diverted to pension
export const ESI_EMPLOYEE_RATE = 0.0075;
export const ESI_EMPLOYER_RATE = 0.0325;

export type EpfInput = {
  /** Basic + DA, per month. */
  basic: number;
  /** Gross monthly pay — decides ESI eligibility, not PF. */
  gross: number;
  /**
   * Does the employer contribute PF on the FULL basic rather than on the
   * ₹15,000 ceiling? Default false — the statutory minimum.
   *
   * EPS is unaffected either way: it is capped by law, not by policy.
   */
  aboveCeiling?: boolean;
};

export type EpfResult = {
  /** The wage PF was actually computed on, after the policy decision. */
  pfWage: number;
  /** The wage EPS was computed on. Always capped. */
  epsWage: number;
  employeePF: number;
  employerEPS: number;
  employerEPF: number;
  esiApplies: boolean;
  employeeESI: number;
  employerESI: number;
  /** What the employee sees deducted. */
  employeeTotal: number;
  /** What the employer pays on top of gross. */
  employerTotal: number;
  /**
   * True when `basic` exceeds the ceiling, i.e. when the policy choice
   * actually changes the answer. Lets the UI explain itself only when the
   * explanation is relevant.
   */
  ceilingBinds: boolean;
};

/**
 * One calculation, used by /epf and /payroll.
 *
 * Rounding is applied per component rather than at the end, because that is
 * how a payslip is produced and how the EPFO challan totals — rounding once at
 * the bottom produces a figure that does not reconcile with the individual
 * lines the employee can see.
 */
export function computeEpf(input: EpfInput): EpfResult {
  const basic = Math.max(0, Number(input.basic) || 0);
  const gross = Math.max(0, Number(input.gross) || 0);
  const aboveCeiling = input.aboveCeiling === true;

  const ceilingBinds = basic > PF_WAGE_CEILING_MONTHLY;
  const pfWage = aboveCeiling ? basic : Math.min(basic, PF_WAGE_CEILING_MONTHLY);

  /* EPS is capped by statute regardless of the employer's policy — this is the
     one line that must NOT follow `aboveCeiling`, and getting it wrong
     overstates the pension slice for every employee above the ceiling. */
  const epsWage = Math.min(pfWage, PF_WAGE_CEILING_MONTHLY);

  const employeePF = Math.round(pfWage * EPF_RATE);
  const employerEPS = Math.round(epsWage * EPS_RATE);
  /* The employer's 12% is split: EPS first, the remainder to EPF. Computing
     the remainder by subtraction (rather than as its own percentage) is what
     keeps employer EPS + employer EPF exactly equal to 12% of the PF wage. */
  const employerEPF = Math.round(pfWage * EPF_RATE) - employerEPS;

  const esiApplies = gross > 0 && gross <= ESI_GROSS_CEILING_MONTHLY;
  const employeeESI = esiApplies ? Math.round(gross * ESI_EMPLOYEE_RATE) : 0;
  const employerESI = esiApplies ? Math.round(gross * ESI_EMPLOYER_RATE) : 0;

  return {
    pfWage, epsWage,
    employeePF, employerEPS, employerEPF,
    esiApplies, employeeESI, employerESI,
    employeeTotal: employeePF + employeeESI,
    employerTotal: employerEPS + employerEPF + employerESI,
    ceilingBinds,
  };
}

/**
 * The ANNUAL PF figure /payroll needs, from the same ladder.
 *
 * payroll-calc works in annual CTC, so it had its own inline
 * `Math.min(basic, 15_000 * 12) * 0.12`. Same rule, different period — which
 * is precisely how the two files came to disagree in the first place.
 */
export function annualPf(annualBasic: number, aboveCeiling = false): { employee: number; employer: number; base: number } {
  const monthlyBasic = Math.max(0, Number(annualBasic) || 0) / 12;
  const r = computeEpf({ basic: monthlyBasic, gross: 0, aboveCeiling });
  const base = r.pfWage * 12;
  return { employee: r.employeePF * 12, employer: (r.employerEPS + r.employerEPF) * 12, base };
}
