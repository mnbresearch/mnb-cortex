/**
 * Statutory GSTR-2B vs Purchase Register ITC Matching & Section 16(2)(aa) Defense Engine.
 *
 * Compliance requirement under Section 16(2)(aa) of the CGST Act and Rule 37A:
 * - A registered buyer can ONLY claim Input Tax Credit (ITC) if the supplier has
 *   uploaded the invoice in GSTR-1 and it appears in the recipient's GSTR-2B.
 * - Under Rule 37A, if the supplier fails to file GSTR-3B by November 30 following
 *   the end of the financial year, the buyer must reverse the claimed ITC.
 * - Under Section 17(5), blocked credits (food & beverages, personal vehicles,
 *   club memberships, free gifts) must be excluded from eligible credit.
 *
 * DELIBERATELY PURE — safely executed on client, server, or standalone scripts.
 */

export interface PurchaseInvoiceRecord {
  invoiceNo: string;
  supplierGstin: string;
  supplierName: string;
  invoiceDate: string; // ISO YYYY-MM-DD
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  isBlocked17_5?: boolean; // Section 17(5) blocked credit flag
}

export interface Gstr2bRecord {
  invoiceNo: string;
  supplierGstin: string;
  supplierName: string;
  invoiceDate: string; // ISO YYYY-MM-DD
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  filingDateGstr1?: string;
  itcAvailable: boolean; // Flagged by GSTN
}

export type ItcMatchStatus =
  | "matched"             // 100% matched within tolerance — safe to claim
  | "missing_in_2b"       // In books, not in 2B — hold supplier payment, DRC-01C risk
  | "missing_in_books"    // In 2B, not in books — unclaimed ITC opportunity
  | "tax_mismatch"        // In both, but values differ > ₹2
  | "blocked_section_17_5"; // Ineligible blocked credit per Sec 17(5)

export interface ItcReconciliationItem {
  invoiceNo: string;
  supplierGstin: string;
  supplierName: string;
  status: ItcMatchStatus;
  bookTaxable: number;
  portalTaxable: number;
  bookTax: number;
  portalTax: number;
  taxDifference: number;
  recommendedAction: string;
}

export interface ItcReconciliationResult {
  summary: {
    totalBookItc: number;
    totalPortalItc: number;
    eligibleItcGstr3B: number; // Table 4(A)(5) Net Eligible
    atRiskItc: number;         // Missing in 2B or mismatched
    unclaimedItc: number;      // Available in 2B but missed in books
    blockedItc17_5: number;    // Blocked under Section 17(5)
    matchedCount: number;
    missingIn2BCount: number;
    missingInBooksCount: number;
    mismatchCount: number;
    blockedCount: number;
  };
  items: ItcReconciliationItem[];
}

const normInv = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const normGstin = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Reconciles customer's Purchase Register with auto-drafted GSTR-2B data.
 */
export function reconcileItc(
  purchaseRegister: PurchaseInvoiceRecord[],
  gstr2b: Gstr2bRecord[],
  toleranceRupees: number = 2.0
): ItcReconciliationResult {
  const items: ItcReconciliationItem[] = [];

  // Index GSTR-2B records by normalized GSTIN + Invoice Number
  const portalMap = new Map<string, Gstr2bRecord>();
  for (const p of gstr2b) {
    const key = `${normGstin(p.supplierGstin)}_${normInv(p.invoiceNo)}`;
    portalMap.set(key, p);
  }

  const processedPortalKeys = new Set<string>();

  let totalBookItc = 0;
  let eligibleItcGstr3B = 0;
  let atRiskItc = 0;
  let blockedItc17_5 = 0;
  let matchedCount = 0;
  let missingIn2BCount = 0;
  let mismatchCount = 0;
  let blockedCount = 0;

  for (const b of purchaseRegister) {
    totalBookItc += b.totalTax;
    const key = `${normGstin(b.supplierGstin)}_${normInv(b.invoiceNo)}`;
    const portalMatch = portalMap.get(key);

    if (b.isBlocked17_5) {
      blockedItc17_5 += b.totalTax;
      blockedCount++;
      items.push({
        invoiceNo: b.invoiceNo,
        supplierGstin: b.supplierGstin,
        supplierName: b.supplierName,
        status: "blocked_section_17_5",
        bookTaxable: b.taxableValue,
        portalTaxable: portalMatch ? portalMatch.taxableValue : 0,
        bookTax: b.totalTax,
        portalTax: portalMatch ? portalMatch.totalTax : 0,
        taxDifference: 0,
        recommendedAction: "Exclude from GSTR-3B Table 4(A)(5); report under Ineligible ITC 4(B)(1).",
      });
      if (portalMatch) processedPortalKeys.add(key);
      continue;
    }

    if (!portalMatch) {
      atRiskItc += b.totalTax;
      missingIn2BCount++;
      items.push({
        invoiceNo: b.invoiceNo,
        supplierGstin: b.supplierGstin,
        supplierName: b.supplierName,
        status: "missing_in_2b",
        bookTaxable: b.taxableValue,
        portalTaxable: 0,
        bookTax: b.totalTax,
        portalTax: 0,
        taxDifference: b.totalTax,
        recommendedAction: "Supplier has not filed GSTR-1. Hold payment until invoice appears in 2B to prevent DRC-01C notice.",
      });
      continue;
    }

    processedPortalKeys.add(key);

    const taxDiff = Math.abs(b.totalTax - portalMatch.totalTax);
    const taxableDiff = Math.abs(b.taxableValue - portalMatch.taxableValue);

    if (taxDiff <= toleranceRupees && taxableDiff <= toleranceRupees) {
      eligibleItcGstr3B += b.totalTax;
      matchedCount++;
      items.push({
        invoiceNo: b.invoiceNo,
        supplierGstin: b.supplierGstin,
        supplierName: b.supplierName,
        status: "matched",
        bookTaxable: b.taxableValue,
        portalTaxable: portalMatch.taxableValue,
        bookTax: b.totalTax,
        portalTax: portalMatch.totalTax,
        taxDifference: 0,
        recommendedAction: "Fully verified. Safe to claim in GSTR-3B Table 4(A)(5).",
      });
    } else {
      atRiskItc += Math.max(0, b.totalTax - portalMatch.totalTax);
      eligibleItcGstr3B += Math.min(b.totalTax, portalMatch.totalTax);
      mismatchCount++;
      items.push({
        invoiceNo: b.invoiceNo,
        supplierGstin: b.supplierGstin,
        supplierName: b.supplierName,
        status: "tax_mismatch",
        bookTaxable: b.taxableValue,
        portalTaxable: portalMatch.taxableValue,
        bookTax: b.totalTax,
        portalTax: portalMatch.totalTax,
        taxDifference: Math.round(taxDiff * 100) / 100,
        recommendedAction: `Mismatch of ₹${taxDiff.toFixed(2)}. Claim lower portal amount (${portalMatch.totalTax.toFixed(2)}) and request supplier amendment in GSTR-1.`,
      });
    }
  }

  // Check portal records that were missing in customer's purchase books
  let unclaimedItc = 0;
  let missingInBooksCount = 0;

  for (const [key, p] of portalMap) {
    if (!processedPortalKeys.has(key)) {
      unclaimedItc += p.totalTax;
      missingInBooksCount++;
      items.push({
        invoiceNo: p.invoiceNo,
        supplierGstin: p.supplierGstin,
        supplierName: p.supplierName,
        status: "missing_in_books",
        bookTaxable: 0,
        portalTaxable: p.taxableValue,
        bookTax: 0,
        portalTax: p.totalTax,
        taxDifference: p.totalTax,
        recommendedAction: "Present in GSTR-2B but unrecorded in purchase register. Record voucher in books to claim credit.",
      });
    }
  }

  const totalPortalItc = gstr2b.reduce((sum, p) => sum + p.totalTax, 0);

  return {
    summary: {
      totalBookItc: Math.round(totalBookItc * 100) / 100,
      totalPortalItc: Math.round(totalPortalItc * 100) / 100,
      eligibleItcGstr3B: Math.round(eligibleItcGstr3B * 100) / 100,
      atRiskItc: Math.round(atRiskItc * 100) / 100,
      unclaimedItc: Math.round(unclaimedItc * 100) / 100,
      blockedItc17_5: Math.round(blockedItc17_5 * 100) / 100,
      matchedCount,
      missingIn2BCount,
      missingInBooksCount,
      mismatchCount,
      blockedCount,
    },
    items,
  };
}

/**
 * Generates official statutory CSV audit trail for GSTR-2B vs Purchase Books ITC reconciliation.
 */
export function generateItcReconciliationCsv(result: ItcReconciliationResult): string {
  const headers = [
    "Invoice No",
    "Supplier GSTIN",
    "Supplier Name",
    "Reconciliation Status",
    "Book Taxable (INR)",
    "Portal Taxable (INR)",
    "Book Tax (INR)",
    "Portal Tax (INR)",
    "Tax Difference (INR)",
    "Recommended Statutory Action",
  ];

  const rows = result.items.map((item) => [
    `"${item.invoiceNo.replace(/"/g, '""')}"`,
    `"${item.supplierGstin.replace(/"/g, '""')}"`,
    `"${(item.supplierName || "").replace(/"/g, '""')}"`,
    `"${item.status}"`,
    item.bookTaxable.toFixed(2),
    item.portalTaxable.toFixed(2),
    item.bookTax.toFixed(2),
    item.portalTax.toFixed(2),
    item.taxDifference.toFixed(2),
    `"${(item.recommendedAction || "").replace(/"/g, '""')}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
}

