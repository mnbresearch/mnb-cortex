/**
 * Cortex Solvency & Operational Health Scorecard Engine.
 *
 * Computes an objective, audit-grade 0-100 Solvency Index across four
 * foundational pillars of Indian SME & enterprise resilience:
 *  1. Liquidity & Cash Runway (25 pts)
 *  2. Receivables Quality & MSME 43B(h) Debt Aging (25 pts)
 *  3. Unit Economics & Gross Margins (25 pts)
 *  4. Statutory Tax & GST Compliance Defense (25 pts)
 *
 * DELIBERATELY PURE — no DB or network I/O, safely executed anywhere.
 */

export interface SolvencyMetrics {
  cashBalance: number;
  monthlyBurn: number;
  totalReceivables: number;
  overdueReceivables: number;
  dsoDays: number;
  grossMarginPct: number;
  advanceTaxPaidPct: number;
  hasGstDiscrepancy?: boolean;
}

export type HealthStatus = "optimal" | "adequate" | "warning" | "critical";

export interface ScoreDimension {
  score: number;
  max: 25;
  status: HealthStatus;
  note: string;
}

export interface SolvencyScorecardResult {
  overallScore: number; // 0 - 100
  grade: "A+" | "A" | "B" | "C" | "D";
  gradeLabel: string;
  dimensions: {
    liquidity: ScoreDimension;
    receivables: ScoreDimension;
    margins: ScoreDimension;
    compliance: ScoreDimension;
  };
  criticalAlerts: string[];
  topAction: string;
}

/**
 * Computes the composite Cortex Solvency Scorecard.
 */
export function calculateSolvencyScore(metrics: SolvencyMetrics): SolvencyScorecardResult {
  const alerts: string[] = [];

  // 1. Liquidity & Cash Runway (0 - 25 pts)
  const cash = Math.max(0, Number(metrics.cashBalance) || 0);
  const burn = Math.max(0, Number(metrics.monthlyBurn) || 0);
  const runwayWeeks = burn > 0 ? (cash / burn) * 4.33 : cash > 0 ? 52 : 0;

  let liqScore = 0;
  let liqStatus: HealthStatus = "critical";
  let liqNote = "";

  if (runwayWeeks >= 16) {
    liqScore = 25;
    liqStatus = "optimal";
    liqNote = `${runwayWeeks.toFixed(0)} weeks runway — strong financial cushion.`;
  } else if (runwayWeeks >= 8) {
    liqScore = 18;
    liqStatus = "adequate";
    liqNote = `${runwayWeeks.toFixed(0)} weeks runway — adequate but requires monitoring.`;
  } else if (runwayWeeks >= 4) {
    liqScore = 10;
    liqStatus = "warning";
    liqNote = `${runwayWeeks.toFixed(1)} weeks runway — working capital buffer is tight.`;
    alerts.push("Cash runway below 8 weeks: restrict non-essential discretionary capital expenditures.");
  } else {
    liqScore = 3;
    liqStatus = "critical";
    liqNote = `${runwayWeeks.toFixed(1)} weeks runway — immediate liquidity hazard.`;
    alerts.push("CRITICAL CASH CRUNCH: Runway under 4 weeks. Accelerate receivables recovery immediately.");
  }

  // 2. Receivables Quality & DSO (0 - 25 pts)
  const dso = Math.max(0, Number(metrics.dsoDays) || 0);
  const totalRec = Math.max(0, Number(metrics.totalReceivables) || 0);
  const overdueRec = Math.max(0, Number(metrics.overdueReceivables) || 0);
  const overdueRatio = totalRec > 0 ? overdueRec / totalRec : 0;

  let recScore = 0;
  let recStatus: HealthStatus = "critical";
  let recNote = "";

  if (dso > 90 || overdueRatio > 0.5) {
    recScore = 3;
    recStatus = "critical";
    recNote = `DSO ${dso.toFixed(0)} days — severe credit lockup past 90 days.`;
    alerts.push("RECEIVABLES EMERGENCY: Severe debtor delinquency past 90 days. Halt credit sales.");
  } else if (dso > 60 || overdueRatio > 0.25) {
    recScore = 10;
    recStatus = "warning";
    recNote = `DSO ${dso.toFixed(0)} days — ${(overdueRatio * 100).toFixed(0)}% overdue receivables.`;
    alerts.push(`High receivables aging: ${(overdueRatio * 100).toFixed(0)}% of customer book is overdue.`);
  } else if (dso > 45 || overdueRatio > 0.15) {
    recScore = 18;
    recStatus = "adequate";
    recNote = `DSO ${dso.toFixed(0)} days — moderate collection delay.`;
  } else {
    recScore = 25;
    recStatus = "optimal";
    recNote = `DSO ${dso.toFixed(0)} days — strictly compliant with MSME 45-day cycle.`;
  }

  // 3. Unit Economics & Gross Margins (0 - 25 pts)
  const margin = Number(metrics.grossMarginPct) || 0;
  let marScore = 0;
  let marStatus: HealthStatus = "critical";
  let marNote = "";

  if (margin >= 40) {
    marScore = 25;
    marStatus = "optimal";
    marNote = `Gross margin ${margin.toFixed(1)}% — healthy unit economics.`;
  } else if (margin >= 25) {
    marScore = 18;
    marStatus = "adequate";
    marNote = `Gross margin ${margin.toFixed(1)}% — viable operational spread.`;
  } else if (margin >= 15) {
    marScore = 10;
    marStatus = "warning";
    marNote = `Gross margin ${margin.toFixed(1)}% — pricing power under pressure.`;
    alerts.push("Compressed gross margin (<25%): Audit supplier raw material price increases.");
  } else {
    marScore = 4;
    marStatus = "critical";
    marNote = `Gross margin ${margin.toFixed(1)}% — negative or razor-thin operating margin.`;
    alerts.push("MARGIN DANGER: Operating below minimum sustainable gross margin. Restructure pricing.");
  }

  // 4. Statutory & Tax Defense (0 - 25 pts)
  const taxPaid = Math.max(0, Math.min(100, Number(metrics.advanceTaxPaidPct) || 0));
  const gstDiscrepancy = Boolean(metrics.hasGstDiscrepancy);

  let compScore = 15;
  if (taxPaid >= 90) compScore = 15;
  else if (taxPaid >= 60) compScore = 10;
  else if (taxPaid >= 30) compScore = 5;
  else compScore = 2;

  let compGst = gstDiscrepancy ? 0 : 10;
  const compTotal = Math.min(25, compScore + compGst);

  let compStatus: HealthStatus = "optimal";
  if (compTotal >= 20) compStatus = "optimal";
  else if (compTotal >= 15) compStatus = "adequate";
  else if (compTotal >= 10) compStatus = "warning";
  else compStatus = "critical";

  if (gstDiscrepancy) {
    alerts.push("GST GSTR-3B vs 2B mismatch detected: risk of Input Tax Credit reversal + 18% penal interest.");
  }
  if (taxPaid < 60) {
    alerts.push("Advance tax underpaid: accrual of Section 234C interest penalties active.");
  }

  const compNote = gstDiscrepancy
    ? `Tax paid ${taxPaid.toFixed(0)}% · GST mismatch pending reconciliation.`
    : `Tax paid ${taxPaid.toFixed(0)}% · GSTR-3B filings reconciled clean.`;

  // Total Score & Grading
  const overallScore = Math.min(100, Math.max(0, liqScore + recScore + marScore + compTotal));

  let grade: SolvencyScorecardResult["grade"] = "C";
  let gradeLabel = "Vulnerable";

  if (overallScore >= 88) {
    grade = "A+";
    gradeLabel = "Enterprise Resilient";
  } else if (overallScore >= 75) {
    grade = "A";
    gradeLabel = "Financially Robust";
  } else if (overallScore >= 60) {
    grade = "B";
    gradeLabel = "Stable with Cautions";
  } else if (overallScore >= 40) {
    grade = "C";
    gradeLabel = "Operationally Vulnerable";
  } else {
    grade = "D";
    gradeLabel = "Severely Distressed";
  }

  let topAction = "Maintain healthy operations and monitor quarterly advance tax schedule.";
  if (liqStatus === "critical" || recStatus === "critical") {
    topAction = "Generate instant zero-fee Dynamic UPI QR payment links and issue 48-hour recovery notices to top 3 overdue debtors.";
  } else if (marStatus === "warning" || marStatus === "critical") {
    topAction = "Review supplier price lists and revise minimum order quantities to restore gross margins above 30%.";
  } else if (compStatus === "warning" || compStatus === "critical") {
    topAction = "Reconcile GSTR-2B ITC credits and provision remaining advance tax before the next quarterly statutory cutoff.";
  }

  return {
    overallScore,
    grade,
    gradeLabel,
    dimensions: {
      liquidity: { score: liqScore, max: 25, status: liqStatus, note: liqNote },
      receivables: { score: recScore, max: 25, status: recStatus, note: recNote },
      margins: { score: marScore, max: 25, status: marStatus, note: marNote },
      compliance: { score: compTotal, max: 25, status: compStatus, note: compNote },
    },
    criticalAlerts: alerts,
    topAction,
  };
}
