/**
 * Test suite for Cortex Solvency & Operational Health Scorecard (src/lib/solvency-scorecard.ts).
 */

import { calculateSolvencyScore } from "../src/lib/solvency-scorecard.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing Cortex Solvency & Health Scorecard Engine ===");

// 1. Enterprise Resilient (Grade A+)
{
  const result = calculateSolvencyScore({
    cashBalance: 45_00_000,
    monthlyBurn: 8_00_000, // ~24 weeks runway
    totalReceivables: 18_00_000,
    overdueReceivables: 1_20_000, // 6% overdue
    dsoDays: 32, // < 45 days MSME
    grossMarginPct: 48, // > 40%
    advanceTaxPaidPct: 95, // Fully provisioned
    hasGstDiscrepancy: false,
  });

  check(result.overallScore >= 88, `A+ enterprise score achieved: ${result.overallScore}`, `got: ${result.overallScore}`);
  check(result.grade === "A+", `Grade is A+: ${result.grade}`);
  check(result.criticalAlerts.length === 0, "No critical alerts on resilient balance sheet");
  check(result.dimensions.liquidity.status === "optimal", "Liquidity optimal");
  check(result.dimensions.receivables.status === "optimal", "Receivables optimal");
  check(result.dimensions.margins.status === "optimal", "Margins optimal");
  check(result.dimensions.compliance.status === "optimal", "Compliance optimal");
}

// 2. Severely Distressed (Grade D)
{
  const result = calculateSolvencyScore({
    cashBalance: 1_50_000,
    monthlyBurn: 12_00_000, // < 1 week runway!
    totalReceivables: 50_00_000,
    overdueReceivables: 42_00_000, // 84% overdue!
    dsoDays: 110, // > 90 days!
    grossMarginPct: 8, // Compressed
    advanceTaxPaidPct: 20, // Severe underpayment
    hasGstDiscrepancy: true, // ITC risk
  });

  check(result.overallScore < 40, `Low distressed score: ${result.overallScore}`);
  check(result.grade === "D", `Grade is D: ${result.grade}`);
  check(result.criticalAlerts.length >= 3, `Multiple critical alerts fired: ${result.criticalAlerts.length}`);
  check(result.dimensions.liquidity.status === "critical", "Liquidity critical");
  check(result.dimensions.receivables.status === "critical", "Receivables critical");
  check(result.dimensions.margins.status === "critical", "Margins critical");
  check(/UPI|recovery notice/i.test(result.topAction), "Top action prioritizes immediate collections recovery");
}

// 3. Edge Cases & Boundedness
{
  // All zeroes
  const zeroRes = calculateSolvencyScore({
    cashBalance: 0,
    monthlyBurn: 0,
    totalReceivables: 0,
    overdueReceivables: 0,
    dsoDays: 0,
    grossMarginPct: 0,
    advanceTaxPaidPct: 0,
  });
  check(zeroRes.overallScore >= 0 && zeroRes.overallScore <= 100, "Zero inputs produce bounded score");

  // Negative values sanitized
  const negRes = calculateSolvencyScore({
    cashBalance: -50000,
    monthlyBurn: -20000,
    totalReceivables: -10000,
    overdueReceivables: -5000,
    dsoDays: -10,
    grossMarginPct: -25,
    advanceTaxPaidPct: -50,
  });
  check(negRes.overallScore >= 0 && negRes.overallScore <= 100, "Negative inputs sanitized and bounded");
  for (const [key, dim] of Object.entries(negRes.dimensions)) {
    check(dim.score >= 0 && dim.score <= dim.max, `dimension ${key} bounded by max ${dim.max}`);
  }
}

console.log(`\nsolvency: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("  ✓ Solvency Scorecard engine verified across all resilience tiers.");
  process.exit(0);
}
