import "server-only";
import { runCortex } from "@/lib/ai/cortex";
import { vaultFor } from "@/lib/ai/dlp-server";
import { FAST } from "@/lib/ai/generation";
import {
  type CouncilPersona,
  type PersonaPerspective,
  type CouncilExecutionResult,
  PERSONA_METADATA,
  fallbackCouncil,
} from "@/lib/ai/council";

export * from "@/lib/ai/council";

/**
 * Executes an Autonomous Council deliberation across all 4 executive personas.
 * Employs DLP vault redaction on all input data before LLM execution,
 * and restores sensitive tokens on the synthesized response.
 */
export async function runExecutiveCouncil(
  problemStatement: string,
  context: string = "",
  orgId?: string | null
): Promise<CouncilExecutionResult> {
  const vault = await vaultFor(orgId ?? null);
  const cleanStatement = vault.redact(problemStatement.trim());
  const cleanContext = vault.redact(context);

  if (!cleanStatement) {
    return fallbackCouncil("Standard Strategic Solvency Review", cleanContext);
  }

  const councilPrompt = `
You are the Executive Council Orchestrator for MNB Cortex, the AI COO platform for Indian enterprises and SMEs.
Conduct an exhaustive C-Suite deliberation on the strategic question below.

PROBLEM STATEMENT:
${cleanStatement}

RELEVANT BUSINESS CONTEXT:
${cleanContext || "Indian SME / Enterprise operating environment. Bank interest ~11-14% p.a., MSME Act 43B(h) active, GST monthly/quarterly compliance."}

DELIBERATE FROM FOUR DISTINCT PERSPECTIVES:
1. CFO (Dr. Arvind Rao): Cash runway, working capital, gross/net margins, debt service, liquidity.
2. COO (Meera Sen): Operations, fulfillment capacity, inventory turnover, supplier lead times, OTIF %.
3. CRO (Kabir Malhotra): Revenue acceleration, receivables velocity, client churn, pricing power.
4. Statutory & Legal Counsel (Adv. Sunita Joshi): MSME 43B(h) 45-day rule, Section 194Q/194C TDS, GSTR-3B, Advance tax interest.

OUTPUT STRICT RFC 8259 JSON ONLY:
{
  "decisionTitle": "Brief title (max 8 words)",
  "perspectives": {
    "cfo": {
      "verdict": "strongly_support" | "support_with_conditions" | "oppose" | "neutral",
      "keyArgument": "1-2 sentence core thesis",
      "rationale": ["point 1", "point 2", "point 3"],
      "metricsWatched": ["metric 1", "metric 2"],
      "risksIdentified": ["risk 1", "risk 2"],
      "suggestedConditions": ["condition 1", "condition 2"]
    },
    "coo": {
      "verdict": "strongly_support" | "support_with_conditions" | "oppose" | "neutral",
      "keyArgument": "1-2 sentence core thesis",
      "rationale": ["point 1", "point 2", "point 3"],
      "metricsWatched": ["metric 1", "metric 2"],
      "risksIdentified": ["risk 1", "risk 2"],
      "suggestedConditions": ["condition 1", "condition 2"]
    },
    "cro": {
      "verdict": "strongly_support" | "support_with_conditions" | "oppose" | "neutral",
      "keyArgument": "1-2 sentence core thesis",
      "rationale": ["point 1", "point 2", "point 3"],
      "metricsWatched": ["metric 1", "metric 2"],
      "risksIdentified": ["risk 1", "risk 2"],
      "suggestedConditions": ["condition 1", "condition 2"]
    },
    "compliance": {
      "verdict": "strongly_support" | "support_with_conditions" | "oppose" | "neutral",
      "keyArgument": "1-2 sentence core thesis",
      "rationale": ["point 1", "point 2", "point 3"],
      "metricsWatched": ["metric 1", "metric 2"],
      "risksIdentified": ["risk 1", "risk 2"],
      "suggestedConditions": ["condition 1", "condition 2"]
    }
  },
  "executiveVerdict": {
    "consensusRecommendation": "Comprehensive consensus verdict (3-4 sentences)",
    "confidenceScore": 85,
    "primaryTradeoff": "Clear explanation of the tension between C-suite viewpoints",
    "actionPlan7Days": ["Day 1: ...", "Day 3: ...", "Day 5: ...", "Day 7: ..."],
    "riskMitigations": ["Mitigation 1", "Mitigation 2"]
  },
  "proposedActions": [
    { "title": "Action title", "kind": "communication" | "compliance" | "operational", "details": "Specific detail" }
  ]
}
`.trim();

  try {
    const rawAnswer = await runCortex(
      [{ role: "user", content: councilPrompt }],
      cleanContext,
      FAST,
      { deadlineAt: Date.now() + 45_000 }
    );

    if (!rawAnswer || rawAnswer.startsWith("I looked several things up") || rawAnswer.length < 100) {
      return fallbackCouncil(problemStatement, context);
    }

    const jsonMatch = rawAnswer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackCouncil(problemStatement, context);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const restoredTitle = vault.restore(parsed.decisionTitle || problemStatement.slice(0, 50));
    const restoredVerdict = vault.restore(parsed.executiveVerdict?.consensusRecommendation || "");
    const restoredTradeoff = vault.restore(parsed.executiveVerdict?.primaryTradeoff || "");

    const assemblePerspective = (key: CouncilPersona): PersonaPerspective => {
      const p = parsed.perspectives?.[key] || {};
      const meta = PERSONA_METADATA[key];
      return {
        persona: key,
        name: meta.name,
        role: meta.role,
        verdict: ["strongly_support", "support_with_conditions", "oppose", "neutral"].includes(p.verdict)
          ? p.verdict
          : "support_with_conditions",
        keyArgument: vault.restore(p.keyArgument || meta.focus),
        rationale: Array.isArray(p.rationale) ? p.rationale.map((r: string) => vault.restore(r)) : [meta.focus],
        metricsWatched: Array.isArray(p.metricsWatched) ? p.metricsWatched.map((m: string) => vault.restore(m)) : [],
        risksIdentified: Array.isArray(p.risksIdentified) ? p.risksIdentified.map((r: string) => vault.restore(r)) : [],
        suggestedConditions: Array.isArray(p.suggestedConditions) ? p.suggestedConditions.map((c: string) => vault.restore(c)) : [],
      };
    };

    return {
      decisionTitle: restoredTitle,
      problemStatement,
      perspectives: {
        cfo: assemblePerspective("cfo"),
        coo: assemblePerspective("coo"),
        cro: assemblePerspective("cro"),
        compliance: assemblePerspective("compliance"),
      },
      executiveVerdict: {
        consensusRecommendation: restoredVerdict || "Deliberation complete. Review individual C-suite assessments.",
        confidenceScore: Math.min(100, Math.max(10, Number(parsed.executiveVerdict?.confidenceScore) || 85)),
        primaryTradeoff: restoredTradeoff || "Balancing growth objectives against cash preservation.",
        actionPlan7Days: Array.isArray(parsed.executiveVerdict?.actionPlan7Days)
          ? parsed.executiveVerdict.actionPlan7Days.map((a: string) => vault.restore(a))
          : ["Day 1: Review council assessments", "Day 3: Approve proposed actions"],
        riskMitigations: Array.isArray(parsed.executiveVerdict?.riskMitigations)
          ? parsed.executiveVerdict.riskMitigations.map((m: string) => vault.restore(m))
          : ["Review commitments weekly"],
      },
      proposedActions: Array.isArray(parsed.proposedActions)
        ? parsed.proposedActions.map((act: any) => ({
            title: vault.restore(act.title || "Proposed Action"),
            kind: act.kind || "operational",
            details: vault.restore(act.details || ""),
          }))
        : [],
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[council] LLM call failed or threw; using validated fallback", err);
    return fallbackCouncil(problemStatement, context);
  }
}
