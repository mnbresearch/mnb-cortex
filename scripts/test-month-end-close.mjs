/*
  Tests for Month-End Close & Financial Reconciliation Engine:
  - Continuous close checklist structure and default items
  - AI close audit mode & variance mode pricing and margin safety
  - getMonthEndCloseStatus, updateMonthEndChecklistItem, setMonthEndCloseStatus
  - Security gates (RLS and role ranks: Analyst to update, Manager to close)
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

console.log("\n=== Testing Autonomous Month-End Close & Variance Engine ===\n");

// 1. Metering & Margins
console.log("1. Metering & Unit Economics Margins");
const config = read("src/lib/config.ts");
const pricing = read("src/lib/pricing-model.ts");
const gen = read("src/lib/ai/generation.ts");

check(/close_audit:\s*14/.test(config), "close_audit mode is priced at 14 credits in CREDIT_COSTS");
check(/variance:\s*14/.test(config), "variance mode is priced at 14 credits in CREDIT_COSTS");
check(/close_audit:\s*"FAST"/.test(pricing), "close_audit mapped to FAST profile in pricing-model.ts");
check(/variance:\s*"FAST"/.test(pricing), "variance mapped to FAST profile in pricing-model.ts");
check(/close_audit:\s*FAST/.test(gen), "close_audit mapped to FAST profile in generation.ts");
check(/variance:\s*FAST/.test(gen), "variance mapped to FAST profile in generation.ts");

// 2. Server Actions & Logic
console.log("\n2. Server Actions & Role Gates");
const actions = read("src/lib/actions.ts");
check(/export async function getMonthEndCloseStatus/.test(actions), "getMonthEndCloseStatus exported in actions.ts");
check(/export async function updateMonthEndChecklistItem/.test(actions), "updateMonthEndChecklistItem exported in actions.ts");
check(/export async function setMonthEndCloseStatus/.test(actions), "setMonthEndCloseStatus exported in actions.ts");
check(/requireRole\("analyst"\)[\s\S]*?updateMonthEndChecklistItem|updateMonthEndChecklistItem[\s\S]*?requireRole\("analyst"\)/.test(actions), "updateMonthEndChecklistItem requires analyst rank");
check(/requireRole\("manager"\)[\s\S]*?setMonthEndCloseStatus|setMonthEndCloseStatus[\s\S]*?requireRole\("manager"\)/.test(actions), "setMonthEndCloseStatus requires manager rank");

// 3. AI Prompts
console.log("\n3. AI Controllers & Prompts");
const cortex = read("src/lib/ai/cortex.ts");
check(/close_audit:\s*`You are an autonomous senior financial controller/.test(cortex), "close_audit prompt defined in cortex.ts");
check(/variance:\s*`You are an AI financial variance and anomaly detection engine/.test(cortex), "variance prompt defined in cortex.ts");

// 4. Migration & Schema
console.log("\n4. Database Migration & RLS");
const mig = read("supabase/migrations/2026_zzzz_n_close_checklists.sql");
check(/create table if not exists close_checklists/.test(mig), "Migration creates close_checklists table");
check(/alter table close_checklists enable row level security/.test(mig), "close_checklists RLS enabled");
check(/create policy "members read close_checklists"/.test(mig), "close_checklists read policy defined");
check(/create policy "members write close_checklists"/.test(mig), "close_checklists write policy defined");

// 5. Navigation & UI Surfaces
console.log("\n5. Navigation & UI Surfaces");
const nav = read("src/lib/nav.ts");
check(/href:\s*"\/close"/.test(nav), "/close route registered in nav.ts");
const atlas = read("src/lib/feature-atlas.ts");
check(/route:\s*"\/close"/.test(atlas), "/close registered in feature-atlas.ts");
const compare = read("src/app/compare/page.tsx");
check(/Autonomous month-end close & variance audit/.test(compare), "Autonomous close featured on /compare page");

console.log(`\nMonth-End Close Verification: ${pass} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  process.exit(1);
}
