/**
 * Statutory TDS Section 206AB Higher Rate Defense & Section 201 Penal Interest Engine.
 *
 * Statutory Framework:
 * Income-tax Act, 1961 (and Income-tax Act, 2025):
 * - Section 206AB: Mandatory higher withholding for "specified persons" (non-filers of ITR
 *   whose aggregate TDS/TCS >= ₹50,000 in the relevant previous year).
 *   Rate = Higher of (2x normal rate, 5%). If no PAN, Section 206AA rate (20%) or 206AB, whichever is higher.
 * - Section 201(1A): Penal interest for delay in TDS deposit:
 *   - 1.0% per month/part of month from date of deductible to date of deduction.
 *   - 1.5% per month/part of month from date of deduction to date of actual deposit into govt account.
 * - Rule 30: TDS deposit due date is the 7th of the following month (30th April for March).
 * - Section 234E: Late filing fee of ₹200/day for delayed Form 24Q/26Q/27Q returns.
 * - Section 40(a)(ia): 30% expenditure disallowance for failure to deduct/pay TDS.
 *
 * DELIBERATELY PURE — zero external network dependencies, runnable client/server/CLI.
 */

export interface TdsDeducteeRecord {
  vendorName: string;
  pan: string;
  sectionCode: string; // e.g. "194C", "194J", "194I", "194H", "194Q"
  paymentAmount: number;
  paymentDate: string; // ISO YYYY-MM-DD
  isSpecifiedPerson206AB?: boolean; // Non-filer under Section 206AB
  isLowerDeduction197?: boolean;    // Certificate under Section 197
  lowerDeductionRate?: number;
}

export interface TdsWithholdingResult {
  vendorName: string;
  pan: string;
  hasValidPan: boolean;
  sectionCode: string;
  baseRatePct: number;
  effectiveRatePct: number;
  tdsDeductible: number;
  netPayableToVendor: number;
  challanDueDate: string;
  isHigherRate206AB: boolean;
  isNoPanPenalty206AA: boolean;
  statutoryNote: string;
}

export interface TdsChallanInterestResult {
  tdsAmount: number;
  deductionDate: string;
  challanDueDate: string;
  actualDepositDate: string;
  isDelayed: boolean;
  monthsDelay: number;
  interestRatePctMonthly: number; // 1.5% per month
  penalInterest: number;
  totalDepositPayable: number;
}

export const TDS_BASE_RATES: Record<string, { label: string; rate: number; threshold: number }> = {
  "194C": { label: "Contractor (Company)", rate: 2, threshold: 30000 },
  "194C-ind": { label: "Contractor (Individual/HUF)", rate: 1, threshold: 30000 },
  "194J": { label: "Professional Fees", rate: 10, threshold: 50000 },
  "194J-tech": { label: "Technical Services", rate: 2, threshold: 50000 },
  "194I-land": { label: "Rent (Land & Building)", rate: 10, threshold: 50000 },
  "194I-plant": { label: "Rent (Plant & Machinery)", rate: 2, threshold: 50000 },
  "194H": { label: "Commission & Brokerage", rate: 2, threshold: 20000 },
  "194Q": { label: "Purchase of Goods (> ₹50L)", rate: 0.1, threshold: 5000000 },
};

/** Validates Indian Permanent Account Number (PAN) format */
export function isValidPan(pan: string): boolean {
  if (!pan || typeof pan !== "string") return false;
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.trim().toUpperCase());
}

/**
 * Computes effective withholding rate factoring Section 206AA (No PAN) and Section 206AB (Non-Filer).
 */
export function computeEffectiveTdsRate(
  sectionCode: string,
  hasPan: boolean,
  isSpecifiedPerson206AB: boolean = false,
  lowerRate197?: number
): { rate: number; is206AB: boolean; is206AA: boolean; note: string } {
  const baseDef = TDS_BASE_RATES[sectionCode] || { rate: 10, label: sectionCode };
  let normalRate = baseDef.rate;

  if (typeof lowerRate197 === "number" && lowerRate197 >= 0) {
    return {
      rate: lowerRate197,
      is206AB: false,
      is206AA: false,
      note: `Concessional rate of ${lowerRate197}% applied per Section 197 Lower Deduction Certificate`,
    };
  }

  // Section 206AA: No PAN provided -> 20% flat (except 194Q which is 5%)
  if (!hasPan) {
    const noPanRate = sectionCode === "194Q" ? 5 : 20;
    return {
      rate: noPanRate,
      is206AB: false,
      is206AA: true,
      note: `Higher rate of ${noPanRate}% applied under Section 206AA due to missing/invalid PAN`,
    };
  }

  // Section 206AB: Specified Person (Non-filer of ITR) -> Higher of (2 * normal rate, 5%)
  if (isSpecifiedPerson206AB) {
    const doubleRate = normalRate * 2;
    const rate206AB = Math.max(doubleRate, 5);
    return {
      rate: rate206AB,
      is206AB: true,
      is206AA: false,
      note: `Higher rate of ${rate206AB}% applied under Section 206AB (vendor is non-filer with TDS >= ₹50k)`,
    };
  }

  return {
    rate: normalRate,
    is206AB: false,
    is206AA: false,
    note: `Standard statutory rate of ${normalRate}% under Section ${sectionCode}`,
  };
}

/**
 * Rule 30: Calculates the statutory Challan ITNS 281 deposit due date.
 * 7th of the next month (30th April for March deductions).
 */
export function getTdsChallanDueDate(paymentDateStr: string): string {
  const d = new Date(paymentDateStr);
  if (isNaN(d.getTime())) return "";

  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();

  if (month === 3) {
    // March deductions are due by 30th April
    return `${year}-04-30`;
  }

  // Next month 7th
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const mm = String(nextMonth).padStart(2, "0");
  return `${nextYear}-${mm}-07`;
}

/**
 * Calculates Section 201(1A) penal interest for delayed deposit of deducted TDS.
 * Rule: 1.5% for every month or part of a month from deduction date to deposit date.
 */
export function calculateSection201PenalInterest(
  tdsAmount: number,
  deductionDateStr: string,
  actualDepositDateStr: string
): TdsChallanInterestResult {
  const dueDateStr = getTdsChallanDueDate(deductionDateStr);
  const deductionDate = new Date(deductionDateStr);
  const dueDate = new Date(dueDateStr);
  const depositDate = new Date(actualDepositDateStr);

  const cleanTds = Math.max(0, tdsAmount);

  if (depositDate.getTime() <= dueDate.getTime()) {
    return {
      tdsAmount: cleanTds,
      deductionDate: deductionDateStr,
      challanDueDate: dueDateStr,
      actualDepositDate: actualDepositDateStr,
      isDelayed: false,
      monthsDelay: 0,
      interestRatePctMonthly: 1.5,
      penalInterest: 0,
      totalDepositPayable: cleanTds,
    };
  }

  // Under Section 201(1A)(ii), interest is charged from the date of DEDUCTION, not due date!
  // Count each calendar month or part of a month.
  let monthsCount = 0;
  const cur = new Date(deductionDate.getFullYear(), deductionDate.getMonth(), 1);
  const end = new Date(depositDate.getFullYear(), depositDate.getMonth(), 1);

  while (cur <= end) {
    monthsCount++;
    cur.setMonth(cur.getMonth() + 1);
  }

  monthsCount = Math.max(1, monthsCount);
  const penalInterest = Math.round(cleanTds * 0.015 * monthsCount);

  return {
    tdsAmount: cleanTds,
    deductionDate: deductionDateStr,
    challanDueDate: dueDateStr,
    actualDepositDate: actualDepositDateStr,
    isDelayed: true,
    monthsDelay: monthsCount,
    interestRatePctMonthly: 1.5,
    penalInterest,
    totalDepositPayable: cleanTds + penalInterest,
  };
}

/**
 * Evaluates a batch of vendor payments and computes complete withholding and statutory notes.
 */
export function evaluateTdsBatch(records: TdsDeducteeRecord[]): {
  totalPayment: number;
  totalTds: number;
  totalNetPayable: number;
  nonFilerCount: number;
  noPanCount: number;
  items: TdsWithholdingResult[];
} {
  let totalPayment = 0;
  let totalTds = 0;
  let totalNetPayable = 0;
  let nonFilerCount = 0;
  let noPanCount = 0;

  const items: TdsWithholdingResult[] = records.map((r) => {
    const hasPan = isValidPan(r.pan);
    const rateInfo = computeEffectiveTdsRate(
      r.sectionCode,
      hasPan,
      r.isSpecifiedPerson206AB,
      r.lowerDeductionRate
    );

    const baseDef = TDS_BASE_RATES[r.sectionCode] || { rate: 10 };
    const payment = Math.max(0, r.paymentAmount);
    const tds = Math.round((payment * rateInfo.rate) / 100);
    const net = payment - tds;

    totalPayment += payment;
    totalTds += tds;
    totalNetPayable += net;

    if (rateInfo.is206AB) nonFilerCount++;
    if (rateInfo.is206AA) noPanCount++;

    return {
      vendorName: r.vendorName,
      pan: r.pan.trim().toUpperCase(),
      hasValidPan: hasPan,
      sectionCode: r.sectionCode,
      baseRatePct: baseDef.rate,
      effectiveRatePct: rateInfo.rate,
      tdsDeductible: tds,
      netPayableToVendor: net,
      challanDueDate: getTdsChallanDueDate(r.paymentDate),
      isHigherRate206AB: rateInfo.is206AB,
      isNoPanPenalty206AA: rateInfo.is206AA,
      statutoryNote: rateInfo.note,
    };
  });

  return {
    totalPayment: Math.round(totalPayment * 100) / 100,
    totalTds: Math.round(totalTds * 100) / 100,
    totalNetPayable: Math.round(totalNetPayable * 100) / 100,
    nonFilerCount,
    noPanCount,
    items,
  };
}
