/*
  The nightly cron must fit inside its function, at any number of workspaces.

  WHY THIS EXISTS

  The autopilot cron is one Vercel function with a 300-second ceiling running
  thirteen steps in sequence. Every step used to enforce only its own cap,
  chosen as though it were the only thing running. Summed with realistic
  latencies the run breached 300s at roughly TWENTY paying workspaces — and two
  steps could breach it alone: 200 webhook retries at an 8s timeout is 1,600s,
  and 200 collections sweeps at up to 17s is 3,400s.

  What made that severe rather than merely slow: several steps CLAIM their work
  before doing it (renewal_notices, alerts.notified_at, weekly_plan_sends,
  collection_policies.last_swept_at). Vercel kills the function rather than
  unwinding it, so those claims stay committed and the emails are never sent. A
  timeout did not postpone the work, it destroyed it.

  These are static and arithmetic checks. They cannot prove wall-clock
  behaviour on Vercel, and they do not pretend to. What they lock in is that
  every unbounded loop consults the shared clock, that the shares add up to
  something that fits, and that the sum stays inside the function limit.
*/
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); }
}

/** Comments and string literals removed, so prose cannot satisfy a check. */
function strip(src) {
  let out = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}

/*
  Comments removed, STRING LITERALS KEPT.

  strip() blanks every string, which is right for structural checks and fatal
  for any assertion that names a table or a status. Three checks below failed on
  their first run for exactly that reason — they searched the stripped source
  for "email_optouts", which strip() had already turned into "". The code was
  correct; the test could not see it. Same trap as test-credit-refunds.mjs.
*/
function stripComments(src) {
  let out = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c, start = i; i++;
      while (i < n) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      out += src.slice(start, i); continue;
    }
    out += c; i++;
  }
  return out;
}

const budgetSrc = strip(readFileSync("src/lib/cron-budget.ts", "utf8"));
const cronSrc = strip(readFileSync("src/app/api/cron/autopilot/route.ts", "utf8"));

/* ------------------------------------------------- the budget's own contract */

check("createBudget exists", /export function createBudget/.test(budgetSrc));

check(
  "ok() takes an expected cost, not just 'is there time left'",
  /ok:\s*\(costMs\s*=\s*0\)/.test(budgetSrc),
  "asking only whether time remains lets a loop start an 8s iteration with 1s left — which is how a claim commits and the send never happens",
);

check(
  "a reserve is held back for the heartbeat and the response",
  /RESERVE_MS/.test(budgetSrc),
  "a budget that reaches zero exactly at the function limit cannot record that it ran, so a healthy night looks like a dead cron",
);

check(
  "slice() cannot borrow from the steps behind it",
  /Math\.min\(limit,/.test(budgetSrc),
  "a sub-budget must clamp to the parent's remaining time, or a hot step starves everything after it",
);

/* ------------------------------------------------------ the shares must fit */

const SHARE = {};
for (const m of budgetSrc.matchAll(/(\w+):\s*([\d_]+),/g)) {
  const v = Number(m[2].replace(/_/g, ""));
  if (v >= 1000) SHARE[m[1]] = v;
}
const shareTotal = Object.values(SHARE).reduce((a, b) => a + b, 0);

check("every step declares a share", Object.keys(SHARE).length >= 10,
  `found ${Object.keys(SHARE).length} shares, expected 11`);

/*
  The shares are CEILINGS, not reservations — a step that finishes early hands
  the rest back, and slice() clamps to real remaining time. So the sum is
  allowed to exceed 300s: what must hold is that no single step can consume the
  whole function, and that the two worst offenders are individually bounded
  well inside it.
*/
check(
  "no single step may claim more than a third of the function",
  Object.entries(SHARE).every(([, v]) => v <= 100_000),
  `largest share is ${Math.max(...Object.values(SHARE)) / 1000}s`,
);

check(
  "webhook retries are bounded far below their old 1,600s worst case",
  (SHARE.webhooks || Infinity) <= 30_000,
  `webhooks share is ${(SHARE.webhooks || 0) / 1000}s; 200 retries x 8s timeout was 1,600s`,
);

check(
  "collections is bounded below its old 3,400s worst case",
  (SHARE.collections || Infinity) <= 60_000,
  `collections share is ${(SHARE.collections || 0) / 1000}s`,
);

/*
  THE SHARES MUST FIT. THIS TEST USED TO SAY THEY NEED NOT, AND WAS WRONG.

  The comment above still stands on its own terms — shares are ceilings, a step
  that finishes early hands the rest back, and slice() clamps to real remaining
  time — and this file previously concluded from that: "the sum is allowed to
  exceed 300s". It did exceed it: the declared shares summed to 345s against
  288s available. Nothing crashed, so the check below (finite, under 1,000s)
  passed happily for the entire time.

  What clamping actually buys is that the run never OVERRUNS. It does not buy
  that every step gets its share. Over-subscribing by 20% means the overdraft is
  paid, in full, by whichever steps happen to run last — and the order in
  cron-budget.ts is not incidental, it is the whole design: cheap must-never-skip
  work first, tolerant AI work last. So the arithmetic error did not distribute
  the shortfall evenly. It took the entire shortfall out of daily analysis,
  which sits last behind an ok(9_000) guard, and quietly turned "twenty
  workspaces analysed" into "two" on any night the earlier steps were busy.

  "Deferred by design" and "starved by an arithmetic slip" look identical from
  outside. Asserting the sum is what tells them apart, and cron-budget.ts now
  throws at import for the same reason — a number that is only wrong at 4am in
  production is a number nobody checks.
*/
const AVAILABLE_MS = 300_000 - 12_000; // maxDuration − RESERVE_MS
check(
  "the declared shares fit inside the function, with the reserve intact",
  shareTotal <= AVAILABLE_MS,
  `shares total ${shareTotal / 1000}s but only ${AVAILABLE_MS / 1000}s is available — the excess is taken silently from whichever steps run last`,
);

/* And the module refuses to load at all if that stops being true, so the
   failure lands in the build rather than in one bad night. */
check(
  "cron-budget.ts asserts its own total at import time",
  /SHARE_TOTAL_MS\s*>\s*CRON_LIMIT_MS\s*-\s*RESERVE_MS/.test(budgetSrc) && /throw new Error/.test(budgetSrc),
  "without this the next share added re-creates the overdraft and no test needs to be updated for it to pass",
);

check(
  "the declared shares are a finite, stated total rather than an unbounded sum",
  shareTotal > 0 && shareTotal < 1_000_000,
  `total ${shareTotal / 1000}s`,
);

/* ------------------------------------- every unbounded loop consults the clock */

check("the cron creates exactly one budget, at the top",
  (cronSrc.match(/createBudget\(/g) || []).length === 1);

check("the budget is created from the declared maxDuration",
  /createBudget\(300_000\)/.test(cronSrc) && /maxDuration = 300/.test(cronSrc),
  "the clock and the function limit must be the same number",
);

for (const step of ["renewals", "reports", "workflows", "collections", "alerts", "webhooks", "sync", "weeklyPlan", "sweep", "analysis"]) {
  check(
    `the ${step} step is given a slice of the shared clock`,
    new RegExp(`SHARE\\.${step}\\b`).test(cronSrc),
    `SHARE.${step} is never referenced, so that step still runs unbounded`,
  );
}

/*
  THE ANCHOR BUG, asserted directly.

  The analysis loop's guard was `const deadline = Date.now() + 200_000`,
  evaluated at that line rather than at function start. If the twelve steps
  above had already spent 250s, it permitted running until t=450s — 150s past
  the kill. The one deadline guard in the whole cron could not fire in the
  situation it existed for.
*/
check(
  "no deadline is re-anchored partway through the run",
  !/const\s+deadline\s*=\s*Date\.now\(\)\s*\+/.test(cronSrc),
  "found `Date.now() + N` used as a deadline; it must come from the budget created at the top",
);

/* ----------------------------------- the library loops honour what they are given */

const LOOPS = [
  ["src/lib/webhooks.ts", "retryPending"],
  ["src/lib/alert-delivery.ts", "deliverAlerts"],
  ["src/lib/scheduled-reports.ts", "runScheduledReports"],
  ["src/lib/workflow-schedule.ts", "runScheduledWorkflows"],
  ["src/lib/renewal-email.ts", "sendRenewalReminders"],
  ["src/lib/sync/index.ts", "syncAll"],
];
for (const [file, fn] of LOOPS) {
  const src = strip(readFileSync(file, "utf8"));
  check(`${fn} accepts a budget`, /budget\?:\s*Budget/.test(src),
    "no optional Budget parameter — the cron cannot bound this step");
  check(`${fn} checks the budget inside its loop`, /budget\s*&&\s*!budget\.ok\(/.test(src),
    "accepts a budget but never asks it, which is worse than not accepting one");
}

// plan-email uses opts.budget rather than a positional parameter.
const planSrc = strip(readFileSync("src/lib/plan-email.ts", "utf8"));
check("sendWeeklyPlans honours the shared clock as well as its own",
  /opts\?\.budget\s*&&\s*!opts\.budget\.ok\(/.test(planSrc),
  "it had a local BUDGET_MS but no knowledge of the run's remaining time");

/* ------------------------------- a dead cron must fail the health check loudly */

const healthSrc = stripComments(readFileSync("src/lib/health.ts", "utf8"));
const at48 = healthSrc.indexOf("hours > 48");
check(
  "a cron dead for 48h is critical, so /api/health returns a failing status",
  at48 >= 0 && /critical:\s*true/.test(healthSrc.slice(at48, at48 + 220)),
  "checkCron detected the outage but was not critical, so criticalDown stayed false, the endpoint answered 200, and any uptime monitor keyed on the status code stayed green through the whole thing",
);

/* ------------------------------------ suppression lists must never be sampled */

for (const f of ["src/lib/weekly-update.ts", "src/lib/plan-email.ts"]) {
  const src = stripComments(readFileSync(f, "utf8"));
  const optout = src.slice(src.indexOf("email_optouts"), src.indexOf("email_optouts") + 200);
  check(
    `${f}: the opt-out list is explicitly bounded`,
    /\.limit\(/.test(optout),
    "an unbounded select is capped at db-max-rows (1000 by default) — every address past that receives the next send",
  );
}

check(
  "the cron's organizations read is explicitly bounded",
  /\.limit\(20_000\)/.test(cronSrc),
  "unbounded meant PostgREST returned the 1,000 oldest workspaces and the rotation cursor could never reach number 1,001",
);

/* ------------------------------------------------------------------- report */
console.log(`\ncron budget: ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log(`  Shares total ${shareTotal / 1000}s of ceilings inside a 300s function; every loop consults one clock.`);
