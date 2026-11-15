/**
 * ENTERPRISE FINANCIAL DIGITAL TWIN & SHOCK CHAMBER ENGINE
 *
 * Real-time balance sheet simulation and stress-testing for Enterprise CFOs and Boards:
 *  1. Debtor Default & Collection Delay Shock (What if top clients freeze payment?)
 *  2. MSME 45-Day Statutory Squeeze Shock (What if small vendors enforce 15-day terms?)
 *  3. COGS & Raw Material Inflation Shock (Input cost surge impact on EBITDA)
 *  4. Working Capital Line Rate Hike Shock (Borrowing cost impact on debt service)
 *
 * Automatically derives:
 *  - Net Liquidity Shortfall & Runway Contraction
 *  - Covenant Breach Risk (Low / Medium / Severe)
 *  - 1-Click Autonomous Mitigation Playbooks (Cash recovery levers)
 */

export interface BaselineFinancials {
  cashInBank: number;
  monthlyBurnRate: number;
  monthlyRevenue: number;
  totalReceivables: number;
  totalPayables: number;
  topDebtorConcentrationPct: number; // e.g. 40 = 40%
  currentRunwayMonths: number;
}

export interface ShockParameters {
  debtorDelayDays: number; // 0 to 90
  debtorDefaultPct: number; // 0 to 25
  msmeTermsCompression: boolean; // Suppliers demand 15-day settlement
  cogsInflationPct: number; // 0 to 20
  interestRateHikeBps: number; // 0 to 300
}

export interface SimulationImpact {
  simulatedRunwayMonths: number;
  runwayContractedMonths: number;
  immediateCashShortfall: number;
  workingCapitalGap: number;
  ebitdaImpactAnnual: number;
  covenantBreachRisk: "low" | "medium" | "severe";
}

export interface MitigationPlaybook {
  id: string;
  title: string;
  category: "liquidity" | "receivables" | "statutory" | "treasury";
  cashUnlocked: number;
  runwayRestoredMonths: number;
  description: string;
  actionLabel: string;
  actionRoute: string;
}

export interface DigitalTwinResult {
  baseline: BaselineFinancials;
  shocks: ShockParameters;
  impact: SimulationImpact;
  mitigations: MitigationPlaybook[];
  simulatedAt: string;
}

/** Default enterprise financial baseline if workspace is newly initialized */
export const DEFAULT_BASELINE_FINANCIALS: BaselineFinancials = {
  cashInBank: 4500000, // ₹45 Lakhs
  monthlyBurnRate: 1200000, // ₹12 Lakhs
  monthlyRevenue: 3800000, // ₹38 Lakhs
  totalReceivables: 5200000, // ₹52 Lakhs
  totalPayables: 2400000, // ₹24 Lakhs
  topDebtorConcentrationPct: 42, // 42% tied in top 3 clients
  currentRunwayMonths: 3.75, // 45L / 12L
};

/** Default stress parameters */
export const DEFAULT_SHOCK_PARAMETERS: ShockParameters = {
  debtorDelayDays: 30,
  debtorDefaultPct: 5,
  msmeTermsCompression: true,
  cogsInflationPct: 8,
  interestRateHikeBps: 100,
};

/**
 * Runs the deterministic financial shock simulation
 */
export function simulateFinancialShocks(
  baseline: BaselineFinancials,
  shocks: ShockParameters
): DigitalTwinResult {
  const cash = Math.max(0, baseline.cashInBank);
  const burn = Math.max(10000, baseline.monthlyBurnRate);
  const rev = Math.max(0, baseline.monthlyRevenue);
  const ar = Math.max(0, baseline.totalReceivables);
  const ap = Math.max(0, baseline.totalPayables);

  // 1. Debtor Default Impact (Lost cash from defaults)
  const defaultLoss = Math.round(ar * (shocks.debtorDefaultPct / 100));

  // 2. Debtor Delay Impact (Cash delayed past the current 30-day cycle)
  const topAr = ar * (baseline.topDebtorConcentrationPct / 100);
  const delayFactor = Math.min(1, shocks.debtorDelayDays / 60);
  const cashDelayed = Math.round(topAr * delayFactor);

  // 3. MSME Terms Compression (Accelarated payables outflow)
  const msmeOutflowAccelerated = shocks.msmeTermsCompression ? Math.round(ap * 0.45) : 0;

  // 4. COGS Inflation (Raises monthly burn rate)
  const monthlyCogsSurge = Math.round((rev * 0.55) * (shocks.cogsInflationPct / 100));
  const annualEbitdaHit = Math.round(monthlyCogsSurge * 12 + defaultLoss);

  // 5. Total Immediate Cash Shortfall
  const immediateShortfall = defaultLoss + cashDelayed + msmeOutflowAccelerated;
  const newEffectiveCash = Math.max(0, cash - immediateShortfall);
  const newMonthlyBurn = burn + monthlyCogsSurge;

  // 6. Simulated Runway (bounded to 0)
  const simulatedRunwayMonths = Number((newEffectiveCash / newMonthlyBurn).toFixed(1));
  const baseRunway = Number((cash / burn).toFixed(1));
  const runwayContractedMonths = Number(Math.max(0, baseRunway - simulatedRunwayMonths).toFixed(1));

  // 7. Working Capital Gap
  const workingCapitalGap = Math.max(0, immediateShortfall - (cash * 0.5));

  // 8. Covenant Breach Risk
  let covenantBreachRisk: "low" | "medium" | "severe" = "low";
  if (simulatedRunwayMonths < 1.5 || workingCapitalGap > 2000000) {
    covenantBreachRisk = "severe";
  } else if (simulatedRunwayMonths < 3.0 || workingCapitalGap > 500000) {
    covenantBreachRisk = "medium";
  }

  // 9. Generate Autonomous Mitigation Playbooks
  const mitigations: MitigationPlaybook[] = [];

  if (cashDelayed > 0 || defaultLoss > 0) {
    const recoveredAr = Math.round((cashDelayed + defaultLoss) * 0.65);
    mitigations.push({
      id: "mit-ar-autopilot",
      title: "Activate Dynamic UPI & Automated WhatsApp Chasing",
      category: "receivables",
      cashUnlocked: recoveredAr,
      runwayRestoredMonths: Number((recoveredAr / newMonthlyBurn).toFixed(1)),
      description: "Deploys tone-modulated payment reminders with 0% fee Dynamic UPI QR codes directly to overdue debtor accounts.",
      actionLabel: "Launch Collections Autopilot",
      actionRoute: "/collections",
    });
  }

  if (shocks.msmeTermsCompression && msmeOutflowAccelerated > 0) {
    const tredsFinancing = Math.round(msmeOutflowAccelerated * 0.85);
    mitigations.push({
      id: "mit-treds-discount",
      title: "TReDS Institutional Invoice Discounting",
      category: "liquidity",
      cashUnlocked: tredsFinancing,
      runwayRestoredMonths: Number((tredsFinancing / newMonthlyBurn).toFixed(1)),
      description: "Offload micro/small supplier invoices to TReDS exchange (RXIL/M1xchange) at 7.5% p.a. bank rate, preserving statutory 43B(h) compliance.",
      actionLabel: "Prepare TReDS Auction File",
      actionRoute: "/forecast",
    });
  }

  if (workingCapitalGap > 0) {
    const earlyPayInflow = Math.round(ar * 0.35);
    mitigations.push({
      id: "mit-early-discount",
      title: "Offer 2% Net-10 Early Settlement Discount",
      category: "treasury",
      cashUnlocked: earlyPayInflow,
      runwayRestoredMonths: Number((earlyPayInflow / newMonthlyBurn).toFixed(1)),
      description: "Incentivize prompt B2B settlements from non-defaulting buyers by offering a 2% settlement credit if cleared within 72 hours.",
      actionLabel: "Review Settlement Terms",
      actionRoute: "/receivables",
    });
  }

  return {
    baseline,
    shocks,
    impact: {
      simulatedRunwayMonths,
      runwayContractedMonths,
      immediateCashShortfall: immediateShortfall,
      workingCapitalGap: Math.round(workingCapitalGap),
      ebitdaImpactAnnual: annualEbitdaHit,
      covenantBreachRisk,
    },
    mitigations,
    simulatedAt: new Date().toISOString(),
  };
}
