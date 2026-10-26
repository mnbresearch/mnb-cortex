/**
 * Test suite for Bank-Grade Working Capital Stress-Testing & Altman Z'-Score Engine.
 */

import {
  calculateAltmanZScore,
  runStressSimulation,
} from "../src/lib/stress-test.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing Working Capital Stress-Testing & Altman Z' Engine ===");

// 1. Altman Z'-Score Classification Tests
{
  // Healthy resilient firm
  const healthy = calculateAltmanZScore({
    workingCapital: 5000000,
    totalAssets: 10000000,
    retainedEarnings: 3000000,
    ebit: 2500000,
    netWorth: 6000000,
    totalLiabilities: 4000000,
    sales: 15000000,
  });

  check(healthy.score > 2.9, `Healthy firm scores in Safe Zone (got: ${healthy.score})`);
  check(healthy.zone === "SAFE", "Zone classified as SAFE");
  check(healthy.ratios.x1_workingCapitalToAssets === 0.5, "Working Capital to Assets ratio is 0.5");

  // Distressed firm with negative working capital and operating losses
  const distressed = calculateAltmanZScore({
    workingCapital: -2000000,
    totalAssets: 5000000,
    retainedEarnings: -1000000,
    ebit: -800000,
    netWorth: 500000,
    totalLiabilities: 4500000,
    sales: 3000000,
  });

  check(distressed.score < 1.23, `Distressed firm scores below 1.23 (got: ${distressed.score})`);
  check(distressed.zone === "DISTRESS", "Zone classified as DISTRESS");

  // Borderline Grey Zone firm
  const grey = calculateAltmanZScore({
    workingCapital: 1500000,
    totalAssets: 10000000,
    retainedEarnings: 1000000,
    ebit: 1200000,
    netWorth: 3000000,
    totalLiabilities: 8000000,
    sales: 10000000,
  });

  check(grey.score >= 1.23 && grey.score <= 2.9, `Grey zone firm scores between 1.23 and 2.9 (got: ${grey.score})`);
  check(grey.zone === "GREY", "Zone classified as GREY");
}

// 2. Multi-Vector Shock Simulation Tests
{
  const baseline = {
    annualRevenue: 60000000, // ₹6 Cr
    monthlyRevenue: 5000000, // ₹50 L
    monthlyExpenses: 4000000, // ₹40 L
    grossMarginPct: 20,       // 20% margin -> COGS is ₹40L/mo
    cashReserve: 3000000,     // ₹30 L
    totalReceivables: 8000000,
    totalPayables: 4000000,
    totalAssets: 15000000,
    totalLiabilities: 6000000,
    retainedEarnings: 4000000,
    ebit: 12000000,
  };

  // Shock scenario: 30 days debtor delay, 10% COGS inflation, 10% revenue drop
  const shock = {
    debtorDelayDays: 30,
    cogsInflationPct: 10,
    revenueDropPct: 10,
    creditorAccelerationDays: 15,
  };

  const sim = runStressSimulation(baseline, shock);

  // Trapped Receivables = (50L / 30) * 30 = 50L
  // Accelerated Payables = (40L / 60) * 15 = 10L
  // Immediate Trapped = 60L
  check(sim.immediateWorkingCapitalLocked >= 5000000, "Immediate trapped liquidity includes delayed receivables");
  check(sim.stressedBurnMonthly > sim.baselineBurnMonthly, "Stressed monthly burn reflects COGS inflation");

  // Revenue drops 10% -> ₹45L
  // Stressed expenses = ₹40L + 10% of COGS (40L * 80% * 10% = ₹3.2L) = ₹43.2L
  // If revenue drops further, deficit grows
  check(sim.actionLevers.length > 0, "Action levers generated");
  check(sim.actionLevers.some((l) => l.includes("TReDS")), "Action plan recommends TReDS factoring for trapped receivables");
  check(sim.actionLevers.some((l) => l.includes("Repricing")), "Action plan recommends repricing against COGS inflation");
}

// 3. Acute Cliff Liquidity Depletion Test
{
  const fragileBase = {
    annualRevenue: 24000000,
    monthlyRevenue: 2000000,
    monthlyExpenses: 2200000, // Burning cash even in baseline
    grossMarginPct: 15,
    cashReserve: 1000000,     // Only ₹10 L cash
    totalReceivables: 3000000,
    totalPayables: 2000000,
    totalAssets: 5000000,
    totalLiabilities: 3500000,
    retainedEarnings: 200000,
    ebit: -2400000,
  };

  const severeShock = {
    debtorDelayDays: 45,
    cogsInflationPct: 15,
    revenueDropPct: 20,
    creditorAccelerationDays: 15,
  };

  const cliffSim = runStressSimulation(fragileBase, severeShock);
  check(cliffSim.vulnerabilityTier === "ACUTE_CLIFF" || cliffSim.vulnerabilityTier === "HIGH_RISK", "Fragile firm classified in Acute Cliff / High Risk tier");
  check(cliffSim.daysToLiquidityCliff !== null && cliffSim.daysToLiquidityCliff <= 90, "Liquidity cliff occurs within 90 days");
}

console.log(`\nstress test: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("  ✓ Working Capital Stress-Testing & Altman Z' Engine fully verified.");
  process.exit(0);
}
