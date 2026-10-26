/**
 * Test suite for Form 3CD Clause 22 & Section 43B(h) Statutory Tax Audit Engine.
 */

import {
  generateClause22Report,
  getTaxAuditPeriod,
} from "../src/lib/msme-clause22.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing Form 3CD Clause 22 & Section 43B(h) Tax Audit Engine ===");

// 1. Period Detection
{
  const p1 = getTaxAuditPeriod(new Date("2026-03-31T00:00:00Z"));
  check(p1.financialYear === "FY 2025-26", "March 2026 belongs to FY 2025-26");
  check(p1.assessmentYear === "AY 2026-27", "March 2026 belongs to AY 2026-27");

  const p2 = getTaxAuditPeriod(new Date("2026-09-30T00:00:00Z"));
  check(p2.financialYear === "FY 2026-27", "September 2026 belongs to FY 2026-27");
  check(p2.assessmentYear === "AY 2027-28", "September 2026 belongs to AY 2027-28");
}

// 2. Micro Supplier Paid on Time
{
  const bills = [
    {
      invoiceNo: "INV-001",
      party: "Precision Tools Micro",
      udyamCategory: "micro",
      invoiceDate: "2026-01-10",
      dueDate: "2026-02-24", // 45 days
      paymentDate: "2026-02-20", // Paid within 41 days
      amount: 150000,
      hasWrittenAgreement: true,
    },
  ];

  const report = generateClause22Report(bills, "2026-03-31");
  check(report.section43BhDisallowance.totalDisallowedPurchases === 0, "On-time payment has zero 43B(h) disallowance");
  check(report.disclosureSection22.totalInterestInadmissibleSec23 === 0, "On-time payment has zero inadmissible interest");
  check(report.rows[0].clause22Status === "paid_on_time", "Row marked paid_on_time");
}

// 3. Micro Supplier Paid Delayed in Same FY
{
  const bills = [
    {
      invoiceNo: "INV-002",
      party: "Alpha Components Micro",
      udyamCategory: "micro",
      invoiceDate: "2026-01-01",
      dueDate: "2026-02-15", // 45 days
      paymentDate: "2026-03-15", // Paid after 73 days (28 days delayed) but before March 31
      amount: 200000,
      hasWrittenAgreement: true,
    },
  ];

  const report = generateClause22Report(bills, "2026-03-31");
  check(report.section43BhDisallowance.totalDisallowedPurchases === 0, "Delayed bill paid before March 31 is allowed under 43B(h) for the year");
  check(report.disclosureSection22.delayedPaymentsMadeDuringYear === 200000, "Delayed payment recorded in Clause 22(ii)");
  check(report.disclosureSection22.interestDueForDelayedPaid > 0, "Interest on delayed payment computed for Clause 22(iii)");
  check(report.disclosureSection22.totalInterestInadmissibleSec23 > 0, "Interest on delayed payment is inadmissible under Sec 23");
  check(report.rows[0].clause22Status === "paid_delayed_same_fy", "Row marked paid_delayed_same_fy");
}

// 4. Micro & Small Suppliers Unpaid Past Window on Balance Sheet Date
{
  const bills = [
    {
      invoiceNo: "INV-003",
      party: "Omega Fasteners Micro",
      udyamCategory: "micro",
      invoiceDate: "2026-01-15",
      dueDate: "2026-03-01", // 45 days
      paymentDate: "", // Unpaid as on March 31
      amount: 300000,
      hasWrittenAgreement: true,
    },
    {
      invoiceNo: "INV-004",
      party: "Beta Castings Small",
      udyamCategory: "small",
      invoiceDate: "2026-02-01",
      dueDate: "2026-02-16", // 15 days (no written agreement)
      paymentDate: "", // Unpaid as on March 31 (43 days late)
      amount: 500000,
      hasWrittenAgreement: false,
    },
  ];

  const report = generateClause22Report(bills, "2026-03-31");
  check(report.section43BhDisallowance.totalDisallowedPurchases === 800000, "Total 43B(h) disallowance is ₹8,00,000", `got: ${report.section43BhDisallowance.totalDisallowedPurchases}`);
  check(report.section43BhDisallowance.billsDisallowedCount === 2, "2 bills disallowed");
  check(report.section43BhDisallowance.microUnpaidDisallowed === 300000, "Micro unpaid disallowed is ₹3,00,000");
  check(report.section43BhDisallowance.smallUnpaidDisallowed === 500000, "Small unpaid disallowed is ₹5,00,000");
  check(report.section43BhDisallowance.potentialTaxImpactAt30Pct === Math.round(800000 * 0.312), "Tax impact matches 31.2% tax + cess");
  check(report.disclosureSection22.principalUnpaidAtYearEnd === 800000, "Principal unpaid at year end recorded in Clause 22(i)");
  check(report.disclosureSection22.interestDueUnpaidAtYearEnd > 0, "Interest accrued & unpaid recorded in Clause 22(iv)");
  check(report.rows[0].isDisallowed43Bh === true, "Row 1 flagged as 43B(h) disallowed");
  check(report.rows[1].statutoryLimitDays === 15, "Row 2 evaluated with 15 days statutory limit (no written agreement)");
}

// 5. Medium Supplier Overdue - No 43B(h) Disallowance
{
  const bills = [
    {
      invoiceNo: "INV-005",
      party: "Mega Forge Medium",
      udyamCategory: "medium",
      invoiceDate: "2025-11-01",
      dueDate: "2025-12-16",
      paymentDate: "",
      amount: 1000000,
      hasWrittenAgreement: true,
    },
  ];

  const report = generateClause22Report(bills, "2026-03-31");
  check(report.section43BhDisallowance.totalDisallowedPurchases === 0, "Medium enterprise has zero 43B(h) disallowance");
  check(report.disclosureSection22.totalInterestInadmissibleSec23 === 0, "Medium enterprise has zero Section 16/23 interest");
  check(!report.rows[0].isDisallowed43Bh, "Medium enterprise row not marked disallowed");
}

// 6. Unclassified Supplier
{
  const bills = [
    {
      invoiceNo: "INV-006",
      party: "Unknown Supplies Co",
      udyamCategory: "unclassified",
      invoiceDate: "2026-01-01",
      dueDate: "2026-01-16",
      paymentDate: "",
      amount: 250000,
      hasWrittenAgreement: false,
    },
  ];

  const report = generateClause22Report(bills, "2026-03-31");
  check(report.section43BhDisallowance.unclassifiedPayablesAtRisk === 250000, "Unclassified payables tracked under risk");
  check(report.rows[0].reason.includes("unclassified"), "Unclassified row contains warning note");
}

// 7. CSV Export Integrity
{
  const bills = [
    {
      invoiceNo: "INV-007",
      party: 'Sharma "Hi-Tech" Micro',
      udyamCategory: "micro",
      invoiceDate: "2026-01-10",
      dueDate: "2026-02-24",
      paymentDate: "",
      amount: 75000,
      hasWrittenAgreement: true,
    },
  ];

  const report = generateClause22Report(bills, "2026-03-31");
  check(report.csvContent.includes("Supplier Name"), "CSV has header");
  check(report.csvContent.includes('"Sharma ""Hi-Tech"" Micro"'), "CSV escapes quotes properly");
  check(report.csvContent.includes("75000.00"), "CSV contains amount");
}

if (failures.length > 0) {
  console.error(`\nclause22: ${pass} passed, ${failures.length} failed\n`);
  for (const f of failures) console.error("  ✕ " + f);
  process.exit(1);
} else {
  console.log(`\nclause22: ${pass} passed, 0 failed`);
  console.log("  ✓ Form 3CD Clause 22 and Section 43B(h) Tax Audit engine verified.");
}
