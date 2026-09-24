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

/* ========================================================================= */
/*  EVERY CHARGED MODE MUST BE PRICED EXPLICITLY                            */
/* ========================================================================= */
/*
  creditCost() falls back to DEFAULT_CREDIT_COST for a mode it does not know,
  so an unpriced mode bills a plausible number and nobody notices. Three did:
  `benchmark`, `pricing` and `risk` were passed to AIPanel, reached
  chargeForMode, and charged 19 credits each without ever appearing in
  CREDIT_COSTS.

  The charge was right. The COVERAGE was not — scripts/test-margins.mjs reads
  that table to prove every price clears its cost of goods, and a row that does
  not exist cannot be checked. Three priced, customer-facing actions had never
  had their margin verified, and the config file's instruction to "run
  test:margins" could not have caught it.

  So: every `mode="..."` that appears in the app must be a key in CREDIT_COSTS.
  A new AI surface is now priced deliberately or it fails here.
*/
{
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");

  const cfg = readFileSync(join(root, "src/lib/config.ts"), "utf8");
  const block = (cfg.match(/export const CREDIT_COSTS[^{]*\{([\s\S]*?)\n\};/) || ["", ""])[1];
  const priced = new Set([...block.matchAll(/(\w+)\s*:\s*\d+/g)].map((m) => m[1]));

  const walk = (d, out = []) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  };

  const used = new Set();
  for (const f of walk(join(root, "src"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bmode=["']([a-z_]+)["']/g)) used.add(m[1]);
  }

  console.log("\nEvery AI mode the app uses is priced in CREDIT_COSTS:");
  check(`modes found in the UI (${used.size})`, used.size >= 15);
  const unpriced = [...used].filter((m) => !priced.has(m)).sort();
  check("no mode falls through to DEFAULT_CREDIT_COST", unpriced.length === 0,
    `${unpriced.join(", ")} — add each to CREDIT_COSTS with a deliberate price, `
    + `then run npm run test:margins so the margin is actually verified`);
}

/* ========================================================================= */
/*  NO PRICE IS TYPED BY HAND IN THE UI                                      */
/* ========================================================================= */
/*
  Four labels quoted a credit price that was not the price charged:

    deep-dive.tsx          said 12   charged 24
    deepdive/page.tsx      said 12   charged 24
    gst-return.tsx         said  8   charged 45
    bank-statement.tsx     said  8   charged 45

  visibility.tsx had the identical defect (said 10, charged 89), was fixed, and
  carries a comment saying "quoting a price and charging another is not a copy
  problem". It recurred in four more places anyway, because the fix was to
  correct the literal rather than to remove it.

  A number typed beside a button drifts the moment the number it describes
  moves, and CREDIT_COSTS has been repriced twice. lib/config.ts is
  deliberately client-safe so `creditCost(mode)` can be called from a client
  component — there is no reason for a literal to exist.
*/
{
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join, dirname, relative } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");

  const walk = (d, out = []) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (p.endsWith(".tsx")) out.push(p);
    }
    return out;
  };

  console.log("\nNo credit price is hardcoded in the UI:");
  const offenders = [];
  for (const f of [...walk(join(root, "src/app")), ...walk(join(root, "src/components"))]) {
    const live = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    /* A currency-prefixed number is a PRICE IN RUPEES, not a credit count —
       "₹149 credit pack" is the ₹149 pack, and matching it was a false
       positive on the first run of this guard. */
    for (const m of live.matchAll(/(?<![₹$\d])\b(\d+)\s+credits?\b/g)) {
      offenders.push(`${relative(root, f)}: "${m[0]}"`);
    }
  }
  check("every price in the UI comes from creditCost()", offenders.length === 0,
    offenders.join("; ") + " — call creditCost(mode) instead; lib/config.ts is client-safe");
}

console.log(`\nai metering: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  FAIL " + f)); process.exit(1); }
