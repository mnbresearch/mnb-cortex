/**
 * Autonomous Multi-Agent COO Executive Council Chamber — Core Specifications & Fallback.
 *
 * Pure definitions and deterministic fallback logic. Safe to import on both
 * client and server without pulling server-only dependencies.
 */

export type CouncilPersona = "cfo" | "coo" | "cro" | "compliance";

export interface PersonaPerspective {
  persona: CouncilPersona;
  name: string;
  role: string;
  verdict: "strongly_support" | "support_with_conditions" | "oppose" | "neutral";
  keyArgument: string;
  rationale: string[];
  metricsWatched: string[];
  risksIdentified: string[];
  suggestedConditions: string[];
}

export interface CouncilExecutionResult {
  decisionTitle: string;
  problemStatement: string;
  perspectives: Record<CouncilPersona, PersonaPerspective>;
  executiveVerdict: {
    consensusRecommendation: string;
    confidenceScore: number; // 0 - 100
    primaryTradeoff: string;
    actionPlan7Days: string[];
    riskMitigations: string[];
  };
  proposedActions: {
    title: string;
    kind: string;
    details: string;
  }[];
  generatedAt: string;
}

export const PERSONA_METADATA: Record<CouncilPersona, { name: string; role: string; focus: string }> = {
  cfo: {
    name: "Dr. Arvind Rao",
    role: "Fractional Chief Financial Officer",
    focus: "Cash Runway, Working Capital, Gross/Net Margins, DSCR & Debt Service, 13-Week Liquidity",
  },
  coo: {
    name: "Meera Sen",
    role: "Chief Operating Officer",
    focus: "Operational Throughput, Inventory Holding Costs, Supplier SLAs, Fulfillment Bottlenecks",
  },
  cro: {
    name: "Kabir Malhotra",
    role: "Chief Revenue Officer",
    focus: "Receivables Acceleration, Customer Churn Risk, Pricing Power, Pipeline Velocity, LTV/CAC",
  },
  compliance: {
    name: "Adv. Sunita Joshi",
    role: "Statutory & Tax Counsel",
    focus: "MSME 43B(h) 45-day Rule, Section 194Q/194C TDS, GST GSTR-3B Timing, Advance Tax (234B/C)",
  },
};

/**
 * Generates an intelligent, deterministic baseline council result when
 * offline, in tests, or as a zero-latency fallback.
 */
export function fallbackCouncil(problemStatement: string, context: string = ""): CouncilExecutionResult {
  const statement = problemStatement.trim() || "Strategic business expansion vs cash preservation";
  const lower = statement.toLowerCase();

  const isCashOrReceivables = /cash|invoice|receivable|debt|overdue|chase|credit|discount/i.test(lower);
  const isInventoryOrSupply = /inventory|stock|supplier|vendor|warehouse|factory|order/i.test(lower);

  const cfoVerdict = isCashOrReceivables ? "support_with_conditions" : "neutral";
  const croVerdict = isCashOrReceivables ? "strongly_support" : "support_with_conditions";

  return {
    decisionTitle: statement.slice(0, 60),
    problemStatement: statement,
    perspectives: {
      cfo: {
        persona: "cfo",
        name: PERSONA_METADATA.cfo.name,
        role: PERSONA_METADATA.cfo.role,
        verdict: cfoVerdict,
        keyArgument: isCashOrReceivables
          ? "Protect 13-week liquidity runway; any customer discount must exceed our cost of working capital borrowing (12-14% p.a.)."
          : "Ensure any capital commitment maintains at least 90 days of operational cash buffer.",
        rationale: [
          "Preserve cash reserves for upcoming quarterly advance tax and monthly payroll commitments.",
          "Prevent margin erosion from uncontrolled customer discounting.",
          "Maintain healthy Debt Service Coverage Ratio (DSCR > 1.35x).",
        ],
        metricsWatched: ["Cash Runway (Weeks)", "Operating Cash Flow", "Gross Margin %", "Working Capital Cycle"],
        risksIdentified: [
          "Liquidity squeeze if key debtor defaults after credit extension.",
          "Over-commitment of uncommitted operating cash.",
        ],
        suggestedConditions: [
          "Require 30% upfront milestone payment.",
          "Cap promotional cash discounts at maximum 3% for immediate 48-hour RTGS/UPI settlement.",
        ],
      },
      coo: {
        persona: "coo",
        name: PERSONA_METADATA.coo.name,
        role: PERSONA_METADATA.coo.role,
        verdict: isInventoryOrSupply ? "support_with_conditions" : "support_with_conditions",
        keyArgument: "Ensure fulfillment capacity and vendor SLAs can absorb changes without quality degradation.",
        rationale: [
          "Inventory holding costs in Indian MSMEs average 18-22% p.a. including finance and storage.",
          "Vendor relationships must be ring-fenced with clear lead-time guarantees.",
        ],
        metricsWatched: ["Inventory Turnover Ratio", "Order Fulfillment Cycle Time", "Vendor On-Time In-Full (OTIF) %"],
        risksIdentified: [
          "Supply chain delivery bottlenecks from single-source suppliers.",
          "Dead stock accumulation if demand forecast is over-optimistic.",
        ],
        suggestedConditions: [
          "Set minimum order quantities (MOQ) and staggered delivery schedules.",
          "Implement strict vendor inspection before final delivery acceptance.",
        ],
      },
      cro: {
        persona: "cro",
        name: PERSONA_METADATA.cro.name,
        role: PERSONA_METADATA.cro.role,
        verdict: croVerdict,
        keyArgument: "Accelerate revenue realization and strengthen top-tier customer relationship retention.",
        rationale: [
          "Cash collected today is worth significantly more than disputed receivables aged 90+ days.",
          "Align incentive structures with sales velocity and repeat order frequency.",
        ],
        metricsWatched: ["Days Sales Outstanding (DSO)", "Customer Concentration %", "Pipeline Win Rate", "Repeat Order Rate"],
        risksIdentified: [
          "Client churn to aggressive competitors offering looser credit terms.",
          "Account manager reluctance to firmly enforce credit limits.",
        ],
        suggestedConditions: [
          "Offer dynamic zero-fee UPI QR codes on all overdue invoice reminders.",
          "Reward sales team on collections collected rather than invoices booked.",
        ],
      },
      compliance: {
        persona: "compliance",
        name: PERSONA_METADATA.compliance.name,
        role: PERSONA_METADATA.compliance.role,
        verdict: "support_with_conditions",
        keyArgument: "Enforce strict compliance with Section 43B(h) of the Income Tax Act and Section 194Q TDS obligations.",
        rationale: [
          "Payments to registered MSME suppliers must be settled within 45 days (with agreement) or 15 days (without agreement) to claim tax deduction.",
          "Failure to deduct 0.1% TDS on aggregate purchases exceeding ₹50L invites disallowance under Section 40(a)(ia).",
        ],
        metricsWatched: ["MSME 43B(h) Aging (<45 days)", "TDS Section 194Q/194C Filing Compliance", "GSTR-3B vs 2B ITC Matching %"],
        risksIdentified: [
          "Compounding penal interest under Section 16 of the MSMED Act at 3x the RBI bank rate.",
          "Input Tax Credit (ITC) reversal with 18% p.a. interest if supplier GSTR-1 is delayed.",
        ],
        suggestedConditions: [
          "Mandate MSME Udyam registration verification for all counterparties.",
          "Issue written purchase agreements specifying explicit payment windows.",
        ],
      },
    },
    executiveVerdict: {
      consensusRecommendation:
        "Execute a balanced dual-track plan: offer a strictly time-bound 2.5% settlement incentive for instant UPI/RTGS clearance within 5 business days, while immediately halting credit extensions for accounts exceeding 60 days overdue.",
      confidenceScore: 88,
      primaryTradeoff: "Trading a 2.5% margin concession against immediate cash liquidity and elimination of bad-debt risk.",
      actionPlan7Days: [
        "Day 1: Segment all pending accounts into MSME registered vs non-MSME.",
        "Day 2: Dispatch digital payment notices with dynamic zero-fee UPI QR codes and MSME interest notices.",
        "Day 3: Hold 1-on-1 alignment calls with the top 3 high-exposure debtors.",
        "Day 5: Reconcile payments received; freeze dispatch orders for non-responsive counterparties.",
        "Day 7: Review working capital runway and allocate surplus into advance tax reserves.",
      ],
      riskMitigations: [
        "Cap discount exposure at ₹50,000 aggregate across all accounts.",
        "Log all customer confirmations in Cortex Approvals before applying credit adjustments.",
      ],
    },
    proposedActions: [
      {
        title: "Send Instant Dynamic UPI Recovery Notice to Top Debtors",
        kind: "communication",
        details: "Generate zero-cost UPI payment links with 2.5% prompt-pay rebate expiring in 5 days.",
      },
      {
        title: "Audit MSME 43B(h) Vendor Aging Schedule",
        kind: "compliance",
        details: "Identify all supplier invoices approaching day 35 to prevent tax deduction disallowance.",
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}
