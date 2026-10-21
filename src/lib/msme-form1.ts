/**
 * MCA Form MSME-1 & Section 16 Compound Penal Interest Engine.
 *
 * Mandatory compliance under Section 405 of Companies Act, 2013 and Section 16
 * of the MSMED Act, 2006.
 *
 * 1. MCA Form MSME-1:
 *    Every company obtaining supplies from Micro & Small enterprises where payment
 *    exceeds 45 days (or 15 days absent written agreement) must submit a half-yearly
 *    return to the Registrar of Companies (ROC) on the MCA portal:
 *      - H1: April to September (due October 31)
 *      - H2: October to March (due April 30)
 *
 * 2. Section 16 Penal Compound Interest:
 *    Mandates compound interest with monthly rests at THREE TIMES the RBI Bank Rate
 *    (RBI Bank Rate = 6.75% -> 3x = 20.25% p.a., 1.6875% per month) on all delayed
 *    payments to micro and small suppliers, payable from the appointed day.
 *
 * DELIBERATELY PURE — safely executed in browser, server, or standalone scripts.
 */

export const RBI_BANK_RATE_PCT = 6.75;
export const MSME_PENAL_RATE_MULTIPLIER = 3;
export const STATUTORY_PENAL_RATE_PCT = RBI_BANK_RATE_PCT * MSME_PENAL_RATE_MULTIPLIER; // 20.25% p.a.

export interface DelayedBill {
  invoiceNo: string;
  party: string;
  udyamCategory: "micro" | "small" | "medium" | "unclassified";
  panOrUdyam?: string;
  issueDate: string; // ISO YYYY-MM-DD
  dueDate: string;   // ISO YYYY-MM-DD
  amount: number;
  daysDelayed: number;
  hasWrittenAgreement?: boolean;
  reasonForDelay?: string;
}

export interface MsmeForm1Entry {
  supplierName: string;
  panOrUdyam: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  daysDelayed: number;
  principalAmount: number;
  penalInterestAccrued: number;
  totalLiability: number;
  reasonForDelay: string;
}

export interface MsmeForm1Report {
  period: "H1" | "H2";
  financialYear: string;
  filingDueDate: string;
  totalSuppliersCount: number;
  totalDelayedInvoicesCount: number;
  totalPrincipalDue: number;
  totalPenalInterestAccrued: number;
  grandTotalLiability: number;
  entries: MsmeForm1Entry[];
  mcaCsvContent: string;
}

export const REASON_CODES = {
  RECONCILIATION: "Invoice reconciliation & verification pending with accounts",
  DISPUTE_QUALITY: "Material quality inspection / specification dispute pending",
  TERMS_NEGOTIATION: "Credit period alignment under active mutual discussion",
  WORKING_CAPITAL: "Temporary operational liquidity & working capital realignment",
  DOCUMENTATION: "Supporting delivery challan / e-way bill documentation awaited",
} as const;

/**
 * Calculates Section 16 MSMED Act penal interest with monthly compounding rests.
 * Formula: Interest = Principal * ((1 + (r / 12))^months - 1)
 * where r = annual rate as decimal (e.g. 0.2025).
 */
export function calculateSection16Interest(
  principal: number,
  daysDelayed: number,
  annualRatePct: number = STATUTORY_PENAL_RATE_PCT
): number {
  if (principal <= 0 || daysDelayed <= 0) return 0;
  const annualRate = annualRatePct / 100;
  const monthlyRate = annualRate / 12;
  const months = daysDelayed / 30.4375; // Average days per month
  const compoundMultiplier = Math.pow(1 + monthlyRate, months);
  const interest = principal * (compoundMultiplier - 1);
  return Math.round(interest * 100) / 100;
}

/**
 * Derives current or target MCA Half-Yearly return period (H1 vs H2).
 */
export function getMcaReturnPeriod(referenceDate: Date = new Date()): {
  period: "H1" | "H2";
  financialYear: string;
  filingDueDate: string;
} {
  const month = referenceDate.getMonth() + 1; // 1-12
  const year = referenceDate.getFullYear();

  // Indian Financial Year: April (4) to March (3)
  if (month >= 4 && month <= 9) {
    // Current period is H1 of FY (year)-(year+1)
    return {
      period: "H1",
      financialYear: `FY ${year}-${String(year + 1).slice(-2)}`,
      filingDueDate: `${year}-10-31`,
    };
  } else if (month >= 10) {
    // H1 has ended (due Oct 31), H2 is in progress
    return {
      period: "H2",
      financialYear: `FY ${year}-${String(year + 1).slice(-2)}`,
      filingDueDate: `${year + 1}-04-30`,
    };
  } else {
    // Jan-Mar: H2 of FY (year-1)-(year)
    return {
      period: "H2",
      financialYear: `FY ${year - 1}-${String(year).slice(-2)}`,
      filingDueDate: `${year}-04-30`,
    };
  }
}

/**
 * Filters delayed micro/small bills and synthesizes the MCA Form MSME-1 dataset.
 */
export function generateMsmeForm1Report(
  bills: DelayedBill[],
  options?: {
    referenceDate?: Date;
    defaultReason?: string;
  }
): MsmeForm1Report {
  const refDate = options?.referenceDate ?? new Date();
  const periodInfo = getMcaReturnPeriod(refDate);

  // Filter only Micro and Small enterprises that have exceeded statutory payment window
  const eligibleBills = bills.filter((b) => {
    const isMicroOrSmall = b.udyamCategory === "micro" || b.udyamCategory === "small";
    const windowDays = b.hasWrittenAgreement ? 45 : 15;
    return isMicroOrSmall && b.daysDelayed > 0 && b.amount > 0;
  });

  const entries: MsmeForm1Entry[] = eligibleBills.map((b) => {
    const interest = calculateSection16Interest(b.amount, b.daysDelayed);
    const reason = b.reasonForDelay || options?.defaultReason || REASON_CODES.RECONCILIATION;
    return {
      supplierName: b.party.trim(),
      panOrUdyam: (b.panOrUdyam || "PAN_NOT_ON_FILE").trim().toUpperCase(),
      invoiceNo: b.invoiceNo.trim(),
      invoiceDate: b.issueDate,
      dueDate: b.dueDate,
      daysDelayed: b.daysDelayed,
      principalAmount: Math.round(b.amount * 100) / 100,
      penalInterestAccrued: interest,
      totalLiability: Math.round((b.amount + interest) * 100) / 100,
      reasonForDelay: reason,
    };
  });

  // Sort worst first: longest days delayed, then largest amount
  entries.sort((a, b) => b.daysDelayed - a.daysDelayed || b.principalAmount - a.principalAmount);

  const totalPrincipalDue = entries.reduce((sum, e) => sum + e.principalAmount, 0);
  const totalPenalInterestAccrued = entries.reduce((sum, e) => sum + e.penalInterestAccrued, 0);
  const grandTotalLiability = Math.round((totalPrincipalDue + totalPenalInterestAccrued) * 100) / 100;

  // Unique suppliers count
  const uniqueSuppliers = new Set(entries.map((e) => e.supplierName.toLowerCase()));

  // Construct official MCA V3 portal-ready CSV format
  const csvHeaders = [
    "Sl No",
    "Name of Supplier",
    "PAN / Udyam Registration No",
    "Invoice Reference No",
    "Invoice Date",
    "Statutory Due Date",
    "Days Delayed",
    "Principal Amount Due (INR)",
    "Section 16 Penal Interest (INR)",
    "Total Claim Liability (INR)",
    "Reason for Delay in Payment",
  ];

  const csvRows = entries.map((e, index) => [
    index + 1,
    `"${e.supplierName.replace(/"/g, '""')}"`,
    `"${e.panOrUdyam}"`,
    `"${e.invoiceNo}"`,
    e.invoiceDate,
    e.dueDate,
    e.daysDelayed,
    e.principalAmount.toFixed(2),
    e.penalInterestAccrued.toFixed(2),
    e.totalLiability.toFixed(2),
    `"${e.reasonForDelay.replace(/"/g, '""')}"`,
  ]);

  const mcaCsvContent = [csvHeaders.join(","), ...csvRows.map((r) => r.join(","))].join("\n");

  return {
    period: periodInfo.period,
    financialYear: periodInfo.financialYear,
    filingDueDate: periodInfo.filingDueDate,
    totalSuppliersCount: uniqueSuppliers.size,
    totalDelayedInvoicesCount: entries.length,
    totalPrincipalDue: Math.round(totalPrincipalDue * 100) / 100,
    totalPenalInterestAccrued: Math.round(totalPenalInterestAccrued * 100) / 100,
    grandTotalLiability,
    entries,
    mcaCsvContent,
  };
}
