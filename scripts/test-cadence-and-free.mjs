/**
 * Two promises the product makes about itself, held to the code.
 *
 * ============================================================================
 * 1. THE CADENCE
 * ============================================================================
 *
 * Six public surfaces say Cortex re-reads your numbers "every day". The
 * schedule is daily — `30 4 * * *` — so that is true of the SYSTEM. It stops
 * being true of any PARTICULAR workspace as the sweep's cap and rotation
 * start biting, which the features page admitted in a comment while its own
 * heading claimed something stronger still: "It runs the loop, continuously."
 *
 * A once-a-day cron is not continuous, at any scale. And a cadence promise
 * the customer cannot check is the same defect as a cash balance with no date
 * on it — correct when written, quietly wrong later, invisible until someone
 * notices their warning is four days stale.
 *
 * So: no "continuously", and /autopilot must print when THIS workspace was
 * last read.
 *
 * ============================================================================
 * 2. "FREE CALCULATORS"
 * ============================================================================
 *
 * The footer of every public page has a "Free tools" column. Those routes
 * live inside the (app) group, and PAYWALL_ALLOW did not list them — so they
 * were free to an anonymous visitor and locked the moment that visitor did
 * the thing the site was asking them to do. A funnel that punishes its own
 * conversion.
 *
 * They are allowed now. The matching rule is that a locked workspace gets the
 * CALCULATOR and not its own seeded figures: "free calculators" promises a
 * tool that computes from numbers you type, not that an unpaid workspace has
 * its receivables and payroll read back to it.
 */

import { readFileSync, existsSync } from "node:fs";
const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

/* ---- 1. cadence ---------------------------------------------------------- */

for (const f of ["src/app/features/page.tsx", "src/app/page.tsx", "src/app/investors/page.tsx"]) {
  const src = strip(read(f));
  check(!/\bcontinuous(ly)?\b/i.test(src),
    `${f} does not claim continuous operation`,
    "the loop is one cron at 04:30 UTC — daily, not continuous");
  check(!/\breal[- ]time\b/i.test(src),
    `${f} does not claim real-time`,
    "same reason");
}

/*
  RENDERED, not merely computed — and checked on stripped CODE.

  My first version asserted `/lastReadLabel/.test(auto)`. Deleting the <p>
  that displays it PASSED, because the const that computes the string is
  still declared three lines above. A value computed and thrown away is
  exactly the state this whole build keeps finding: the work is done, the
  customer never sees it. (recomputeMetrics had the same shape — the
  insights were derived and discarded until the import screen started
  showing them.)
*/
const autoCode = strip(read("src/app/(app)/autopilot/page.tsx"));
check(/getLastAnalysedAt/.test(autoCode), "/autopilot reads when this workspace was last analysed");
check(/\{lastReadLabel\}/.test(autoCode), "and renders it into the page",
  "computing it without displaying it leaves the claim uncheckable");

const la = read("src/lib/last-analysed.ts");
check(/from\("health_metrics"\)/.test(la),
  "the last-read date comes from this org's own metrics",
  "system_status records that the CRON ran — a sweep that rotated past this workspace would report success while their numbers went unread");
check(/\.eq\("org_id", orgId\)/.test(la), "and is org-scoped");
check(/return null/.test(la), "and returns null rather than inventing a read on failure");

/* ---- 2. free tools ------------------------------------------------------- */

const chrome = read("src/components/public-chrome.tsx");
const paywall = read("src/lib/paywall.ts");
const freeLinks = [...chrome.matchAll(/\["([^"]+)",\s*"(\/[a-z-]+)[^"]*"\]/g)]
  .filter(([, label]) => /^free /i.test(label) || /calculator/i.test(label));

check(freeLinks.length > 0, "the public footer advertises free tools", `${freeLinks.length} found`);
/*
  ONLY ROUTES INSIDE THE (app) GROUP CAN BE PAYWALLED AT ALL.

  My first pass demanded a PAYWALL_ALLOW entry for /health-check, which
  lives at src/app/health-check and is therefore public to everyone,
  signed in or not. Adding it to a list that governs a route group it is
  not in would be cargo-cult: no behaviour change, and a future reader
  left to work out why a public page appears in the paywall's allow-list.

  So the requirement applies to exactly the routes it can apply to.
*/
for (const [, label, route] of freeLinks) {
  const inApp = existsSync(new URL(`src/app/(app)${route}/page.tsx`, ROOT));
  if (!inApp) {
    check(true, `"${label}" (${route}) is a public route — no paywall to escape`);
    continue;
  }
  check(paywall.includes(`"${route}"`),
    `"${label}" (${route}) is reachable by a signed-up unpaid user`,
    `advertised as free on every public page but missing from PAYWALL_ALLOW — free right up until someone signs up`);
}

/*
  Same lesson, second instance in one file: `/locked/` matched the block
  comment explaining the rule, so deleting the line that enforces it passed.
  Stripped, and matched against the actual early return.
*/
const seedCode = strip(read("src/lib/workspace-seed.ts"));
check(/locked\s*\)\s*return EMPTY_SEED/.test(seedCode),
  "a locked workspace gets the calculator, not its own figures",
  "letting /calculators through the paywall must not hand an unpaid workspace its own receivables and payroll");

console.log(`\ncadence and free tools: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  no continuous/real-time claim; /autopilot proves the cadence; ${freeLinks.length} advertised-free routes are actually free.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
