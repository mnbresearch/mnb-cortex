/**
 * Test suite for MSME Samadhaan (MSEFC) Statutory Recovery Petition & Legal Notice Engine.
 */

import {
  calculateSection16CompoundInterest,
  calculateMsefcClaim,
  generateFormalLegalDemandNotice,
  generateMsefcPetitionSummary,
  CURRENT_RBI_BANK_RATE_PCT,
  STATUTORY_PENAL_RATE_PCT,
} from "../src/lib/msme-samadhaan.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing MSME Samadhaan & MSEFC Recovery Notice Engine ===");

// 1. Statutory Rate Invariant
check(CURRENT_RBI_BANK_RATE_PCT === 6.75, "Current RBI Bank Rate is 6.75%");
check(STATUTORY_PENAL_RATE_PCT === 20.25, "Statutory Section 16 Penal Rate is 3x Bank Rate = 20.25% p.a.");

// 2. Compound Penal Interest Calculation
{
  const zeroInterest = calculateSection16CompoundInterest(100000, 0);
  check(zeroInterest === 0, "Zero days delayed attracts zero interest");

  const negativeInterest = calculateSection16CompoundInterest(-50000, 30);
  check(negativeInterest === 0, "Negative principal produces zero interest");

  // 1 month (30 days) on ₹1,00,000 at 20.25% p.a.
  // Monthly rate = 20.25% / 12 = 1.6875%
  // Interest for 1 month = 100000 * 0.016875 = 1,687.50
  const oneMonthInterest = calculateSection16CompoundInterest(100000, 30);
  check(
    Math.abs(oneMonthInterest - 1687.5) < 1,
    `1 month interest on ₹1L is ₹1,687.50 (got: ${oneMonthInterest})`
  );

  // 12 months (360 days) compound interest on ₹1,00,000:
  // Compounded = 100000 * (1 + 0.2025/12)^12 = 100000 * (1.016875)^12 = ₹1,22,239.30
  // Interest = ₹22,239.30
  const oneYearInterest = calculateSection16CompoundInterest(100000, 360);
  check(
    oneYearInterest > 22000 && oneYearInterest < 22500,
    `12 months monthly compounding produces > 22% effective return (got: ₹${oneYearInterest})`
  );
}

// 3. Multi-Invoice Claim Breakdown
{
  const refDate = new Date("2026-10-15");
  const invoices = [
    {
      invoiceNo: "INV-001",
      invoiceDate: "2026-06-01",
      amount: 500000,
      hasWrittenAgreement: true, // 45 days window -> due 2026-07-16
    },
    {
      invoiceNo: "INV-002",
      invoiceDate: "2026-08-01",
      amount: 250000,
      hasWrittenAgreement: false, // 15 days window -> due 2026-08-16
    },
  ];

  const claim = calculateMsefcClaim(invoices, refDate);

  check(claim.totalPrincipal === 750000, "Total principal is ₹7,50,000");
  check(claim.totalPenalInterest > 0, "Penal interest is strictly positive");
  check(claim.totalClaimAmount === claim.totalPrincipal + claim.totalPenalInterest, "Total claim equals principal + interest");
  check(claim.invoices.length === 2, "Claim breakdown contains 2 invoice rows");
  check(claim.applicableAnnualRatePct === 20.25, "Applicable annual rate is 20.25%");

  const inv1 = claim.invoices[0];
  check(inv1.statutoryDueDate === "2026-07-16", "INV-001 with agreement due date is 45 days from issue");
  check(inv1.daysDelayed > 80, `INV-001 delay correctly calculated (>80 days, got: ${inv1.daysDelayed})`);

  const inv2 = claim.invoices[1];
  check(inv2.statutoryDueDate === "2026-08-16", "INV-002 without agreement due date is 15 days from issue");
}

// 4. Formal Statutory Legal Notice Generation
{
  const noticeParams = {
    claimant: {
      name: "Apex Precision Tools Pvt Ltd",
      udyamRegNo: "UDYAM-MH-03-0098765",
      category: "small",
      address: "Plot 42, MIDC Industrial Area, Pune, Maharashtra",
      email: "accounts@apexprecision.com",
    },
    respondent: {
      name: "MegaCorp Manufacturing Ltd",
      address: "Bandra Kurla Complex, Mumbai, Maharashtra",
      gstinOrCin: "27AAACM1234A1Z1",
      email: "finance@megacorp.com",
    },
    invoices: [
      {
        invoiceNo: "APT-2026-88",
        invoiceDate: "2026-05-10",
        amount: 800000,
        hasWrittenAgreement: true,
      },
    ],
    noticeDate: "2026-10-20",
  };

  const notice = generateFormalLegalDemandNotice(noticeParams);

  check(notice.includes("FORMAL STATUTORY LEGAL DEMAND NOTICE"), "Notice header states formal statutory demand");
  check(notice.includes("UDYAM-MH-03-0098765"), "Notice cites claimant's Udyam registration number");
  check(notice.includes("MegaCorp Manufacturing Ltd"), "Notice names respondent debtor");
  check(notice.includes("Section 16 of the MSMED Act, 2006"), "Notice quotes Section 16 penal interest mandate");
  check(notice.includes("20.25% p.a."), "Notice specifies 20.25% p.a. interest rate");
  check(notice.includes("three times of the bank rate notified by the Reserve Bank"), "Notice quotes 3x RBI Bank Rate statutory rule");
  check(notice.includes("Section 19 Mandatory 75% Pre-Deposit"), "Notice warns of Section 19 mandatory 75% pre-deposit");
  check(notice.includes("Silpi Industries"), "Notice cites Hon'ble Supreme Court landmark judgment");
  check(notice.includes("Section 23 Disallowance of Tax Expense"), "Notice warns of Section 23 & 43B(h) tax disallowance");
  check(notice.includes("Section 24 Overriding Effect"), "Notice cites Section 24 non-obstante overriding effect");
  check(notice.includes("fifteen (15) days of receipt"), "Notice provides mandatory 15-day compliance window");
  check(notice.includes("samadhaan.msme.gov.in") || notice.includes("MSME Samadhaan Portal"), "Notice warns of MSEFC Samadhaan portal filing");
}

// 5. MSME Samadhaan Application Portal Draft
{
  const petitionParams = {
    claimant: {
      name: "Apex Precision Tools Pvt Ltd",
      udyamRegNo: "UDYAM-MH-03-0098765",
      category: "small",
      address: "Pune",
    },
    respondent: {
      name: "MegaCorp Manufacturing Ltd",
      address: "Mumbai",
      gstinOrCin: "27AAACM1234A1Z1",
    },
    invoices: [
      {
        invoiceNo: "APT-2026-88",
        invoiceDate: "2026-05-10",
        amount: 800000,
        hasWrittenAgreement: true,
      },
    ],
  };

  const draft = generateMsefcPetitionSummary(petitionParams);
  check(draft.includes("MSME SAMADHAAN (MSEFC) PORTAL APPLICATION DRAFT"), "Draft contains Samadhaan portal title");
  check(draft.includes("STATEMENT OF TRUTH"), "Draft includes required Statement of Truth");
  check(draft.includes("Relief is prayed under Section 18"), "Draft specifies relief under Section 18");
}

console.log(`\nmsme samadhaan: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("  ✓ MSME Samadhaan & MSEFC Recovery Notice Engine fully verified across all statutory criteria.");
  process.exit(0);
}
