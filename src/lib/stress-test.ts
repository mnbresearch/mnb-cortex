/**
 * Bank-Grade Working Capital Stress-Testing & Liquidity Cliff Engine.
 *
 * Implements:
 * 1. Altman Z'-Score for Emerging Markets & Private Enterprises:
 *    Z' = 0.717(X1) + 0.847(X2) + 3.107(X3) + 0.420(X4) + 0.998(X5)
 *    - X1 = Working Capital / Total Assets
 *    - X2 = Retained Earnings / Total Assets
 *    - X3 = Operating Profit (EBIT) / Total Assets
 *    - X4 = Net Worth (Book Value of Equity) / Total Liabilities
 *    - X5 = Annual Turnover / Total Assets
 *    Zones: Safe (> 2.90), Grey / Cautious (1.23 to 2.90), Distress (< 1.23).
 *
 * 2. Multi-Vector Shock Stress-Testing:
 *    - Debtor Payment Freeze (key accounts delayed by 30/60/90 days).
 *    - Input Cost Inflation (COGS spikes of 5%–20%).
 *    - Revenue Contraction (10%–30% demand slump).
 *    - Statutory Creditor Compression (accelerated MSME 43B(h) supplier payments).
 *
 * 3. Liquidity Cliff Horizon:
 *    Pinpoints exact days/months before working capital reserves breach zero.
 *
 * DELIBERATELY PURE — zero external network dependencies, runnable client/server/CLI.
 */

export interface FinancialBaseMetrics {
  annualRevenue: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  grossMarginPct: number; // e.g. 25 for 25%
  cashReserve: number;
  totalReceivables: number;
  totalPayables: number;
  totalAssets: number;
  totalLiabilities: number;
  retainedEarnings: number;
  ebit: number;
}

export interface StressShockParameters {
  debtorDelayDays: number;         // Additional days delayed by debtors (e.g. 30, 60, 90)
  cogsInflationPct: number;        // Direct cost inflation spike (e.g. 5, 10, 15%)
  revenueDropPct: number;          // Revenue contraction (e.g. 10, 20, 30%)
  creditorAccelerationDays: number; // Days supplier terms are shortened under 43B(h) (e.g. 15, 30)
}

export interface AltmanZScoreResult {
  score: number;
  zone: "SAFE" | "GREY" | "DISTRESS";
  ratios: {
    x1_workingCapitalToAssets: number;
    x2_retainedEarningsToAssets: number;
    x3_ebitToAssets: number;
    x4_equityToLiabilities: number;
    x5_salesToAssets: number;
  };
  interpretation: string;
}

export interface StressSimulationResult {
  baselineBurnMonthly: number;
  stressedBurnMonthly: number;
  monthlyCashDeficit: number;
  immediateWorkingCapitalLocked: number;
  daysToLiquidityCliff: number | null; // null if cash positive indefinitely
  postShockAltmanZ: AltmanZScoreResult;
  vulnerabilityTier: "RESILIENT" | "MODERATE_RISK" | "HIGH_RISK" | "ACUTE_CLIFF";
  actionLevers: string[];
}

/**
 * Calculates the Altman Z'-Score for Emerging Markets & Private Firms.
 */
export function calculateAltmanZScore(params: {
  workingCapital: number;
  totalAssets: number;
  retainedEarnings: number;
  ebit: number;
  netWorth: number;
  totalLiabilities: number;
  sales: number;
}): AltmanZScoreResult {
  const assets = Math.max(1, params.totalAssets);
  const liabilities = Math.max(1, params.totalLiabilities);

  const x1 = params.workingCapital / assets;
  const x2 = params.retainedEarnings / assets;
  const x3 = params.ebit / assets;
  const x4 = params.netWorth / liabilities;
  const x5 = params.sales / assets;

  // Altman Z'-Score for private non-manufacturing & manufacturing firms in emerging markets
  const score = Math.round(
    (0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5) * 100
  ) / 100;

  let zone: "SAFE" | "GREY" | "DISTRESS";
  let interpretation: string;

  if (score > 2.9) {
    zone = "SAFE";
    interpretation = "Robust financial resilience. Low probability of corporate insolvency within 24 months.";
  } else if (score >= 1.23) {
    zone = "GREY";
    interpretation = "Moderate risk zone. Working capital volatility could threaten solvency if receivables stall.";
  } else {
    zone = "DISTRESS";
    interpretation = "High distress alert. Operating cashflow is insufficient to buffer sudden working capital shocks.";
  }

  return {
    score,
    zone,
    ratios: {
      x1_workingCapitalToAssets: Math.round(x1 * 1000) / 1000,
      x2_retainedEarningsToAssets: Math.round(x2 * 1000) / 1000,
      x3_ebitToAssets: Math.round(x3 * 1000) / 1000,
      x4_equityToLiabilities: Math.round(x4 * 1000) / 1000,
      x5_salesToAssets: Math.round(x5 * 1000) / 1000,
    },
    interpretation,
  };
}

/**
 * Simulates financial shocks across debtor delays, cost inflation, revenue contraction, and creditor squeeze.
 */
export function runStressSimulation(
  base: FinancialBaseMetrics,
  shock: StressShockParameters
): StressSimulationResult {
  const cleanRev = Math.max(0, base.monthlyRevenue);
  const cleanExp = Math.max(0, base.monthlyExpenses);
  const marginFrac = Math.max(0, Math.min(1, base.grossMarginPct / 100));
  const cogsMonthly = cleanRev * (1 - marginFrac);

  // 1. Revenue Shock
  const postShockMonthlyRev = cleanRev * (1 - Math.max(0, shock.revenueDropPct) / 100);

  // 2. Direct Cost / COGS Inflation Shock
  const cogsIncrease = cogsMonthly * (Math.max(0, shock.cogsInflationPct) / 100);
  const stressedMonthlyExp = cleanExp + cogsIncrease;

  // 3. Stressed monthly net burn (if negative = deficit)
  const monthlyCashflow = postShockMonthlyRev - stressedMonthlyExp;
  const monthlyCashDeficit = monthlyCashflow < 0 ? Math.abs(monthlyCashflow) : 0;

  // 4. Working Capital Trapped due to Debtor Delays
  // Daily revenue delayed by debtorDelayDays
  const dailyRev = cleanRev / 30;
  const trappedReceivables = Math.round(dailyRev * Math.max(0, shock.debtorDelayDays));

  // 5. Creditor Acceleration (Cash Outflow under MSME 43B(h))
  const dailyPayables = base.totalPayables / 60; // Assuming standard 60-day payables
  const acceleratedPayablesDrain = Math.round(dailyPayables * Math.max(0, shock.creditorAccelerationDays));

  const totalImmediateLiquidityTrap = trappedReceivables + acceleratedPayablesDrain;

  // 6. Net Effective Liquid Cash after initial shock
  const netEffectiveCash = Math.max(0, base.cashReserve - totalImmediateLiquidityTrap);

  // 7. Days to Liquidity Cliff
  let daysToLiquidityCliff: number | null = null;
  if (monthlyCashDeficit > 0) {
    const dailyBurn = monthlyCashDeficit / 30;
    daysToLiquidityCliff = Math.max(0, Math.round(netEffectiveCash / dailyBurn));
  } else if (netEffectiveCash <= 0 && totalImmediateLiquidityTrap > base.cashReserve) {
    daysToLiquidityCliff = 0; // Immediate liquidity crunch
  }

  // 8. Stressed Working Capital for Altman Z'-Score
  const stressedWorkingCapital = (base.totalReceivables - trappedReceivables + netEffectiveCash) - base.totalPayables;
  const stressedNetWorth = Math.max(1, (base.totalAssets - totalImmediateLiquidityTrap) - base.totalLiabilities);
  const stressedEbit = base.ebit - (cogsIncrease * 12) - (cleanRev * (shock.revenueDropPct / 100) * marginFrac * 12);

  const postShockAltmanZ = calculateAltmanZScore({
    workingCapital: stressedWorkingCapital,
    totalAssets: Math.max(1, base.totalAssets - totalImmediateLiquidityTrap),
    retainedEarnings: Math.max(0, base.retainedEarnings + stressedEbit),
    ebit: stressedEbit,
    netWorth: stressedNetWorth,
    totalLiabilities: base.totalLiabilities,
    sales: postShockMonthlyRev * 12,
  });

  // 9. Vulnerability Classification
  let vulnerabilityTier: "RESILIENT" | "MODERATE_RISK" | "HIGH_RISK" | "ACUTE_CLIFF";
  if (daysToLiquidityCliff !== null && daysToLiquidityCliff <= 30) {
    vulnerabilityTier = "ACUTE_CLIFF";
  } else if (daysToLiquidityCliff !== null && daysToLiquidityCliff <= 90) {
    vulnerabilityTier = "HIGH_RISK";
  } else if (postShockAltmanZ.zone === "DISTRESS" || (daysToLiquidityCliff !== null && daysToLiquidityCliff <= 180)) {
    vulnerabilityTier = "MODERATE_RISK";
  } else {
    vulnerabilityTier = "RESILIENT";
  }

  // 10. Recommended Prescriptive Action Levers
  const actionLevers: string[] = [];
  if (shock.debtorDelayDays > 0) {
    actionLevers.push(`Factoring ₹${(trappedReceivables / 100000).toFixed(1)}L trapped receivables via RBI TReDS for 48-hr institutional liquidity.`);
  }
  if (shock.cogsInflationPct > 0) {
    actionLevers.push(`Repricing sales contracts with input cost indexation clause to protect gross margins against ₹${(cogsIncrease / 100000).toFixed(1)}L/mo surge.`);
  }
  if (daysToLiquidityCliff !== null && daysToLiquidityCliff < 90) {
    actionLevers.push("Halting non-essential capital expenditures and establishing secondary credit line before cash dips under 30 days.");
  }
  if (shock.creditorAccelerationDays > 0) {
    actionLevers.push("Reconciling Section 43B(h) MSME agreements to maintain statutory 45-day contract terms instead of 15-day defaults.");
  }
  if (actionLevers.length === 0) {
    actionLevers.push("Working capital buffer remains healthy across all simulated adverse parameters.");
  }

  return {
    baselineBurnMonthly: Math.round(cleanExp),
    stressedBurnMonthly: Math.round(stressedMonthlyExp),
    monthlyCashDeficit: Math.round(monthlyCashDeficit),
    immediateWorkingCapitalLocked: Math.round(totalImmediateLiquidityTrap),
    daysToLiquidityCliff,
    postShockAltmanZ,
    vulnerabilityTier,
    actionLevers,
  };
}
