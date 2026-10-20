/**
 * Test suite for Autonomous Multi-Agent Executive Council Chamber (src/lib/ai/council.ts).
 */

import {
  fallbackCouncil,
  PERSONA_METADATA,
} from "../src/lib/ai/council.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing Autonomous Multi-Agent Executive Council ===");

// 1. Persona Metadata Completeness
{
  const personas = ["cfo", "coo", "cro", "compliance"];
  for (const p of personas) {
    const meta = PERSONA_METADATA[p];
    check(Boolean(meta), `metadata exists for persona: ${p}`);
    check(Boolean(meta.name && meta.role && meta.focus), `metadata has name, role, focus for: ${p}`);
  }
}

// 2. Fallback Council on Receivables / Cash Statement
{
  const result = fallbackCouncil("Customer ABC owes ₹25L past 60 days. Should we offer 3% discount or halt dispatch?");
  check(Boolean(result.decisionTitle), "decisionTitle is populated");
  check(Boolean(result.problemStatement), "problemStatement preserved");

  const { perspectives, executiveVerdict, proposedActions } = result;

  // Verify all 4 personas are present
  check(Boolean(perspectives.cfo), "CFO perspective present");
  check(Boolean(perspectives.coo), "COO perspective present");
  check(Boolean(perspectives.cro), "CRO perspective present");
  check(Boolean(perspectives.compliance), "Compliance perspective present");

  // Verify persona fields
  for (const [key, p] of Object.entries(perspectives)) {
    check(["strongly_support", "support_with_conditions", "oppose", "neutral"].includes(p.verdict), `${key} verdict is valid`);
    check(p.keyArgument.length > 10, `${key} has substantive key argument`);
    check(p.rationale.length >= 2, `${key} provides multiple rationale points`);
    check(p.metricsWatched.length >= 2, `${key} names watched metrics`);
    check(p.risksIdentified.length >= 1, `${key} identifies risks`);
    check(p.suggestedConditions.length >= 1, `${key} suggests guardrail conditions`);
  }

  // Verify executive verdict
  check(executiveVerdict.consensusRecommendation.length > 30, "consensus recommendation is detailed");
  check(executiveVerdict.confidenceScore >= 0 && executiveVerdict.confidenceScore <= 100, "confidence score in 0-100 range");
  check(executiveVerdict.primaryTradeoff.length > 10, "primary tradeoff is clearly articulated");
  check(executiveVerdict.actionPlan7Days.length >= 3, "action plan has multiple daily checkpoints");
  check(executiveVerdict.riskMitigations.length >= 1, "risk mitigations included");

  // Verify proposed actions
  check(proposedActions.length >= 1, "proposed actions generated for Approvals ledger");
  for (const act of proposedActions) {
    check(Boolean(act.title && act.kind && act.details), "action has title, kind, and details");
  }
}

// 3. Fallback Council on Inventory Statement
{
  const result = fallbackCouncil("Should we stockpile ₹50L of raw cotton before the monsoon price surge?");
  check(result.perspectives.coo.metricsWatched.some((m) => /inventory|turnover|fulfillment/i.test(m)), "COO monitors inventory metrics for supply chain questions");
  check(result.perspectives.compliance.rationale.some((r) => /MSME|43B\(h\)|TDS/i.test(r)), "Compliance monitors MSME 43B(h) and TDS for large purchase commitments");
}

console.log(`\ncouncil: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("  ✓ Autonomous Executive Council engine verified (all assertions pass).");
  process.exit(0);
}
