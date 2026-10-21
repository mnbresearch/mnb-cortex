/**
 * Test suite for MCA Form MSME-1 and Section 16 Penal Interest Engine (src/lib/msme-form1.ts).
 */

import {
  calculateSection16Interest,
  getMcaReturnPeriod,
  generateMsmeForm1Report,
  STATUTORY_PENAL_RATE_PCT,
} from "../src/lib/msme-form1.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing MCA Form MSME-1 & Section 16 Compound Penal Interest Engine ===");

// 1. Statutory Rate Verification
{
  check(STATUTORY_PENAL_RATE_PCT === 20.25, "Statutory penal rate is exactly 20.25% (3x 6.75% RBI Bank Rate)");
}

// 2. Section 16 Compound Interest Calculation
{
  // 1 month delay on ₹1,00,000 at 20.25% p.a. compounded monthly
  // Monthly rate = 20.25% / 12 = 1.6875% -> ₹1,687.50
  const interest1M = calculateSection16Interest(100000, 30.4375);
  check(Math.abs(interest1M - 1687.50) < 1.0, "1 month interest on ₹1L is approx ₹1,687.50", `got: ${interest1M}`);

  // 12 months delay on ₹1,00,000 with monthly compounding:
  // (1 + 0.2025/12)^12 - 1 = (1.016875)^12 - 1 ≈ 0.22237 (22.24% effective annual yield)
  const interest12M = calculateSection16Interest(100000, 365.25);
  check(Math.abs(interest12M - 22237) < 100, "12 months compound interest on ₹1L reflects monthly compounding (~₹22,237)", `got: ${interest12M}`);

  // Zero and negative edge cases
  check(calculateSection16Interest(0, 45) === 0, "Zero principal returns zero interest");
  check(calculateSection16Interest(100000, 0) === 0, "Zero days delayed returns zero interest");
  check(calculateSection16Interest(-50000, 30) === 0, "Negative principal returns zero interest");
  check(calculateSection16Interest(100000, -10) === 0, "Negative days returns zero interest");
}

// 3. Return Period Detection
{
  const h1Date = new Date("2026-06-15T00:00:00Z");
  const p1 = getMcaReturnPeriod(h1Date);
  check(p1.period === "H1", "June belongs to H1");
  check(p1.financialYear === "FY 2026-27", "Financial year is FY 2026-27");
  check(p1.filingDueDate === "2026-10-31", "H1 filing due date is 31 October 2026");

  const h2Date = new Date("2026-11-20T00:00:00Z");
  const p2 = getMcaReturnPeriod(h2Date);
  check(p2.period === "H2", "November belongs to H2");
  check(p2.financialYear === "FY 2026-27", "November financial year is FY 2026-27");
  check(p2.filingDueDate === "2027-04-30", "H2 filing due date is 30 April 2027");

  const q4Date = new Date("2027-02-10T00:00:00Z");
  const p3 = getMcaReturnPeriod(q4Date);
  check(p3.period === "H2", "February belongs to H2");
  check(p3.financialYear === "FY 2026-27", "February financial year is FY 2026-27");
  check(p3.filingDueDate === "2027-04-30", "H2 filing due date is 30 April 2027");
}

// 4. Form MSME-1 Synthesis and Filtering
{
  const testBills = [
    {
      invoiceNo: "INV-M-01",
      party: "Shree Ganesh Precision Tools",
      udyamCategory: "micro",
      panOrUdyam: "UDYAM-MH-01-0012345",
      issueDate: "2026-05-01",
      dueDate: "2026-06-15",
      amount: 450000,
      daysDelayed: 40,
      hasWrittenAgreement: true,
      reasonForDelay: "Inspection dispute",
    },
    {
      invoiceNo: "INV-S-02",
      party: "Apex Polymers Pvt Ltd",
      udyamCategory: "small",
      panOrUdyam: "AAACA1234F",
      issueDate: "2026-05-10",
      dueDate: "2026-05-25",
      amount: 280000,
      daysDelayed: 60,
      hasWrittenAgreement: false, // 15 days window
    },
    {
      invoiceNo: "INV-MED-03",
      party: "Tata Steel Tubes Division",
      udyamCategory: "medium", // NOT covered by Form 1
      issueDate: "2026-04-01",
      dueDate: "2026-05-15",
      amount: 1500000,
      daysDelayed: 70,
    },
    {
      invoiceNo: "INV-M-04",
      party: "Shree Ganesh Precision Tools",
      udyamCategory: "micro",
      issueDate: "2026-08-01",
      dueDate: "2026-09-15",
      amount: 120000,
      daysDelayed: 0, // NOT delayed
    },
  ];

  const report = generateMsmeForm1Report(testBills, { referenceDate: new Date("2026-09-20T00:00:00Z") });

  check(report.period === "H1", "Report period is H1");
  check(report.totalDelayedInvoicesCount === 2, "Only the 2 delayed micro/small bills are included (medium and non-delayed excluded)");
  check(report.totalSuppliersCount === 2, "Unique supplier count is 2");
  check(report.totalPrincipalDue === 730000, "Total principal due is ₹7,30,000 (450k + 280k)");
  check(report.totalPenalInterestAccrued > 0, "Total penal interest accrued is calculated and positive");
  check(report.grandTotalLiability > report.totalPrincipalDue, "Grand total liability includes principal + interest");

  // Verify CSV export
  check(report.mcaCsvContent.includes("Shree Ganesh Precision Tools"), "CSV contains supplier 1");
  check(report.mcaCsvContent.includes("Apex Polymers Pvt Ltd"), "CSV contains supplier 2");
  check(!report.mcaCsvContent.includes("Tata Steel Tubes Division"), "CSV excludes medium enterprise");
  check(report.mcaCsvContent.includes("Reason for Delay in Payment"), "CSV headers include official delay reason column");
}

console.log(`\nmsme form 1: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("  ✓ MCA Form MSME-1 and Section 16 Penal Interest engine fully verified.");
  process.exit(0);
}
