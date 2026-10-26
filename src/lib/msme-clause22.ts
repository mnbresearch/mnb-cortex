/**
 * Form 3CD Clause 22 & Section 43B(h) Statutory Tax Audit Engine.
 *
 * Requirements under Section 44AB of the Income-tax Act, 1961 read with:
 * - Clause 22 of Form 3CD (Tax Audit Report): Amount of interest inadmissible
 *   under Section 23 of the MSMED Act, 2006.
 * - Section 22 of MSMED Act, 2006: Accounting disclosures required in annual accounts.
 * - Section 43B(h) of Income-tax Act: Disallowance of expenses due to Micro & Small
 *   enterprises not paid within statutory limit (15 days or agreed up to 45 days).
 *
 * Pure statutory logic — works safely in browser, Node, and standalone scripts.
 */

import { calculateSection16Interest, STATUTORY_PENAL_RATE_PCT } from "./msme-form1.ts";

export interface Clause22BillInput {
  invoiceNo: string;
  party: string;
  udyamRegistrationNo?: string;
  udyamCategory: "micro" | "small" | "medium" | "unclassified";
  invoiceDate: string; // ISO YYYY-MM-DD
  dueDate: string;     // ISO YYYY-MM-DD
  paymentDate?: string; // ISO YYYY-MM-DD or undefined if unpaid as on balance sheet date
  amount: number;      // Principal amount in INR
  hasWrittenAgreement: boolean;
}

export interface Clause22AuditRow {
  invoiceNo: string;
  party: string;
  udyamCategory: string;
  invoiceDate: string;
  dueDate: string;
  paymentDate: string | "UNPAID";
  amount: number;
  statutoryLimitDays: number;
  actualDelayDays: number;
  penalInterestSection16: number;
  isDisallowed43Bh: boolean;
  disallowedAmount: number;
  clause22Status: "paid_on_time" | "paid_delayed_same_fy" | "unpaid_past_window" | "unpaid_within_window";
  reason: string;
}

export interface Form3CdClause22Report {
  assessmentYear: string;
  financialYear: string;
  asOfDate: string;
  // Summary conforming to Section 22 of MSMED Act / Form 3CD Clause 22
  disclosureSection22: {
    // (i) Principal and interest remaining unpaid at end of accounting year
    principalUnpaidAtYearEnd: number;
    interestDueUnpaidAtYearEnd: number;
    // (ii) Interest paid in terms of Section 16 along with payment made beyond appointed day
    interestPaidUnderSec16: number;
    delayedPaymentsMadeDuringYear: number;
    // (iii) Interest due and payable for delay (which has been paid but without adding Sec 16 interest)
    interestDueForDelayedPaid: number;
    // (iv) Interest accrued and remaining unpaid at end of year
    interestAccruedUnpaidYearEnd: number;
    // (v) Further interest remaining due and payable in succeeding years
    furtherInterestSucceedingYears: number;
    // (vi) Total interest inadmissible under Section 23 of MSMED Act
    totalInterestInadmissibleSec23: number;
  };
  // Section 43B(h) disallowance schedule for computation of business income (PGBP)
  section43BhDisallowance: {
    totalDisallowedPurchases: number;
    potentialTaxImpactAt30Pct: number; // 30% corporate / firm tax + 4% cess = 31.2%
    microUnpaidDisallowed: number;
    smallUnpaidDisallowed: number;
    unclassifiedPayablesAtRisk: number;
    billsDisallowedCount: number;
  };
  rows: Clause22AuditRow[];
  csvContent: string;
}

/**
 * Derives Financial Year (FY) and Assessment Year (AY) from an asOfDate.
 * e.g., 2026-03-31 -> FY 2025-26, AY 2026-27.
 */
export function getTaxAuditPeriod(asOfDate: Date = new Date()): { financialYear: string; assessmentYear: string } {
  const year = asOfDate.getUTCFullYear();
  const month = asOfDate.getUTCMonth() + 1; // 1-12

  if (month >= 4) {
    // April to December: current year to next year
    const fyStart = year;
    const fyEnd = year + 1;
    return {
      financialYear: `FY ${fyStart}-${String(fyEnd).slice(2)}`,
      assessmentYear: `AY ${fyEnd}-${String(fyEnd + 1).slice(2)}`,
    };
  } else {
    // January to March: previous year to current year
    const fyStart = year - 1;
    const fyEnd = year;
    return {
      financialYear: `FY ${fyStart}-${String(fyEnd).slice(2)}`,
      assessmentYear: `AY ${fyEnd}-${String(fyEnd + 1).slice(2)}`,
    };
  }
}

/**
 * Calculates days difference between two ISO date strings (Y2 - Y1).
 */
function dateDiffDays(d1: string, d2: string): number {
  const t1 = new Date(d1 + "T00:00:00Z").getTime();
  const t2 = new Date(d2 + "T00:00:00Z").getTime();
  if (isNaN(t1) || isNaN(t2)) return 0;
  return Math.round((t2 - t1) / 86400000);
}

/**
 * Generates the Form 3CD Clause 22 Schedule & Section 43B(h) Disallowance Report.
 */
export function generateClause22Report(
  bills: Clause22BillInput[],
  balanceSheetDate: string = new Date().toISOString().slice(0, 10)
): Form3CdClause22Report {
  const asOf = new Date(balanceSheetDate + "T00:00:00Z");
  const { financialYear, assessmentYear } = getTaxAuditPeriod(asOf);

  let principalUnpaidAtYearEnd = 0;
  let interestDueUnpaidAtYearEnd = 0;
  let interestPaidUnderSec16 = 0;
  let delayedPaymentsMadeDuringYear = 0;
  let interestDueForDelayedPaid = 0;
  let interestAccruedUnpaidYearEnd = 0;
  let totalDisallowedPurchases = 0;
  let microUnpaidDisallowed = 0;
  let smallUnpaidDisallowed = 0;
  let unclassifiedPayablesAtRisk = 0;
  let billsDisallowedCount = 0;

  const rows: Clause22AuditRow[] = [];

  for (const bill of bills) {
    const isCovered = bill.udyamCategory === "micro" || bill.udyamCategory === "small";
    const statutoryLimit = bill.hasWrittenAgreement ? 45 : 15;
    
    // Effective due date based on statutory rule (cannot exceed 45 days even if contract says 90)
    const issueDateObj = new Date(bill.invoiceDate + "T00:00:00Z");
    const statutoryDueDateObj = new Date(issueDateObj.getTime() + statutoryLimit * 86400000);
    const statutoryDueDateStr = statutoryDueDateObj.toISOString().slice(0, 10);

    const isPaid = !!bill.paymentDate && bill.paymentDate.trim().length > 0;
    const paymentDateStr = isPaid ? bill.paymentDate! : balanceSheetDate;

    // Check delay beyond statutory limit
    const delayDays = Math.max(0, dateDiffDays(statutoryDueDateStr, paymentDateStr));
    const penalInterest = isCovered && delayDays > 0 ? calculateSection16Interest(bill.amount, delayDays) : 0;

    let status: Clause22AuditRow["clause22Status"] = "paid_on_time";
    let isDisallowed = false;
    let disallowedAmt = 0;
    let reason = "Paid within statutory timeline.";

    if (isCovered) {
      if (isPaid) {
        if (delayDays > 0) {
          status = "paid_delayed_same_fy";
          delayedPaymentsMadeDuringYear += bill.amount;
          interestDueForDelayedPaid += penalInterest;
          // Note: If paid within same FY before March 31, allowed under 43B(h) for the year,
          // but interest under Section 16 is still mandatory and disallowed under Section 23!
          reason = `Paid delayed by ${delayDays} days. Principal allowed under 43B(h) as paid before year end, Section 16 penal interest ₹${Math.round(penalInterest)} inadmissible under Sec 23.`;
        } else {
          status = "paid_on_time";
          reason = "Paid on time. Fully allowed under 43B(h).";
        }
      } else {
        // Unpaid as on balance sheet date
        const delayAsOfYearEnd = Math.max(0, dateDiffDays(statutoryDueDateStr, balanceSheetDate));
        if (delayAsOfYearEnd > 0) {
          status = "unpaid_past_window";
          isDisallowed = true;
          disallowedAmt = bill.amount;
          totalDisallowedPurchases += bill.amount;
          billsDisallowedCount++;

          if (bill.udyamCategory === "micro") microUnpaidDisallowed += bill.amount;
          if (bill.udyamCategory === "small") smallUnpaidDisallowed += bill.amount;

          principalUnpaidAtYearEnd += bill.amount;
          interestDueUnpaidAtYearEnd += penalInterest;
          interestAccruedUnpaidYearEnd += penalInterest;

          reason = `Unpaid past ${statutoryLimit}d limit on balance sheet date. DISALLOWED under Section 43B(h) in ${assessmentYear}. Interest ₹${Math.round(penalInterest)} inadmissible under Sec 23.`;
        } else {
          status = "unpaid_within_window";
          principalUnpaidAtYearEnd += bill.amount;
          reason = `Unpaid but invoice is within ${statutoryLimit}d window as of balance sheet date. Allowed under Section 43B(h) if paid by due date.`;
        }
      }
    } else if (bill.udyamCategory === "unclassified") {
      unclassifiedPayablesAtRisk += bill.amount;
      reason = "Supplier Udyam category unclassified — classify immediately to avoid audit disallowance query.";
    } else {
      reason = "Medium or unregistered enterprise — Section 43B(h) and MSMED Section 16 not applicable.";
    }

    rows.push({
      invoiceNo: bill.invoiceNo,
      party: bill.party,
      udyamCategory: bill.udyamCategory,
      invoiceDate: bill.invoiceDate,
      dueDate: statutoryDueDateStr,
      paymentDate: isPaid ? bill.paymentDate! : "UNPAID",
      amount: bill.amount,
      statutoryLimitDays: statutoryLimit,
      actualDelayDays: delayDays,
      penalInterestSection16: penalInterest,
      isDisallowed43Bh: isDisallowed,
      disallowedAmount: disallowedAmt,
      clause22Status: status,
      reason,
    });
  }

  const totalInterestInadmissible = interestDueUnpaidAtYearEnd + interestDueForDelayedPaid;
  const potentialTaxImpact = Math.round(totalDisallowedPurchases * 0.312); // 30% tax + 4% health & education cess

  // CSV Construction for CA Audit File & Tax Audit Software
  const csvHeaders = [
    "Supplier Name",
    "Udyam Category",
    "Invoice No",
    "Invoice Date",
    "Statutory Limit (Days)",
    "Statutory Due Date",
    "Payment Date",
    "Principal Amount (INR)",
    "Delay (Days)",
    "Section 16 Compound Interest (INR)",
    "Section 43B(h) Disallowance (INR)",
    "Audit Status",
    "Auditor Note",
  ];

  const csvRows = rows.map((r) => [
    `"${r.party.replace(/"/g, '""')}"`,
    r.udyamCategory,
    `"${r.invoiceNo.replace(/"/g, '""')}"`,
    r.invoiceDate,
    r.statutoryLimitDays,
    r.dueDate,
    r.paymentDate,
    r.amount.toFixed(2),
    r.actualDelayDays,
    r.penalInterestSection16.toFixed(2),
    r.disallowedAmount.toFixed(2),
    r.clause22Status,
    `"${r.reason.replace(/"/g, '""')}"`,
  ]);

  const csvContent = [csvHeaders.join(","), ...csvRows.map((r) => r.join(","))].join("\r\n");

  return {
    assessmentYear,
    financialYear,
    asOfDate: balanceSheetDate,
    disclosureSection22: {
      principalUnpaidAtYearEnd,
      interestDueUnpaidAtYearEnd,
      interestPaidUnderSec16,
      delayedPaymentsMadeDuringYear,
      interestDueForDelayedPaid,
      interestAccruedUnpaidYearEnd,
      furtherInterestSucceedingYears: 0,
      totalInterestInadmissibleSec23: totalInterestInadmissible,
    },
    section43BhDisallowance: {
      totalDisallowedPurchases,
      potentialTaxImpactAt30Pct: potentialTaxImpact,
      microUnpaidDisallowed,
      smallUnpaidDisallowed,
      unclassifiedPayablesAtRisk,
      billsDisallowedCount,
    },
    rows,
    csvContent,
  };
}
