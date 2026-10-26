/**
 * RBI TReDS (Trade Receivables Electronic Discounting System) Reverse Factoring Engine.
 *
 * Statutory & Regulatory Framework:
 * - Guidelines issued by the Reserve Bank of India (RBI) under Section 10(2) read with Section 18
 *   of the Payment and Settlement Systems Act, 2007 (Act 51 of 2007).
 * - Enables Micro, Small and Medium Enterprises (MSMEs) to auction trade receivables
 *   against large corporates, CPSEs, and Government departments.
 * - Institutional Bidding: Multiple financiers (Public & Private Banks, NBFC-Factors) bid competitively.
 * - Non-Recourse: Factoring is conducted on a non-recourse basis to the MSME seller once accepted by buyer.
 * - Turnaround: 48–72 hours direct bank credit vs standard 60–120 days corporate payment cycles.
 * - Cost Arbitrage: Discounting occurs at corporate buyer's credit rating (7.5%–9.5% p.a.)
 *   instead of MSME's high borrowing cost (16%–24% p.a.).
 *
 * DELIBERATELY PURE — zero external network dependencies, runnable client/server/CLI.
 */

export interface TredsCalculationInput {
  invoiceAmount: number;
  paymentTermDays: number; // e.g. 45, 60, 90, 120 days
  tredsDiscountRatePct?: number; // e.g. 8.5% p.a. (market average)
  alternativeBorrowingRatePct?: number; // e.g. 16.0% p.a. (standard SME bank CC/OD rate)
  platformFeePct?: number; // Standard platform fee ~0.04%
}

export interface TredsCalculationResult {
  invoiceAmount: number;
  paymentTermDays: number;
  tredsAnnualRatePct: number;
  alternativeAnnualRatePct: number;
  tredsDiscountCost: number;
  platformFeeAmount: number;
  totalTredsDeduction: number;
  immediateCashDisbursed: number;
  alternativeFinancingCost: number;
  netInterestSaved: number;
  annualizedWorkingCapitalRoiPct: number;
  turnaroundWindowHours: string;
  recourseType: "WITHOUT_RECOURSE";
  authorizedExchanges: string[];
}

export const DEFAULT_TREDS_RATE_PCT = 8.5; // Average institutional bid rate
export const DEFAULT_ALT_SME_BORROWING_RATE_PCT = 16.5; // Average SME unsecured / CC OD rate
export const DEFAULT_PLATFORM_FEE_PCT = 0.04; // Standard exchange transaction fee (0.04%)

export const RBI_AUTHORIZED_TREDS_EXCHANGES = [
  "RXIL (Receivables Exchange of India Ltd — SIDBI & NSE)",
  "Invoicemart (A.TREDS Ltd — Axis Bank & mjunction)",
  "M1xchange (Mynd Solutions)",
  "C2FO Factoring Solutions",
];

/**
 * Calculates net working capital cash release and interest arbitrage under RBI TReDS.
 */
export function calculateTredsArbitrage(input: TredsCalculationInput): TredsCalculationResult {
  const principal = Math.max(0, input.invoiceAmount);
  const days = Math.max(1, input.paymentTermDays);
  const tredsRate = input.tredsDiscountRatePct ?? DEFAULT_TREDS_RATE_PCT;
  const altRate = input.alternativeBorrowingRatePct ?? DEFAULT_ALT_SME_BORROWING_RATE_PCT;
  const platFeePct = input.platformFeePct ?? DEFAULT_PLATFORM_FEE_PCT;

  // 1. TReDS Discount Cost = Principal * (tredsRate / 100) * (days / 365)
  const discountCost = (principal * (tredsRate / 100) * days) / 365;

  // 2. Exchange Platform Transaction Fee
  const platformFee = (principal * (platFeePct / 100));

  const totalDeduction = discountCost + platformFee;
  const immediateCash = Math.max(0, principal - totalDeduction);

  // 3. Alternative SME Borrowing Cost (Cash Credit / OD interest over the same duration)
  const altCost = (principal * (altRate / 100) * days) / 365;

  // 4. Net Savings & ROI
  const netSavings = Math.max(0, altCost - totalDeduction);
  const roiPct = totalDeduction > 0 ? (netSavings / totalDeduction) * 100 : 0;

  return {
    invoiceAmount: Math.round(principal * 100) / 100,
    paymentTermDays: days,
    tredsAnnualRatePct: tredsRate,
    alternativeAnnualRatePct: altRate,
    tredsDiscountCost: Math.round(discountCost * 100) / 100,
    platformFeeAmount: Math.round(platformFee * 100) / 100,
    totalTredsDeduction: Math.round(totalDeduction * 100) / 100,
    immediateCashDisbursed: Math.round(immediateCash * 100) / 100,
    alternativeFinancingCost: Math.round(altCost * 100) / 100,
    netInterestSaved: Math.round(netSavings * 100) / 100,
    annualizedWorkingCapitalRoiPct: Math.round(roiPct * 10) / 10,
    turnaroundWindowHours: "48 to 72 Hours",
    recourseType: "WITHOUT_RECOURSE",
    authorizedExchanges: RBI_AUTHORIZED_TREDS_EXCHANGES,
  };
}
