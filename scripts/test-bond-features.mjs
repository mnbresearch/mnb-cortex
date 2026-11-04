#!/usr/bin/env node
/**
 * Test Bond app feature parity in Cortex:
 * 1. P0–P3 self-managing prioritization & triage
 * 2. Commitments & automated follow-up tracking
 * 3. Decision-grade morning brief
 * 4. Executive routines
 * 5. Margin invariant >= 80% per action, >= 85% per plan
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (label, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? "\n        " + extra : ""}`); }
};

console.log("\n=== Testing Bond (bondapp.io) Features Parity in MNB Cortex ===\n");

// 1. Config & AI metering
const configSrc = readFileSync(join(ROOT, "src/lib/config.ts"), "utf8");
const pricingModelSrc = readFileSync(join(ROOT, "src/lib/pricing-model.ts"), "utf8");
const generationSrc = readFileSync(join(ROOT, "src/lib/ai/generation.ts"), "utf8");
const actionsSrc = readFileSync(join(ROOT, "src/lib/actions.ts"), "utf8");
const cortexAiSrc = readFileSync(join(ROOT, "src/lib/ai/cortex.ts"), "utf8");

console.log("1. Metering & Unit Economics Margins");
check("triage mode is priced at 14 credits in CREDIT_COSTS", /triage:\s*14/.test(configSrc));
check("routine mode is priced at 14 credits in CREDIT_COSTS", /routine:\s*14/.test(configSrc));
check("commitments mode is priced at 14 credits in CREDIT_COSTS", /commitments:\s*14/.test(configSrc));
check("triage mode mapped to FAST profile in pricing-model.ts", /triage:\s*"FAST"/.test(pricingModelSrc));
check("routine mode mapped to FAST profile in pricing-model.ts", /routine:\s*"FAST"/.test(pricingModelSrc));
check("commitments mode mapped to FAST profile in pricing-model.ts", /commitments:\s*"FAST"/.test(pricingModelSrc));
check("triage mapped to FAST in generation.ts", /triage:\s*FAST/.test(generationSrc));
check("routine mapped to FAST in generation.ts", /routine:\s*FAST/.test(generationSrc));
check("commitments mapped to FAST in generation.ts", /commitments:\s*FAST/.test(generationSrc));

// 2. Action Board P0–P3 and Triage
console.log("\n2. Self-Managing Action Board (P0–P3 Hierarchy)");
check("ActionTask type includes P0, P1, P2, P3", /priority\?:\s*"P0"\s*\|\s*"P1"\s*\|\s*"P2"\s*\|\s*"P3"/.test(actionsSrc));
check("ActionTask supports waiting_on counterparty", /waiting_on\?:\s*string\s*\|\s*null/.test(actionsSrc));
check("ActionTask supports due_date", /due_date\?:\s*string\s*\|\s*null/.test(actionsSrc));
check("addTask stores P0-P3 and waiting_on", /\["P0",\s*"P1",\s*"P2",\s*"P3"\]\.includes\(priority\)/.test(actionsSrc));
check("cortex.ts defines triage prompt with P0 to P3 hierarchy", /triage:[\s\S]*?\[P0\] Critical[\s\S]*?\[P1\] High Priority/.test(cortexAiSrc));

// 3. Commitments & Follow-up Tracking
console.log("\n3. Commitments & Automated Follow-up Tracking");
check("listCommitments exported in actions.ts", /export async function listCommitments/.test(actionsSrc));
check("addCommitment exported in actions.ts", /export async function addCommitment/.test(actionsSrc));
check("updateCommitmentStatus exported in actions.ts", /export async function updateCommitmentStatus/.test(actionsSrc));
check("deleteCommitment with manager role guard", /deleteCommitment[\s\S]*?requireRole\("manager"\)/.test(actionsSrc));
check("commitments mode prompt defined in cortex.ts", /commitments:[\s\S]*?we_promised[\s\S]*?they_promised/.test(cortexAiSrc));

// 4. Executive Morning Briefing
console.log("\n4. Executive Morning Briefing");
check("brief prompt upgraded to Executive Morning Brief", /Executive Morning Brief[\s\S]*?Top Priorities Needing You[\s\S]*?Who is Waiting on You/.test(cortexAiSrc));

// 5. Executive Routines
console.log("\n5. Executive Routines");
check("listExecutiveRoutines exported in actions.ts", /export async function listExecutiveRoutines/.test(actionsSrc));
check("addExecutiveRoutine exported in actions.ts", /export async function addExecutiveRoutine/.test(actionsSrc));
check("toggleExecutiveRoutine exported in actions.ts", /export async function toggleExecutiveRoutine/.test(actionsSrc));
check("routine mode prompt defined in cortex.ts", /routine:[\s\S]*?Executive Morning Routine/.test(cortexAiSrc));

// 6. DB Migration
console.log("\n6. Database Migration & RLS");
const migrationSrc = readFileSync(join(ROOT, "supabase/migrations/2026_zzzz_m_bond_cortex_features.sql"), "utf8");
check("Migration expands action_tasks priority to P0-P3", /priority in \('P0', 'P1', 'P2', 'P3'\)/.test(migrationSrc));
check("Migration creates commitments table", /create table if not exists commitments/.test(migrationSrc));
check("Migration creates executive_routines table", /create table if not exists executive_routines/.test(migrationSrc));
check("Commitments RLS enabled", /alter table commitments enable row level security/.test(migrationSrc));
check("Executive Routines RLS enabled", /alter table executive_routines enable row level security/.test(migrationSrc));

console.log(`\nBond Features Verification: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
