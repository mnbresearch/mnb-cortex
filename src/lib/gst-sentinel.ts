/**
 * GST Rule 88C (DRC-01B) & Rule 88D (DRC-01C) Notice Risk Sentinel Engine.
 *
 * Statutory Framework:
 * - Rule 88C, Central Goods and Services Tax Rules, 2017:
 *   Manner of dealing with difference in liability reported in statement of
 *   outward supplies (GSTR-1) and that reported in return (GSTR-3B).
 *   Trigger threshold: Difference > 20% AND > ₹25,000.
 *   Consequence: Form DRC-01B Part A, blocking of GSTR-1 under Rule 59(6)(e).
 *
 * - Rule 88D, Central Goods and Services Tax Rules, 2017:
 *   Manner of dealing with difference in input tax credit available in auto-generated
 *   statement (GSTR-2B) and that availed in return (GSTR-3B).
 *   Trigger threshold: Difference > 20% AND > ₹25,000.
 *   Consequence: Form DRC-01C Part A, blocking of GSTR-1 under Rule 59(6)(f).
 *
 * - Section 50 Interest:
 *   - 18% p.a. on net unpaid tax liability under Section 50(1).
 *   - 24% p.a. on wrongly availed and utilized ITC under Section 50(3).
 *
 * DELIBERATELY PURE — safely executed on client, server, or standalone scripts.
 */

export const STATUTORY_NOTICE_PCT_THRESHOLD = 20.0; // 20% difference
export const STATUTORY_NOTICE_RUPEES_THRESHOLD = 25000; // ₹25,000 difference
export const SECTION_50_OUTWARD_INTEREST_RATE_PCT = 18.0; // 18% p.a.
export const SECTION_50_ITC_INTEREST_RATE_PCT = 24.0; // 24% p.a.

export interface TaxBreakdown {
  igst: number;
  cgst: number;
  sgst: number;
  cess?: number;
}

export interface Rule88cCheckInput {
  taxPeriod: string; // e.g. "January 2026"
  gstr1Liability: TaxBreakdown;
  gstr3bLiabilityPaid: TaxBreakdown;
  daysLateSinceDueDate?: number;
}

export interface Rule88dCheckInput {
  taxPeriod: string;
  gstr3bItcClaimed: TaxBreakdown;
  gstr2bItcAvailable: TaxBreakdown;
  daysLateSinceDueDate?: number;
}

export type RiskLevel = "safe" | "warning" | "danger";

export interface Rule88cResult {
  taxPeriod: string;
  gstr1Total: number;
  gstr3bTotal: number;
  excessLiability: number;
  excessPct: number;
  riskLevel: RiskLevel;
  breachesStatutoryThreshold: boolean;
  interestExposureSec50: number; // At 18% p.a.
  statusMessage: string;
  recommendedPartBReasonCode: string;
  justificationTemplate: string;
}

export interface Rule88dResult {
  taxPeriod: string;
  gstr3bTotalItc: number;
  gstr2bTotalItc: number;
  excessItc: number;
  excessPct: number;
  riskLevel: RiskLevel;
  breachesStatutoryThreshold: boolean;
  interestExposureSec50: number; // At 24% p.a.
  statusMessage: string;
  recommendedPartBReasonCode: string;
  justificationTemplate: string;
}

export interface GstSentinelAuditResult {
  rule88c: Rule88cResult;
  rule88d: Rule88dResult;
  overallComplianceStatus: "compliant" | "action_required" | "critical_notice_risk";
  totalInterestExposure: number;
  portalBlockingRisk: boolean; // Under Rule 59(6)
}

function sumTax(t: TaxBreakdown): number {
  return (t.igst || 0) + (t.cgst || 0) + (t.sgst || 0) + (t.cess || 0);
}

/**
 * Calculates Section 50 simple interest per day.
 * Interest = Principal * (annualRate / 100) * (days / 365)
 */
export function calculateSection50Interest(
  principal: number,
  daysDelayed: number,
  annualRatePct: number = SECTION_50_OUTWARD_INTEREST_RATE_PCT
): number {
  if (principal <= 0 || daysDelayed <= 0) return 0;
  return Math.round((principal * (annualRatePct / 100) * (daysDelayed / 365)) * 100) / 100;
}

/**
 * Evaluates Rule 88C (DRC-01B) Outward Tax Liability Mismatch.
 */
export function auditRule88c(input: Rule88cCheckInput): Rule88cResult {
  const gstr1Total = sumTax(input.gstr1Liability);
  const gstr3bTotal = sumTax(input.gstr3bLiabilityPaid);
  const excess = Math.max(0, gstr1Total - gstr3bTotal);

  let excessPct = 0;
  if (gstr3bTotal > 0) {
    excessPct = Math.round((excess / gstr3bTotal) * 10000) / 100;
  } else if (excess > 0) {
    excessPct = 100.0;
  }

  const breaches =
    excess > STATUTORY_NOTICE_RUPEES_THRESHOLD &&
    excessPct > STATUTORY_NOTICE_PCT_THRESHOLD;

  let riskLevel: RiskLevel = "safe";
  if (breaches) {
    riskLevel = "danger";
  } else if (excess > 10000 || excessPct > 10) {
    riskLevel = "warning";
  }

  const days = Math.max(0, input.daysLateSinceDueDate ?? 0);
  const interest = calculateSection50Interest(excess, days, SECTION_50_OUTWARD_INTEREST_RATE_PCT);

  let statusMessage = "GSTR-1 liability matches GSTR-3B within safe tolerance. Zero DRC-01B risk.";
  let reasonCode = "N/A";
  let template = "";

  if (breaches) {
    statusMessage = `CRITICAL: GSTR-1 exceeds GSTR-3B by ₹${Math.round(excess).toLocaleString("en-IN")} (${excessPct}%). Breaches Rule 88C statutory threshold (>₹25k and >20%). DRC-01B notice imminent.`;
    reasonCode = "Code 1: Typographical error in GSTR-1 / Credit Note omitted in GSTR-1";
    template = `REPLY TO NOTICE UNDER RULE 88C (FORM DRC-01B PART B)
Tax Period: ${input.taxPeriod}
GSTIN: [Enter GSTIN]
Legal Name: [Enter Entity Name]

Reference: Discrepancy between outward supplies declared in GSTR-1 and tax paid in GSTR-3B.

Reason for Discrepancy:
1. Differential liability of ₹${Math.round(excess).toLocaleString("en-IN")} is attributable to:
   [Select applicable reason below]
   (a) Typographical / data entry error in Table 4 / Table 5 of Form GSTR-1, whereas correct tax liability was discharged in Form GSTR-3B.
   (b) Credit Notes issued under Section 34 were accounted for in Form GSTR-3B but inadvertently omitted in Form GSTR-1; rectifiable in subsequent GSTR-1.
   (c) Advance received for future supply was adjusted in GSTR-3B.
2. The registered person confirms that the correct tax liability has been fully discharged and there is no loss of revenue to the Government exchequer.

Prayer:
In view of the above facts, it is humbly requested that the proceedings under Rule 88C may kindly be dropped and filing of subsequent GSTR-1 may be unblocked under Rule 59(6)(e).`;
  } else if (riskLevel === "warning") {
    statusMessage = `CAUTION: GSTR-1 exceeds GSTR-3B by ₹${Math.round(excess).toLocaleString("en-IN")} (${excessPct}%). Approaching statutory threshold. Verify invoices before filing.`;
  }

  return {
    taxPeriod: input.taxPeriod,
    gstr1Total,
    gstr3bTotal,
    excessLiability: excess,
    excessPct,
    riskLevel,
    breachesStatutoryThreshold: breaches,
    interestExposureSec50: interest,
    statusMessage,
    recommendedPartBReasonCode: reasonCode,
    justificationTemplate: template,
  };
}

/**
 * Evaluates Rule 88D (DRC-01C) Inward Input Tax Credit Mismatch.
 */
export function auditRule88d(input: Rule88dCheckInput): Rule88dResult {
  const gstr3bTotal = sumTax(input.gstr3bItcClaimed);
  const gstr2bTotal = sumTax(input.gstr2bItcAvailable);
  const excess = Math.max(0, gstr3bTotal - gstr2bTotal);

  let excessPct = 0;
  if (gstr2bTotal > 0) {
    excessPct = Math.round((excess / gstr2bTotal) * 10000) / 100;
  } else if (excess > 0) {
    excessPct = 100.0;
  }

  const breaches =
    excess > STATUTORY_NOTICE_RUPEES_THRESHOLD &&
    excessPct > STATUTORY_NOTICE_PCT_THRESHOLD;

  let riskLevel: RiskLevel = "safe";
  if (breaches) {
    riskLevel = "danger";
  } else if (excess > 10000 || excessPct > 10) {
    riskLevel = "warning";
  }

  const days = Math.max(0, input.daysLateSinceDueDate ?? 0);
  const interest = calculateSection50Interest(excess, days, SECTION_50_ITC_INTEREST_RATE_PCT);

  let statusMessage = "GSTR-3B ITC claimed matches GSTR-2B within safe limits. Zero DRC-01C risk.";
  let reasonCode = "N/A";
  let template = "";

  if (breaches) {
    statusMessage = `CRITICAL: GSTR-3B ITC exceeds GSTR-2B by ₹${Math.round(excess).toLocaleString("en-IN")} (${excessPct}%). Breaches Rule 88D statutory threshold (>₹25k and >20%). DRC-01C notice imminent.`;
    reasonCode = "Code 1: Supplier uploaded GSTR-1 after 2B cut-off / ITC of previous period availed";
    template = `REPLY TO NOTICE UNDER RULE 88D (FORM DRC-01C PART B)
Tax Period: ${input.taxPeriod}
GSTIN: [Enter GSTIN]
Legal Name: [Enter Entity Name]

Reference: Discrepancy between Input Tax Credit availed in Form GSTR-3B and credit available in Form GSTR-2B.

Reason for Difference:
1. Differential ITC of ₹${Math.round(excess).toLocaleString("en-IN")} claimed in GSTR-3B is justified on account of:
   [Select applicable reason below]
   (a) ITC pertaining to invoices of previous tax periods claimed in the current period in terms of first proviso to Section 16(4) of the CGST Act.
   (b) Suppliers uploaded invoices in Form GSTR-1 after the 13th cut-off date, which will reflect in subsequent GSTR-2B.
   (c) Inward supplies liable to reverse charge (Section 9(3)) paid via cash ledger and eligible as ITC under Table 4(A)(3).
   (d) Import of goods from SEZ / Customs through ICEGATE which was not auto-drafted in GSTR-2B at the time of filing.
2. The taxpayer holds valid tax invoices fulfilling all conditions prescribed under Section 16(2) of the CGST Act.

Prayer:
It is humbly submitted that the ITC availed is lawful and eligible. It is requested that Form DRC-01C proceedings be closed without adverse action.`;
  } else if (riskLevel === "warning") {
    statusMessage = `CAUTION: GSTR-3B ITC exceeds GSTR-2B by ₹${Math.round(excess).toLocaleString("en-IN")} (${excessPct}%). Approaching statutory threshold. Verify Section 16(2)(aa) compliance.`;
  }

  return {
    taxPeriod: input.taxPeriod,
    gstr3bTotalItc: gstr3bTotal,
    gstr2bTotalItc: gstr2bTotal,
    excessItc: excess,
    excessPct,
    riskLevel,
    breachesStatutoryThreshold: breaches,
    interestExposureSec50: interest,
    statusMessage,
    recommendedPartBReasonCode: reasonCode,
    justificationTemplate: template,
  };
}

/**
 * Runs combined GST Sentinel Audit for both Rule 88C and Rule 88D.
 */
export function runGstSentinelAudit(
  rule88cInput: Rule88cCheckInput,
  rule88dInput: Rule88dCheckInput
): GstSentinelAuditResult {
  const r88c = auditRule88c(rule88cInput);
  const r88d = auditRule88d(rule88dInput);

  const hasDanger = r88c.riskLevel === "danger" || r88d.riskLevel === "danger";
  const hasWarning = r88c.riskLevel === "warning" || r88d.riskLevel === "warning";

  let status: GstSentinelAuditResult["overallComplianceStatus"] = "compliant";
  if (hasDanger) {
    status = "critical_notice_risk";
  } else if (hasWarning) {
    status = "action_required";
  }

  return {
    rule88c: r88c,
    rule88d: r88d,
    overallComplianceStatus: status,
    totalInterestExposure: Math.round((r88c.interestExposureSec50 + r88d.interestExposureSec50) * 100) / 100,
    portalBlockingRisk: hasDanger,
  };
}
