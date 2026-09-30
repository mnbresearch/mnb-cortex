/**
 * Every number the marketing surface states must be derived, not written.
 *
 * ============================================================================
 * FOUR NUMBERS WERE WRONG AT THE SAME TIME
 * ============================================================================
 *
 *   "29 free calculators" / "and 25 more"   there are 28
 *   "19 statutory deadlines tracked"        there are 20
 *   "Annual (save ~20%)"                    every plan is 10-for-12 = 16%
 *   "Credential vault for 60+ other tools"  63 integrations, 4 sync, so 59
 *
 * None was a lie anyone told on purpose. Each was correct when it was typed
 * and then a constant moved underneath it. The calculator count is the
 * clearest case: the page BODY renders `{CALCULATORS.length}` and printed 28,
 * while the `<title>` three lines above it — the string Google indexes and a
 * stranger sees first — said 29. The product disagreed with itself on the
 * same screen for months.
 *
 * `test:claims` has 147 assertions and caught none of them, because its
 * SURFACES list did not include those files and because it checks for banned
 * PHRASES rather than for numbers that must equal something.
 *
 * ============================================================================
 * WHAT THIS ASSERTS
 * ============================================================================
 *
 * Two different things, and the distinction matters:
 *
 *  1. VALUES: the derived helpers actually compute what we think.
 *  2. SOURCE: the marketing files interpolate those helpers rather than
 *     carrying a literal. A number that happens to be right today but is
 *     typed by hand is exactly the state the four above were in.
 *
 * (2) is the one that prevents recurrence. (1) is what makes (2) worth having.
 */

import { readFileSync } from "node:fs";
import { CALCULATORS } from "../src/lib/nav.ts";
import { STATUTORY_CATALOGUE } from "../src/lib/statutory.ts";
import { INTEGRATIONS, SYNCED_INTEGRATION_IDS, vaultOnlyCount } from "../src/lib/integrations.ts";
import { PLANS, ANNUAL_SAVING_PCT } from "../src/lib/config.ts";
/*
  lib/sync carries `import "server-only"`, which is a Next-provided package
  that does not resolve under plain node — importing it here fails outright.
  Its connector list is therefore READ FROM SOURCE rather than executed. That
  is weaker than running it, and it is the right trade: the alternative is
  either no parity check at all, or stubbing `server-only` and pretending the
  module is portable when the whole point of that import is that it is not.
*/

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

/* ======================================================================== */
/* 1. THE VALUES                                                            */
/* ======================================================================== */

check(CALCULATORS.length > 0, "there are calculators", `${CALCULATORS.length}`);
check(STATUTORY_CATALOGUE.length > 0, "there are statutory rules", `${STATUTORY_CATALOGUE.length}`);

/* The annual saving must match every live plan, and must never overstate. */
for (const p of PLANS.filter((p) => p.monthly > 0 && p.annual > 0)) {
  const real = (1 - p.annual / 12 / p.monthly) * 100;
  check(ANNUAL_SAVING_PCT <= real + 1e-9,
    `the advertised annual saving never overstates ${p.id}`,
    `advertised ${ANNUAL_SAVING_PCT}%, real ${real.toFixed(2)}%`);
}
check(ANNUAL_SAVING_PCT > 0, "the annual saving is a real saving", `${ANNUAL_SAVING_PCT}%`);
check(ANNUAL_SAVING_PCT < 20,
  "and it is no longer the 20% that was advertised",
  `a 10-months-for-12 plan saves 2/12 = 16.7%, not 20% — if this now fails, prices changed and the copy should be re-read`);

/*
  SYNCED_INTEGRATION_IDS is written twice on purpose — once in
  lib/integrations.ts so public pages can count without importing a
  server-only module, once as CONNECTORS in lib/sync. Two copies of a fact is
  a bug unless something proves they agree. This is that something.
*/
const syncSrc = read("src/lib/sync/index.ts");
const connectorsLine = syncSrc.match(/export const CONNECTORS[^=]*=\s*\[([^\]]*)\]/);
check(!!connectorsLine, "lib/sync declares CONNECTORS as a literal array this check can read");
/*
  `CONNECTORS = [shopify, razorpay, stripe, googleSheets]` names variables,
  not ids. Each variable's own `id:` is what must match, so resolve them.
*/
const connectorIds = (connectorsLine ? connectorsLine[1].split(",") : [])
  .map((v) => v.trim()).filter(Boolean)
  .map((v) => {
    const decl = syncSrc.match(new RegExp(`const\\s+${v}\\s*:[^=]*=\\s*\\{[\\s\\S]{0,400}?id:\\s*["']([a-z0-9_]+)["']`))
      || syncSrc.match(new RegExp(`const\\s+${v}\\s*=\\s*\\{[\\s\\S]{0,400}?id:\\s*["']([a-z0-9_]+)["']`));
    return decl ? decl[1] : v;
  }).sort();
const declaredIds = [...SYNCED_INTEGRATION_IDS].sort();
check(JSON.stringify(connectorIds) === JSON.stringify(declaredIds),
  "SYNCED_INTEGRATION_IDS matches lib/sync's CONNECTORS exactly",
  `sync has [${connectorIds}], integrations declares [${declaredIds}]`);

const allIds = new Set(INTEGRATIONS.map((i) => i.id));
check(SYNCED_INTEGRATION_IDS.every((id) => allIds.has(id)),
  "every synced id is a real integration",
  `unknown: ${SYNCED_INTEGRATION_IDS.filter((id) => !allIds.has(id))}`);

check(vaultOnlyCount() === INTEGRATIONS.length - SYNCED_INTEGRATION_IDS.length,
  "vaultOnlyCount is total minus the live syncs",
  `${vaultOnlyCount()} vs ${INTEGRATIONS.length} - ${SYNCED_INTEGRATION_IDS.length}`);

/* ======================================================================== */
/* 2. THE SOURCE — no literal may stand in for a derived number             */
/* ======================================================================== */

const calcPage = read("src/app/(app)/calculators/page.tsx");
check(/CALCULATORS\.length/.test(calcPage), "the calculators page derives its count");
check(/\$\{N\b|\$\{CALCULATORS\.length/.test(calcPage),
  "and its <title>/description interpolate that count rather than a literal");
check(!/\b29 free calculators\b/.test(calcPage) && !/gratuity and 25 more/.test(calcPage),
  "the hand-written 29 / 25-more is gone",
  "these are the strings Google indexes; the page body said 28 at the same time");

const landing = read("src/app/page.tsx");
check(/to: STATUTORY_CATALOGUE\.length/.test(landing),
  "the landing stat derives the statutory count");
check(!/\{ to: 19,/.test(landing), "the hardcoded 19 is gone");

const pricing = read("src/components/pricing-client.tsx");
check(/ANNUAL_SAVING_PCT/.test(pricing), "the pricing toggle derives the annual saving");
check(!/save ~20%/.test(pricing), "the hardcoded ~20% is gone from pricing");

const billing = read("src/app/(app)/billing/page.tsx");
check(/ANNUAL_SAVING_PCT/.test(billing), "the billing page derives it too");
check(!/annual saves ~20%/.test(billing), "the hardcoded ~20% is gone from billing");

const features = read("src/app/features/page.tsx");
check(/vaultOnlyCount\(\)/.test(features), "the vault line derives its count");
check(!/60\+ other tools/.test(features), "the hardcoded 60+ is gone");
/*
  /features is a public marketing page. Reaching into lib/sync for the
  connector count would pull a `server-only` module — and with it the Supabase
  client and every provider adapter — into a static page's module graph. The
  boundary test would eventually catch it; catching it here says why.
*/
check(!/from "@\/lib\/sync/.test(features),
  "and does not reach into the server-only sync module to get it");

console.log(`\nderived counts: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  ${CALCULATORS.length} calculators, ${STATUTORY_CATALOGUE.length} statutory rules, ` +
    `${ANNUAL_SAVING_PCT}% annual saving, ${vaultOnlyCount()} vault-only of ${INTEGRATIONS.length} — every one derived.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
