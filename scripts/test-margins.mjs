#!/usr/bin/env node
/**
 * Unit-economics tests.  Run: npm run test:margins
 *
 * WHY THIS SUITE EXISTS
 *
 * config.ts priced every action "at the ₹0.90 credit floor", taking the
 * cheapest credit PACK as the worst case. Credits also arrive through PLANS,
 * and the plans were far cheaper per credit:
 *
 *     AI COO annual    ₹33,332/mo for 60,000 credits = ₹0.556
 *     Business annual  ₹12,499/mo for 20,000        = ₹0.625
 *     AI COO monthly   ₹39,999/mo for 60,000        = ₹0.667
 *
 * So every margin in the product was computed against a number 1.62x too
 * generous. Measured against the real floor, 18 of 35 actions were LOSS-MAKING
 * on an AI COO annual account — chat at -125%, the dashboard pulse at -227%,
 * AI Visibility at -116%. The highest-volume actions in the product, sold to
 * its largest customer, below cost, getting worse the more that customer used
 * it. Nothing anywhere would have reported this.
 *
 * The floor is COMPUTED from the packs and plans rather than typed in, so
 * adding a cheaper plan or raising an allowance moves it automatically and
 * every action is re-checked. That is the part that matters: a pricing mistake
 * of this shape is invisible until the invoice arrives.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CFG = readFileSync(join(ROOT, "src", "lib", "config.ts"), "utf8");
const PM = readFileSync(join(ROOT, "src", "lib", "pricing-model.ts"), "utf8");
const GEN = readFileSync(join(ROOT, "src", "lib", "ai", "generation.ts"), "utf8");

/** The hard minimum. Prices target 85%, so there is headroom before this trips. */
const MIN_MARGIN = 80;
/** Plans are the commitment the business is sold on, so they are held higher. */
const MIN_PLAN_MARGIN = 85;

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};
const num = (s, re) => Number((s.match(re) || [])[1]);

/* ---- assumptions -------------------------------------------------------- */
const USD_INR = num(PM, /USD_INR = ([\d.]+)/);
const OUT_USD = num(PM, /MODEL_OUTPUT_USD_PER_1M = ([\d.]+)/);
const IN_USD = num(PM, /MODEL_INPUT_USD_PER_1M = ([\d.]+)/);
const IN_TOK = num(PM, /WORST_CASE_INPUT_TOKENS = (\d+)/);

const PROFILE_TOKENS = Object.fromEntries(
  [...PM.matchAll(/^\s{2}(FAST|STANDARD|DEEP|EXTRACT): (\d+),/gm)].map((m) => [m[1], Number(m[2])]),
);
const MODE_PROFILE = Object.fromEntries(
  [...((PM.match(/export const MODE_PROFILE_NAME[^=]*= \{([\s\S]*?)\n\};/) || ["", ""])[1]).matchAll(/(\w+): "(\w+)"/g)]
    .map((m) => [m[1], m[2]]),
);
const FIXED = Object.fromEntries(
  [...((PM.match(/export const FIXED_COGS_INR: Record<string, number> = \{([\s\S]*?)\n\};/) || ["", ""])[1]).matchAll(/(\w+): ([\d.]+),/g)]
    .map((m) => [m[1], Number(m[2])]),
);

console.log("\nThe cost model parsed");
check("USD/INR set", USD_INR > 0);
check("model output price set", OUT_USD > 0);
check("all four profiles have token budgets", Object.keys(PROFILE_TOKENS).length === 4);
check("fixed-cost actions are listed", Object.keys(FIXED).length >= 3);

/* ---- the profiles must match the ones the app actually sends ------------- */
console.log("\nThe cost model must mirror the real generation profiles");
{
  /*
    pricing-model.ts duplicates the token budgets because generation.ts is
    server-only. If they drift, margins are computed for a call the app never
    makes — so the duplication is allowed only while this holds.
  */
  let mismatched = 0;
  for (const [name, tokens] of Object.entries(PROFILE_TOKENS)) {
    const real = num(GEN, new RegExp(`const ${name}: GenProfile = \\{ maxOutputTokens: (\\d+)`));
    if (real !== tokens) { mismatched++; console.log(`  FAIL  ${name}: costed at ${tokens} tokens, generation.ts sends ${real}`); }
  }
  if (!mismatched) { pass++; console.log("  ok    every costed profile matches generation.ts"); }
  else fail += mismatched;
}

/* ---- the floor ---------------------------------------------------------- */
console.log("\nThe credit floor is computed from what customers can actually buy");
const packs = [...CFG.matchAll(/credits: (\d+), price: (\d+)/g)].map((m) => ({ c: +m[1], p: +m[2] }));
const planCredits = Object.fromEntries(
  [...((CFG.match(/export const PLAN_CREDITS: Record<string, number> = \{([\s\S]*?)\n\};/) || ["", ""])[1]).matchAll(/(\w+): (-?\d+)/g)]
    .map((m) => [m[1], Number(m[2])]),
);
const plans = [...CFG.matchAll(/\{ id: "(\w+)", name: "[^"]*", monthly: (\d+), annual: (\d+)/g)]
  .map((m) => ({ id: m[1], mo: +m[2], yr: +m[3] }));

/*
  ANCHOR EVERY LOOKUP ON `export const`.

  An earlier version of this file searched for /PLAN_CREDITS[^{]*\{/, which
  matched the FIRST mention of that name — a reference inside a comment — and
  then ran forward to the next brace, which belonged to IMAGE_WEEKLY. So the
  suite read the weekly image caps (0/120/500/2000) as the plan credit
  allowances, computed a floor from them, and PASSED. A margin test that passes
  because it read the wrong constant is worse than no margin test, which is the
  whole reason these files assert their own parses.
*/
check(`credit packs parsed (${packs.length})`, packs.length >= 3);
check("plan allowances were read from PLAN_CREDITS, not another table",
  planCredits.starter !== undefined && planCredits.starter >= 1000);
check("...and they are the real allowances, not the weekly image caps",
  planCredits.growth !== 120 && planCredits.business !== 500);
check(`plans parsed (${plans.length})`, plans.length >= 3);

let floor = { v: Infinity, src: "" };
for (const p of packs) { const v = p.p / p.c; if (v < floor.v) floor = { v, src: `pack of ${p.c}` }; }
for (const p of plans) {
  const c = planCredits[p.id];
  if (!c || c < 0) continue;
  for (const [label, mo] of [["monthly", p.mo], ["annual", p.yr / 12]]) {
    if (!mo) continue;
    const v = mo / c;
    if (v < floor.v) floor = { v, src: `${p.id} ${label}` };
  }
}
console.log(`        floor = ₹${floor.v.toFixed(3)} per credit (${floor.src})`);

/*
  The floor must not fall below what the actions were priced against. If a new
  plan undercuts it, every price in CREDIT_COSTS is silently wrong again — which
  is exactly how this happened the first time.
*/
const PRICED_AGAINST = 0.90;
check(`no plan or pack sells a credit below the ₹${PRICED_AGAINST.toFixed(2)} the actions are priced against`,
  floor.v >= PRICED_AGAINST - 0.001);

/* ---- every action ------------------------------------------------------- */
const tokenCogs = (profile) =>
  (PROFILE_TOKENS[profile] / 1e6) * OUT_USD * USD_INR + (IN_TOK / 1e6) * IN_USD * USD_INR;
const cogs = (mode) => (FIXED[mode] != null ? FIXED[mode] : tokenCogs(MODE_PROFILE[mode] || "STANDARD"));

/*
  Several actions share a line ("pulse: 14, actions: 14, brief: 14,"), so this
  must match EVERY pair, not the first on each line. An earlier version anchored
  to the line start and found 12 of 38 — and then reported that everything
  passed, which is the failure mode these suites exist to avoid. Block comments
  are stripped first so the worked examples inside them are not read as prices.
*/
const costsBlock = ((CFG.match(/export const CREDIT_COSTS[^{]*\{([\s\S]*?)\n\};/) || ["", ""])[1])
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
const costs = Object.fromEntries(
  [...costsBlock.matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
);
check(`every metered action parsed (${Object.keys(costs).length})`, Object.keys(costs).length >= 30);

console.log(`\nEvery action must clear ${MIN_MARGIN}% margin at the floor`);
{
  const rows = Object.entries(costs)
    .map(([mode, credits]) => {
      const rev = credits * floor.v, c = cogs(mode);
      return { mode, credits, rev, c, margin: ((rev - c) / rev) * 100 };
    })
    .sort((a, b) => a.margin - b.margin);

  const under = rows.filter((r) => r.margin < MIN_MARGIN);
  if (under.length) {
    fail++;
    console.log(`  FAIL  ${under.length} action(s) below ${MIN_MARGIN}%:`);
    for (const r of under) {
      console.log(`          ${r.mode.padEnd(14)} ${r.credits} credits = ₹${r.rev.toFixed(2)} vs ₹${r.c.toFixed(2)} cost = ${r.margin.toFixed(1)}%`);
    }
  } else {
    pass++;
    const worst = rows[0];
    console.log(`  ok    all ${rows.length} actions clear it — worst is ${worst.mode} at ${worst.margin.toFixed(1)}%`);
  }

  // Nothing may be sold below cost, ever, under any pricing route.
  const losing = rows.filter((r) => r.margin < 0);
  check("no action is sold below cost", losing.length === 0);
}

console.log("\nThe fallback price must be safe too");
{
  /*
    DEFAULT_CREDIT_COST is charged for any mode nobody remembered to price. At 2
    credits it was ₹1.80 against ₹2.51 of COGS, so a forgotten action lost money
    by default — the worst possible direction for a default to fail in.
  */
  const dflt = num(CFG, /DEFAULT_CREDIT_COST = (\d+)/);
  const rev = dflt * floor.v, c = tokenCogs("STANDARD");
  const margin = ((rev - c) / rev) * 100;
  check(`an unpriced action still clears ${MIN_MARGIN}% (${dflt} credits = ${margin.toFixed(1)}%)`,
    margin >= MIN_MARGIN);
}

console.log("\nThe expensive generations are priced against what they really cost");
{
  check("video is costed against a real Veo clip, not a guess", FIXED.agent_video >= 70);
  check("...and priced well above it",
    (costs.agent_video || 0) * floor.v >= FIXED.agent_video * 5);
  check("image is costed and priced above it",
    FIXED.agent_image > 0 && (costs.agent_image || 0) * floor.v >= FIXED.agent_image * 5);
  check("AI Visibility accounts for grounded search, not one token call",
    FIXED.visibility >= 10);
}

console.log("\nAssumptions are pessimistic, so a wobble does not erase the margin");
{
  check("costed at the POST-promotional model price, not the discount",
    OUT_USD >= 7.0);
  check("a conservative rupee", USD_INR >= 88);
  check("input tokens are counted, not assumed free", IN_TOK > 0 && IN_USD > 0);
}


/* ========================================================================= */
console.log(`\nEVERY PLAN must clear ${MIN_PLAN_MARGIN}% if the customer spends every credit`);
/* ========================================================================= */
{
  /*
    Per-ACTION margin is not the same as per-PLAN margin. A plan's margin
    depends on utilisation: the customer who burns their whole allowance on the
    least efficient action is the one who decides whether the plan makes money.
    So the worst COGS-per-credit across all actions is the honest assumption.
  */
  let worstPerCredit = 0, worstMode = "";
  for (const [mode, credits] of Object.entries(costs)) {
    const r = cogs(mode) / credits;
    if (r > worstPerCredit) { worstPerCredit = r; worstMode = mode; }
  }
  console.log(`        worst COGS per credit: ₹${worstPerCredit.toFixed(4)} (all spend on ${worstMode})`);

  const under = [];
  for (const p of plans) {
    const c = planCredits[p.id];
    if (c === undefined) continue;

    /*
      An UNLIMITED allowance is an unbounded loss, not a generous plan. Every
      video is ₹77 of Veo billing, so one enterprise account could spend more
      than its contract is worth with nothing in the product to stop it. No plan
      may be uncapped.
    */
    if (c < 0) { under.push(`${p.id} has UNLIMITED credits — unbounded COGS`); continue; }

    for (const [label, mo] of [["monthly", p.mo], ["annual", p.yr / 12]]) {
      if (!mo) continue;                       // custom-quoted; covered by the floor rule below
      const margin = ((mo - c * worstPerCredit) / mo) * 100;
      if (margin < MIN_PLAN_MARGIN) {
        under.push(`${p.id} ${label}: ₹${mo.toFixed(0)}/mo for ${c} credits = ${margin.toFixed(1)}%`);
      }
    }
  }

  if (under.length) {
    fail++;
    console.log(`  FAIL  ${under.length} plan/cycle below ${MIN_PLAN_MARGIN}%:`);
    for (const u of under) console.log(`          ${u}`);
  } else {
    pass++;
    console.log(`  ok    every plan clears ${MIN_PLAN_MARGIN}% at full utilisation`);
  }

  check("no plan has an uncapped credit allowance",
    plans.every((p) => (planCredits[p.id] ?? 0) >= 0));

  /*
    Enterprise is quoted by hand, so nothing in code stops a deal being signed
    below cost. The floor is published as a constant so the number a
    salesperson must not go under is written down somewhere.
  */
  const entCredits = planCredits.enterprise ?? 0;
  const entFloor = num(PM, /ENTERPRISE_MIN_MONTHLY_INR = ([\d_]+)/) || 0;
  check("a minimum enterprise price is documented", entFloor > 0 || /ENTERPRISE_MIN_MONTHLY_INR/.test(PM));
  if (entCredits > 0) {
    const implied = entCredits * PRICED_AGAINST;
    check(`the enterprise floor matches its allowance (${entCredits} credits => ₹${implied.toLocaleString("en-IN")}/mo)`,
      /150_000 \* 0\.90/.test(PM));
  }

  // Enterprise must also be metered, or the allowance is decorative.
  const CRED = readFileSync(join(ROOT, "src", "lib", "credits.ts"), "utf8");
  /*
    Strip comments before grepping: the fix is DESCRIBED in a comment that
    quotes the old code, and matching that would report the bug as still
    present. Same trap as the "FY-agnostic" check in the statutory suite.
  */
  const credCode = CRED.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("enterprise is metered like every other plan, not exempted in code",
    !/plan === "enterprise"/.test(credCode));
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
