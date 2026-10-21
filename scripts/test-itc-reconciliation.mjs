/**
 * Test suite for Statutory GSTR-2B ITC Matching & Section 16(2)(aa) Defense Engine.
 */

import { reconcileItc, generateItcReconciliationCsv } from "../src/lib/itc-reconciliation.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing Statutory GSTR-2B ITC Matching Engine ===");

// 1. Reconciliation Scenario Testing
{
  const purchaseRegister = [
    {
      invoiceNo: "INV-2026-001",
      supplierGstin: "27AABCT1234A1Z5",
      supplierName: "Mahindra Logistics Ltd",
      invoiceDate: "2026-09-05",
      taxableValue: 100000,
      igst: 18000,
      cgst: 0,
      sgst: 0,
      totalTax: 18000,
    },
    {
      invoiceNo: "INV-2026-002",
      supplierGstin: "29BBBDT5678B1Z2",
      supplierName: "Karnataka Electricals",
      invoiceDate: "2026-09-10",
      taxableValue: 50000,
      igst: 0,
      cgst: 4500,
      sgst: 4500,
      totalTax: 9000,
    },
    {
      invoiceNo: "INV-2026-003",
      supplierGstin: "07CCCPT9999C1Z8",
      supplierName: "Delhi Paper Mills",
      invoiceDate: "2026-09-12",
      taxableValue: 80000,
      igst: 9600,
      cgst: 0,
      sgst: 0,
      totalTax: 9600,
    },
    {
      invoiceNo: "INV-2026-004",
      supplierGstin: "27DDDKT4444D1Z1",
      supplierName: "Luxury Hotel & Club Ltd",
      invoiceDate: "2026-09-15",
      taxableValue: 25000,
      igst: 4500,
      cgst: 0,
      sgst: 0,
      totalTax: 4500,
      isBlocked17_5: true, // Blocked Section 17(5)
    },
  ];

  const gstr2b = [
    // Matches INV-2026-001 exactly
    {
      invoiceNo: "INV-2026-001",
      supplierGstin: "27AABCT1234A1Z5",
      supplierName: "Mahindra Logistics Ltd",
      invoiceDate: "2026-09-05",
      taxableValue: 100000,
      igst: 18000,
      cgst: 0,
      sgst: 0,
      totalTax: 18000,
      itcAvailable: true,
    },
    // Matches INV-2026-003 but with tax mismatch (supplier filed 5% instead of 12%)
    {
      invoiceNo: "INV-2026-003",
      supplierGstin: "07CCCPT9999C1Z8",
      supplierName: "Delhi Paper Mills",
      invoiceDate: "2026-09-12",
      taxableValue: 80000,
      igst: 4000, // ₹4,000 in 2B vs ₹9,600 in books
      cgst: 0,
      sgst: 0,
      totalTax: 4000,
      itcAvailable: true,
    },
    // INV-2026-002 is MISSING in GSTR-2B (Karnataka Electricals did not file GSTR-1)
    // New Invoice in 2B, missing in books:
    {
      invoiceNo: "INV-UNRECORDED-99",
      supplierGstin: "33EEERT8888E1Z4",
      supplierName: "Chennai Hardware Stores",
      invoiceDate: "2026-09-20",
      taxableValue: 60000,
      igst: 10800,
      cgst: 0,
      sgst: 0,
      totalTax: 10800,
      itcAvailable: true,
    },
  ];

  const result = reconcileItc(purchaseRegister, gstr2b);
  const { summary, items } = result;

  // 1. Matched count & eligible credit
  check(summary.matchedCount === 1, "Exactly 1 invoice matched 100%", `got: ${summary.matchedCount}`);
  check(summary.eligibleItcGstr3B >= 18000, "Eligible GSTR-3B ITC includes verified amount", `got: ${summary.eligibleItcGstr3B}`);

  // 2. Missing in 2B detection (DRC-01C risk)
  check(summary.missingIn2BCount === 1, "Exactly 1 invoice missing in GSTR-2B (Karnataka Electricals)");
  const missingItem = items.find((i) => i.invoiceNo === "INV-2026-002");
  check(Boolean(missingItem), "Missing item found in items list");
  check(missingItem?.status === "missing_in_2b", "Status is missing_in_2b");
  check(missingItem?.recommendedAction.includes("Hold payment"), "Recommendation advises holding supplier payment");

  // 3. Tax Mismatch detection
  check(summary.mismatchCount === 1, "Exactly 1 invoice with tax rate mismatch (Delhi Paper Mills)");
  const mismatchItem = items.find((i) => i.invoiceNo === "INV-2026-003");
  check(mismatchItem?.status === "tax_mismatch", "Status is tax_mismatch");
  check(mismatchItem?.taxDifference === 5600, "Difference correctly identified as ₹5,600");

  // 4. Section 17(5) Blocked Credit
  check(summary.blockedCount === 1, "Exactly 1 invoice identified as Section 17(5) blocked");
  check(summary.blockedItc17_5 === 4500, "Blocked ITC is ₹4,500");
  const blockedItem = items.find((i) => i.invoiceNo === "INV-2026-004");
  check(blockedItem?.status === "blocked_section_17_5", "Blocked item marked blocked_section_17_5");

  // 5. Missing in books (Unclaimed ITC)
  check(summary.missingInBooksCount === 1, "Exactly 1 invoice missing in books (Chennai Hardware)");
  check(summary.unclaimedItc === 10800, "Unclaimed ITC identified as ₹10,800");

  // 6. Total book ITC sanity
  check(summary.totalBookItc === 41100, "Total Book ITC sums to ₹41,100 (18k + 9k + 9.6k + 4.5k)");

  // 7. CSV Export verification
  const csv = generateItcReconciliationCsv(result);
  check(csv.includes("Invoice No,Supplier GSTIN,Supplier Name"), "CSV contains proper statutory headers");
  check(csv.includes("INV-2026-001"), "CSV includes matched invoice INV-2026-001");
  check(csv.includes("missing_in_2b"), "CSV includes missing_in_2b status row");
  check(csv.includes("blocked_section_17_5"), "CSV includes blocked_section_17_5 status row");
}

console.log(`\nitc reconciliation: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("  ✓ Statutory GSTR-2B ITC Matching Engine fully verified across all reconciliation states.");
  process.exit(0);
}
