#!/usr/bin/env node
/**
 * Every AI call is metered.  Run: npm run test:ai-metering
 *
 * WHY THIS SUITE EXISTS
 *
 * lib/credits.ts describes chargeForMode() as "the single choke point" and says
 * "Every AI path goes through this function". That was documentation, not a
 * property — and three paths did not:
 *
 *   lib/workflows.ts        an `ai` step, run on demand, repeatable
 *   lib/scheduled-reports.ts a model call on a timer
 *   actions.ts runAutopilot  a "Run now" button
 *
 * None of them debited a credit, wrote a ledger row, checked the plan, or
 * consulted the paywall. An expired — or deliberately SUSPENDED — workspace
 * could press Run on a workflow of repeated `ai` steps indefinitely, on our
 * model bill, leaving no trace anywhere that it had happened.
 *
 * The shape of the bug is what makes it worth a test rather than a fix: the
 * choke point was correct, and the leak was a call site that never reached it.
 * No unit test of chargeForMode can find that. Only an assertion over every
 * call site can, so this walks the source and requires each one to either
 * charge or be named here with a reason.
 *
 * ADDING A FILE TO EXEMPT IS A DELIBERATE ACT. If you find yourself doing it,
 * the question to answer first is "who pays for this call?"
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

let pass = 0; const fails = [];
const check = (label, cond, why = "") => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fails.push(`${label}${why ? `\n        ${why}` : ""}`); console.log(`  FAIL  ${label}`); }
};

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/*
  The exemptions, each with the reason it is safe. A file named here is NOT
  unmetered by accident.
*/
const EXEMPT = new Map([
  ["src/lib/ai/cortex.ts",
   "defines generateFor — it is the callee, not a call site"],
  ["src/app/api/cron/autopilot/route.ts",
   "the nightly pulse, filtered by entitled() so only a live plan receives it; " +
   "a daily sweep is what the plan buys, and it is not user-triggerable"],
]);

const files = walk(SRC);
const callers = files
  .filter((f) => /\bgenerateFor\s*\(/.test(stripComments(readFileSync(f, "utf8"))))
  .map((f) => relative(ROOT, f).replace(/\\/g, "/"));

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

console.log("\nEvery generateFor() call site charges, or is exempt for a stated reason");
check(`call sites found (${callers.length})`, callers.length >= 4);

for (const rel of callers) {
  if (EXEMPT.has(rel)) { pass++; console.log(`  ok    ${rel} — exempt: ${EXEMPT.get(rel)}`); continue; }
  const live = stripComments(readFileSync(join(ROOT, rel), "utf8"));
  const charges = /\bchargeForMode\s*\(|\bchargeOrgForMode\s*\(/.test(live);
  check(`${rel} charges before calling the model`, charges,
    "add chargeForMode (session) or chargeOrgForMode (unattended), or add the file " +
    "to EXEMPT in this test with the reason it costs nobody anything");
}

/* The choke point must keep both halves. A refactor that drops the
   session-free one sends every unattended path back around the outside. */
{
  const credits = stripComments(readFileSync(join(ROOT, "src/lib/credits.ts"), "utf8"));
  console.log("\nThe choke point still has both entry points");
  check("chargeForMode (session) is exported", /export async function chargeForMode/.test(credits));
  check("chargeOrgForMode (unattended) is exported", /export async function chargeOrgForMode/.test(credits));
  check("...and the session one delegates rather than duplicating the rules",
    /return chargeOrgForMode\(/.test(credits),
    "two implementations of pooling, hard-stop and the BYO waiver will diverge");
}

console.log(`\nai metering: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  FAIL " + f)); process.exit(1); }
