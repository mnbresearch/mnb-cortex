/*
  Tests for Autonomous Driver-Based FP&A & Variance Engine (Abacum & Drivetrain parity):
  - Model and driver schemas
  - AI FP&A mode & narrative mode pricing and margin safety
  - getFpaModel and saveFpaModel server actions
  - Analyst role enforcement
  - Database migration and RLS policies
*/

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name} — ${detail}`);
  }
};

console.log("\n=== Testing Autonomous FP&A & Driver-Based Forecasting (Abacum/Drivetrain Parity) ===\n");

// 1. Metering & Margins
console.log("1. Metering & Unit Economics Margins");
const config = read("src/lib/config.ts");
const pricing = read("src/lib/pricing-model.ts");
const gen = read("src/lib/ai/generation.ts");

check(/fpa_model:\s*14/.test(config), "fpa_model mode is priced at 14 credits in CREDIT_COSTS");
check(/fpa_narrative:\s*14/.test(config), "fpa_narrative mode is priced at 14 credits in CREDIT_COSTS");
check(/fpa_model:\s*"FAST"/.test(pricing), "fpa_model mapped to FAST profile in pricing-model.ts");
check(/fpa_narrative:\s*"FAST"/.test(pricing), "fpa_narrative mapped to FAST profile in pricing-model.ts");
check(/fpa_model:\s*FAST/.test(gen), "fpa_model mapped to FAST profile in generation.ts");
check(/fpa_narrative:\s*FAST/.test(gen), "fpa_narrative mapped to FAST profile in generation.ts");

// 2. Server Actions & Logic
console.log("\n2. Server Actions & Role Gates");
const actions = read("src/lib/actions.ts");
check(/export async function getFpaModel/.test(actions), "getFpaModel exported in actions.ts");
check(/export async function saveFpaModel/.test(actions), "saveFpaModel exported in actions.ts");
check(/requireRole\("analyst"\)[\s\S]*?saveFpaModel|saveFpaModel[\s\S]*?requireRole\("analyst"\)/.test(actions), "saveFpaModel requires analyst rank");

// 3. AI Prompts
console.log("\n3. AI Controllers & Prompts");
const cortex = read("src/lib/ai/cortex.ts");
check(/fpa_model:\s*`You are an autonomous FP&A Architect/.test(cortex), "fpa_model prompt defined in cortex.ts");
check(/fpa_narrative:\s*`You are an AI Chief Financial Analyst/.test(cortex), "fpa_narrative prompt defined in cortex.ts");

// 4. Migration & Schema
console.log("\n4. Database Migration & RLS");
const mig = read("supabase/migrations/2026_zzzz_o_fpa_forecasts.sql");
check(/create table if not exists fpa_models/.test(mig), "Migration creates fpa_models table");
check(/alter table fpa_models enable row level security/.test(mig), "fpa_models RLS enabled");
check(/create policy "members read fpa_models"/.test(mig), "fpa_models read policy defined");
check(/create policy "members write fpa_models"/.test(mig), "fpa_models write policy defined");

// 5. UI Cockpit
console.log("\n5. Navigation & UI Surfaces");
const forecast = read("src/app/(app)/forecast/page.tsx");
check(/AutonomousFpaCockpit/.test(forecast), "AutonomousFpaCockpit embedded on /forecast page");
const cockpit = read("src/components/autonomous-fpa-cockpit.tsx");
check(/Operational Drivers/.test(cockpit), "AutonomousFpaCockpit implements operational drivers");
check(/Budget vs Actuals/.test(cockpit), "AutonomousFpaCockpit implements budget vs actuals");
check(/AI Board Commentary/.test(cockpit), "AutonomousFpaCockpit implements AI board commentary");

console.log(`\nAutonomous FP&A Verification: ${pass} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  process.exit(1);
}
