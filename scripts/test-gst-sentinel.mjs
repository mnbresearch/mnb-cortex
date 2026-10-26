/**
 * Test suite for GST Rule 88C (DRC-01B) & Rule 88D (DRC-01C) Notice Risk Sentinel Engine.
 */

import {
  auditRule88c,
  auditRule88d,
  runGstSentinelAudit,
  calculateSection50Interest,
  STATUTORY_NOTICE_PCT_THRESHOLD,
  STATUTORY_NOTICE_RUPEES_THRESHOLD,
  SECTION_50_OUTWARD_INTEREST_RATE_PCT,
  SECTION_50_ITC_INTEREST_RATE_PCT,
} from "../src/lib/gst-sentinel.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing GST Rule 88C & Rule 88D Notice Risk Sentinel Engine ===");

// 1. Statutory Threshold Invariants
{
  check(STATUTORY_NOTICE_PCT_THRESHOLD === 20.0, "Statutory mismatch threshold is 20%");
  check(STATUTORY_NOTICE_RUPEES_THRESHOLD === 25000, "Statutory mismatch threshold is ₹25,000");
  check(SECTION_50_OUTWARD_INTEREST_RATE_PCT === 18.0, "Section 50 outward interest is 18% p.a.");
  check(SECTION_50_ITC_INTEREST_RATE_PCT === 24.0, "Section 50(3) ITC interest is 24% p.a.");
}

// 2. Section 50 Interest Calculations
{
  // ₹1,00,000 for 30 days at 18% p.a.
  // 100,000 * 0.18 * (30/365) = 1479.45
  const int18 = calculateSection50Interest(100000, 30, 18);
  check(Math.abs(int18 - 1479.45) < 1.0, "Section 50 18% interest on ₹1L for 30d is approx ₹1,479", `got: ${int18}`);

  // ₹1,00,000 for 30 days at 24% p.a.
  // 100,000 * 0.24 * (30/365) = 1972.60
  const int24 = calculateSection50Interest(100000, 30, 24);
  check(Math.abs(int24 - 1972.60) < 1.0, "Section 50(3) 24% interest on ₹1L for 30d is approx ₹1,973", `got: ${int24}`);

  check(calculateSection50Interest(0, 30) === 0, "Zero principal returns zero interest");
  check(calculateSection50Interest(100000, 0) === 0, "Zero days returns zero interest");
}

// 3. Rule 88C (DRC-01B): Outward Tax Liability Mismatch
{
  // Safe: GSTR-1 matches GSTR-3B
  const safe88c = auditRule88c({
    taxPeriod: "Jan 2026",
    gstr1Liability: { igst: 200000, cgst: 0, sgst: 0 },
    gstr3bLiabilityPaid: { igst: 200000, cgst: 0, sgst: 0 },
  });
  check(safe88c.riskLevel === "safe", "Matching liability is safe");
  check(!safe88c.breachesStatutoryThreshold, "Does not breach threshold");
  check(safe88c.excessLiability === 0, "Zero excess liability");

  // Safe below ₹25k: GSTR-1 ₹2,15,000 vs 3B ₹2,00,000 (diff ₹15,000 is < ₹25k)
  const minor88c = auditRule88c({
    taxPeriod: "Jan 2026",
    gstr1Liability: { igst: 215000, cgst: 0, sgst: 0 },
    gstr3bLiabilityPaid: { igst: 200000, cgst: 0, sgst: 0 },
  });
  check(!minor88c.breachesStatutoryThreshold, "₹15k difference does not breach statutory threshold (<₹25k)");

  // Danger: GSTR-1 ₹3,50,000 vs 3B ₹2,70,000 (diff ₹80,000 > ₹25k and 29.6% > 20%)
  const danger88c = auditRule88c({
    taxPeriod: "Jan 2026",
    gstr1Liability: { igst: 350000, cgst: 0, sgst: 0 },
    gstr3bLiabilityPaid: { igst: 270000, cgst: 0, sgst: 0 },
    daysLateSinceDueDate: 30,
  });
  check(danger88c.breachesStatutoryThreshold, "₹80k / 29.6% diff breaches Rule 88C statutory threshold");
  check(danger88c.riskLevel === "danger", "Marked as danger tier");
  check(danger88c.interestExposureSec50 > 1000, "Section 50 interest computed for 30 days");
  check(danger88c.justificationTemplate.includes("RULE 88C"), "Generates Form DRC-01B Part B reply template");
  check(danger88c.justificationTemplate.includes("80,000"), "Template incorporates exact differential amount");
}

// 4. Rule 88D (DRC-01C): Inward ITC Mismatch
{
  // Safe: GSTR-3B ITC matches GSTR-2B
  const safe88d = auditRule88d({
    taxPeriod: "Jan 2026",
    gstr3bItcClaimed: { igst: 100000, cgst: 0, sgst: 0 },
    gstr2bItcAvailable: { igst: 100000, cgst: 0, sgst: 0 },
  });
  check(safe88d.riskLevel === "safe", "Matching ITC is safe");
  check(!safe88d.breachesStatutoryThreshold, "Does not breach threshold");

  // Danger: GSTR-3B ₹1,80,000 vs 2B ₹1,30,000 (diff ₹50,000 > ₹25k and 38.5% > 20%)
  const danger88d = auditRule88d({
    taxPeriod: "Jan 2026",
    gstr3bItcClaimed: { igst: 180000, cgst: 0, sgst: 0 },
    gstr2bItcAvailable: { igst: 130000, cgst: 0, sgst: 0 },
    daysLateSinceDueDate: 30,
  });
  check(danger88d.breachesStatutoryThreshold, "₹50k / 38.5% diff breaches Rule 88D statutory threshold");
  check(danger88d.riskLevel === "danger", "Marked as danger tier");
  check(danger88d.interestExposureSec50 > 900, "Section 50(3) 24% interest computed");
  check(danger88d.justificationTemplate.includes("RULE 88D"), "Generates Form DRC-01C Part B reply template");
  check(danger88d.justificationTemplate.includes("50,000"), "Template incorporates exact excess ITC amount");
}

// 5. Combined Sentinel Audit & Portal Locking Risk
{
  const combined = runGstSentinelAudit(
    {
      taxPeriod: "Jan 2026",
      gstr1Liability: { igst: 350000, cgst: 0, sgst: 0 },
      gstr3bLiabilityPaid: { igst: 270000, cgst: 0, sgst: 0 },
      daysLateSinceDueDate: 15,
    },
    {
      taxPeriod: "Jan 2026",
      gstr3bItcClaimed: { igst: 180000, cgst: 0, sgst: 0 },
      gstr2bItcAvailable: { igst: 130000, cgst: 0, sgst: 0 },
      daysLateSinceDueDate: 15,
    }
  );

  check(combined.overallComplianceStatus === "critical_notice_risk", "Combined audit flags critical notice risk");
  check(combined.portalBlockingRisk === true, "Flags Rule 59(6) portal blocking risk");
  check(combined.totalInterestExposure > 0, "Sums total interest exposure across both rules");
}

if (failures.length > 0) {
  console.error(`\ngst-sentinel: ${pass} passed, ${failures.length} failed\n`);
  for (const f of failures) console.error("  ✕ " + f);
  process.exit(1);
} else {
  console.log(`\ngst-sentinel: ${pass} passed, 0 failed`);
  console.log("  ✓ GST Rule 88C and Rule 88D Notice Risk Sentinel engine verified.");
}
