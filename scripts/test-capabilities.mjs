/**
 * Plan capabilities, and the two tokens that were guessable.
 *
 * PART ONE — CAPABILITIES.
 *
 * Most of what the upper plans sell is AI work, and that is metered by
 * PLAN_CREDITS, so the money is protected whatever the UI allows. The bullets
 * checked here are the other kind: capabilities that cost us nothing per use
 * and were therefore gated by nothing at all. "Public API + outbound webhooks"
 * is a Watch Pro bullet at ₹14,999 and a ₹4,999 Watch workspace could issue
 * API keys.
 *
 * The asymmetry that shapes these assertions: letting a cheap workspace through
 * costs revenue, refusing a PAYING one costs the customer. So the retired tiers
 * are pinned as generously as they were sold — a workspace still on `business`
 * bought Memory and must not lose it because we renamed the plans.
 *
 * PART TWO — TOKEN ENTROPY.
 *
 * Two secrets were generated with Math.random():
 *
 *   - API keys, which authenticate full read access to a workspace's finances.
 *   - Report-link tokens, which are the ONLY thing protecting a public URL that
 *     renders a workspace's revenue and customer list with no login at all.
 *
 * Math.random is a fast non-cryptographic PRNG. Its internal state is
 * recoverable from a small number of outputs, so anyone who could generate two
 * tokens of their own could derive other tenants' — one customer reading
 * another customer's finances over the open internet. Neither is allowed to go
 * back to Math.random, which is what the second half of this file enforces.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}\n      ${d}`));

/* Import the REAL config so this cannot drift from what ships. */
const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "caps-"));
try {
  execFileSync(join(root, "node_modules", ".bin", "tsc"),
    ["src/lib/config.ts", "--outDir", out, "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler"],
    { cwd: root, stdio: "pipe" });
} catch (e) {
  console.error("Could not compile src/lib/config.ts\n" + (e.stdout || e).toString().slice(0, 800));
  process.exit(1);
}
const { planIncludes, lowestPlanWith, PLANS } = await import(pathToFileURL(join(out, "config.js")).href);

/* ------------------------------------------------- the matrix itself */

check(planIncludes("watchpro", "api"), "Watch Pro includes the public API");
check(!planIncludes("watch", "api"),
  "Watch does NOT include the public API",
  "it is a Watch Pro bullet at ₹14,999 and Watch is ₹4,999");
check(!planIncludes("watch", "webhooks"), "Watch does not include outbound webhooks");
check(planIncludes("command", "whitelabel"), "Command includes white-label");
check(!planIncludes("watchpro", "whitelabel"),
  "Watch Pro does not — white-label is a Practice and Command bullet",
  "check src/lib/config.ts PLANS if this is wrong");
check(planIncludes("practice", "whitelabel"), "Practice includes white-label");
check(planIncludes("enterprise", "api"), "Enterprise includes everything above it");

/* Unknown and empty plans get nothing, but only creation is ever gated. */
for (const bad of ["", null, undefined, "nonsense", "PRACTICE_TYPO"]) {
  check(!planIncludes(bad, "api"),
    `an unrecognised plan (${JSON.stringify(bad)}) gets no capabilities`,
    "the default must be the lowest entitlement, never the highest");
}

/* Case-insensitive: the plan column is free text and has held 'Practice'. */
check(planIncludes("WatchPro", "api") && planIncludes("PRACTICE", "whitelabel"),
  "plan ids are matched case-insensitively",
  "the organizations.plan column is free text and a capitalised value must not silently downgrade a paying customer");

/* ---------------------------------- retired tiers keep what they bought */

for (const [plan, cap] of [
  ["business", "memory"], ["business", "api"],
  ["growth", "api"], ["growth", "workflows"],
  ["aicoo", "whitelabel"], ["aicoo", "memory"],
]) {
  check(planIncludes(plan, cap),
    `retired plan "${plan}" keeps "${cap}"`,
    "these workspaces paid for it; removing it here silently downgrades a paying customer");
}
check(!planIncludes("starter", "api"),
  "…but Starter, which never included the API, still does not");

/* The upgrade prompt must name a plan that actually has the capability. */
for (const cap of ["api", "webhooks", "whitelabel", "workflows", "memory"]) {
  const name = lowestPlanWith(cap);
  const plan = PLANS.find((p) => p.name === name);
  check(plan && planIncludes(plan.id, cap),
    `lowestPlanWith("${cap}") names a plan that includes it — got "${name}"`,
    "an upgrade prompt pointing at a plan without the feature is worse than no prompt");
}

/* --------------------------------------------- tokens must be CSPRNG */

const ACTIONS = readFileSync(join(root, "src/lib/actions.ts"), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const CODE = strip(ACTIONS);

const body = (fn) => {
  const i = CODE.indexOf(`export async function ${fn}`);
  return i < 0 ? "" : CODE.slice(i, i + 900);
};

for (const [fn, what, why] of [
  ["generateApiKey", "an API key",
   "it authenticates full read access to a workspace's financial data"],
  ["createReportLink", "a public report token",
   "it is the ONLY thing protecting a no-login URL showing revenue and customers"],
]) {
  const b = body(fn);
  check(b.length > 0, `parse: found ${fn}`);
  check(b && !/Math\.random/.test(b),
    `${fn} does not use Math.random for ${what}`,
    `${why}; Math.random's state is recoverable from a few outputs, so the values are derivable`);
  check(b && /randomUUID|randomBytes/.test(b),
    `${fn} uses the platform CSPRNG`,
    "crypto.randomUUID or crypto.randomBytes");
}

/* Entitlement is checked at CREATION, and the message says existing keys live. */
const keyBody = body("generateApiKey");
check(/planIncludes\(plan, "api"\)/.test(keyBody),
  "generateApiKey checks the plan",
  "this was the revenue leak: any plan could issue keys");
check(/existing keys keep working/i.test(ACTIONS),
  "…and the refusal tells the customer their existing keys still work",
  "cutting off a running integration to enforce a price is how you lose a customer");

console.log(`\ncapabilities: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  Capabilities gated at creation, retired tiers held harmless, secrets from the CSPRNG.");
