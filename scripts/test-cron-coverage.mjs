/*
  THE COVERAGE VERDICT, EXECUTED.

  This suite exists because the rule it tests decides whether the status page
  goes yellow, and the thing it is watching for — the nightly sweep quietly
  covering less of the platform as the platform grows — is by construction
  something nobody notices. A silent watchdog for a silent failure is worth
  nothing, so the watchdog gets tested harder than the feature.

  Every assertion here was mutation-checked: the rule was deliberately broken in
  the ways it could plausibly be broken (> becomes >=, a floor removed, a lane
  swapped for the other) and each mutation had to turn at least one of these
  red. Two survivors are documented at the bottom rather than papered over.

  Run: npm run test:cron-coverage
*/
import {
  nightsForFullCycle,
  coverageVerdict,
  parseCoverage,
  BUDGET_FLOOR_MS,
  COVERAGE_KEY,
} from "../src/lib/cron-coverage.ts";

let pass = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) { pass++; return; }
  fails.push(`${name}${extra ? " — " + extra : ""}`);
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const lane = (total, done, cap) => ({ total, done, cap });
const cov = (o = {}) => ({
  at: "2026-09-13T04:30:00.000Z",
  metrics_sweep: lane(10, 10, 200),
  daily_analysis: lane(4, 4, 20),
  budget_left_ms: 120_000,
  ...o,
});

/* ─────────────────────────────────── nightsForFullCycle ─────────────────── */

eq("empty platform completes in one night", nightsForFullCycle(lane(0, 0, 200)), 1);
eq("everyone swept in one night", nightsForFullCycle(lane(200, 200, 200)), 1);
eq("one workspace over the cap takes two", nightsForFullCycle(lane(201, 200, 200)), 2);
eq("exactly two caps takes two", nightsForFullCycle(lane(400, 200, 200)), 2);
eq("two caps plus one takes three", nightsForFullCycle(lane(401, 200, 200)), 3);

/*
  THE MEASURED-THROUGHPUT CASE, which is the reason this function does not just
  divide by the cap. A run that was offered 200 and finished 50 — because the
  shared time budget ran out — is covering the platform four times slower than
  the cap suggests. The optimistic ceil(total/cap) would say 1 night here, and
  be wrong by a factor of four in the reassuring direction.
*/
eq("throughput is measured, not assumed", nightsForFullCycle(lane(200, 50, 200)), 4);
ok("a truncated run reports worse than the cap implies",
  nightsForFullCycle(lane(200, 50, 200)) > Math.ceil(200 / 200));

/*
  Zero progress with work outstanding is not "one night" and not a large
  number — it is never. Returning a number here would let it be compared,
  formatted and reported as though the sweep were merely slow.
*/
eq("no progress with work outstanding is null", nightsForFullCycle(lane(200, 0, 200)), null);
eq("no progress and no work is still one", nightsForFullCycle(lane(0, 0, 0)), 1);

/* Defensive: the record comes from JSON written by another process. */
eq("negative total is treated as none", nightsForFullCycle(lane(-5, 0, 200)), 1);
eq("negative done cannot manufacture progress", nightsForFullCycle(lane(10, -3, 200)), null);
eq("a fractional done is floored", nightsForFullCycle(lane(12, 3.9, 200)), 4);
/*
  This pair has to be chosen so the two floors are distinguishable. 10.9/5
  rounds up to 3 nights unfloored and 2 floored; the obvious 10.9/3.9 case
  gives 4 either way, so it proves nothing about `total` — which is how the
  first version of this test passed while the floor on `total` was removable.
*/
eq("a fractional total is floored too", nightsForFullCycle(lane(10.9, 5, 200)), 2);
eq("missing fields do not throw", nightsForFullCycle({}), 1);

/* ─────────────────────────────────────── coverageVerdict ────────────────── */

/*
  ABSENT COVERAGE IS NOT A FAULT.

  A deploy that predates this feature, and the hours between deploying and the
  first nightly run, both produce no coverage row. Painting the status page
  yellow for a condition that clears itself on the next cron run is how a check
  earns the right to be ignored. The real failure — the cron not running at
  all — is caught by the heartbeat-age branch that calls this one.
*/
eq("no coverage is not a degradation", coverageVerdict(null).status, "operational");
ok("no coverage says so plainly", coverageVerdict(null).detail.includes("not yet reported"));
eq("undefined behaves as null", coverageVerdict(undefined).status, "operational");

eq("full nightly coverage is operational", coverageVerdict(cov()).status, "operational");
ok("full coverage states the scale", coverageVerdict(cov()).detail.includes("10 workspaces"));

/*
  THE CENTRAL CASE. 201 workspaces against a 200 cap: the cron is running
  perfectly, every log line is green, and half the platform now waits two nights
  for a warning that is sold as daily.
*/
const twoNights = cov({ metrics_sweep: lane(201, 200, 200) });
eq("sweep taking two nights degrades", coverageVerdict(twoNights).status, "degraded");
ok("and says how many nights", coverageVerdict(twoNights).detail.includes("every 2 nights"));
ok("and says at what scale", coverageVerdict(twoNights).detail.includes("201 workspaces"));
ok("and says the nightly rate", coverageVerdict(twoNights).detail.includes("200/night"));

eq("sweep at exactly the cap does not degrade",
  coverageVerdict(cov({ metrics_sweep: lane(200, 200, 200) })).status, "operational");

eq("a sweep that covered nobody degrades",
  coverageVerdict(cov({ metrics_sweep: lane(50, 0, 200) })).status, "degraded");
ok("and does not call that 'every N nights'",
  !coverageVerdict(cov({ metrics_sweep: lane(50, 0, 200) })).detail.includes("nights"));
ok("it names the zero",
  coverageVerdict(cov({ metrics_sweep: lane(50, 0, 200) })).detail.includes("0 of 50"));

/*
  THE ANALYSIS LANE MUST NOT DEGRADE ON ITS OWN.

  The LLM narrative caps at 20 a night, so it rotates from the twenty-first
  ENTITLED workspace — i.e. from the twenty-first paying customer. Wiring that
  to `degraded` means the status page turns yellow on a good day and stays
  yellow for ever, which trains the operator to stop looking at the colour. It
  is reported in the detail instead, at every scale.
*/
const analysisRotating = cov({ daily_analysis: lane(60, 20, 20) });
eq("AI commentary rotating does not degrade", coverageVerdict(analysisRotating).status, "operational");
ok("but it is still reported", coverageVerdict(analysisRotating).detail.includes("AI commentary every 3 nights"));

const bothBehind = cov({ metrics_sweep: lane(600, 200, 200), daily_analysis: lane(60, 20, 20) });
eq("sweep behind and commentary behind is degraded", coverageVerdict(bothBehind).status, "degraded");
ok("both facts are reported", coverageVerdict(bothBehind).detail.includes("3 nights")
  && coverageVerdict(bothBehind).detail.includes("AI commentary"));

eq("commentary reaching nobody is reported but not fatal",
  coverageVerdict(cov({ daily_analysis: lane(30, 0, 20) })).status, "operational");
ok("and named",
  coverageVerdict(cov({ daily_analysis: lane(30, 0, 20) })).detail.includes("0 of 30"));

/* ── the budget floor ─────────────────────────────────────────────────────── */

/*
  A run that finishes with nothing to spare has been truncating its tail for a
  while. It is stated separately from the sweep reason because the REMEDY
  differs: a sweep behind its cap says "raise the cap", a run out of budget says
  "you cannot — split the schedule".
*/
eq("a run with room to spare is fine",
  coverageVerdict(cov({ budget_left_ms: BUDGET_FLOOR_MS + 1 })).status, "operational");
eq("a run scraping its budget degrades",
  coverageVerdict(cov({ budget_left_ms: BUDGET_FLOOR_MS - 1 })).status, "degraded");
eq("exactly at the floor is not yet a fault",
  coverageVerdict(cov({ budget_left_ms: BUDGET_FLOOR_MS })).status, "operational");
ok("the budget reason is in seconds a human reads",
  coverageVerdict(cov({ budget_left_ms: 4_000 })).detail.includes("4s"));
ok("a budget overrun never prints a negative",
  !coverageVerdict(cov({ budget_left_ms: -8_000 })).detail.includes("-"));

/*
  The budget floor must be independent of coverage: a run can finish every
  workspace and still be out of time, and that is the last warning before it
  stops finishing them.
*/
const tightButComplete = cov({ metrics_sweep: lane(10, 10, 200), budget_left_ms: 1_000 });
eq("full coverage does not excuse an exhausted budget", coverageVerdict(tightButComplete).status, "degraded");

/* ─────────────────────────────────────────── parseCoverage ──────────────── */

const wire = JSON.stringify({
  at: "2026-09-13T04:30:00.000Z",
  metrics_sweep: { total: 201, done: 200, cap: 200 },
  daily_analysis: { total: 4, done: 4, cap: 20 },
  budget_left_ms: 90_000,
});
eq("a real record round-trips", parseCoverage(wire)?.metrics_sweep.total, 201);
eq("and reaches the verdict", coverageVerdict(parseCoverage(wire)).status, "degraded");

/*
  Anything unreadable is ABSENT, never an exception. This value is read by the
  status page; a malformed row must not be able to take down the page whose job
  is to tell you the system is fine.
*/
for (const bad of [null, undefined, "", "   ", "not json", "[]", "null", "42", '"a string"', 123, {}]) {
  eq(`unreadable input is absent: ${JSON.stringify(bad)}`, parseCoverage(bad), null);
}
eq("a record missing a lane is absent", parseCoverage(JSON.stringify({ at: "x", metrics_sweep: {} })), null);
eq("non-numeric counts become zero",
  parseCoverage(JSON.stringify({ metrics_sweep: { total: "abc" }, daily_analysis: {} }))?.metrics_sweep.total, 0);
ok("a garbled record does not degrade the page",
  coverageVerdict(parseCoverage("not json")).status === "operational");

/* ────────────────────────────── the key is shared, not retyped ──────────── */

/*
  The cron writes this key and the health check reads it. If either side
  hardcoded the string, a rename would leave the writer and reader silently
  disagreeing — and the symptom would be "coverage not yet reported" for ever,
  which this module deliberately treats as harmless. So the constant is the
  contract, and both sides must import it.
*/
eq("the key is stable", COVERAGE_KEY, "cron_coverage");

import { readFileSync } from "node:fs";
const cron = readFileSync(new URL("../src/app/api/cron/autopilot/route.ts", import.meta.url), "utf8");
const health = readFileSync(new URL("../src/lib/health.ts", import.meta.url), "utf8");

ok("the cron imports the shared key rather than retyping it",
  /import\s*\{[^}]*COVERAGE_KEY[^}]*\}\s*from\s*"@\/lib\/cron-coverage"/.test(cron));
ok("the health check imports it too",
  /import\s*\{[^}]*COVERAGE_KEY[^}]*\}\s*from\s*"@\/lib\/cron-coverage"/.test(health));
ok("neither side hardcodes the literal key",
  !cron.includes('"cron_coverage"') && !health.includes('"cron_coverage"'));
ok("the cron actually writes the coverage row",
  cron.includes("key: COVERAGE_KEY"));
ok("the health check actually reads it",
  health.includes("coverageVerdict(parseCoverage("));

/*
  THE BUG THIS CHANGE ALSO FIXED, pinned so it cannot come back.

  `this_run` reported `sweep.batch.length` — the slice the rotation offered —
  while the loop breaks early on the time budget. The single number whose job
  was to describe coverage honestly was reporting the plan instead of the work.
  `swept` is the count the rotation cursor is committed against, so it is the
  only figure consistent with what the next run will pick up.
*/
ok("coverage reports what was swept, not what was offered",
  /this_run:\s*swept/.test(cron), "this_run must come from `swept`");
ok("the coverage record persisted uses the swept count too",
  /done:\s*swept/.test(cron));
ok("the rotation cursor and the report use the same number",
  /sweep\.commit\(swept\)/.test(cron));

/* ──────────────────────────────────────────────────────── report ────────── */

console.log(`\ncron coverage: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("✓ all green");

/*
  MUTATION LOG — every mutation below was applied to src/lib/cron-coverage.ts,
  this suite was run, and the mutation was reverted.

    M1  `sweepNights > 1`          → `>= 1`      caught, 6 assertions
    M2  `sweepNights > 1`          → `> 2`       caught, 4
    M3  `sweepNights === null` branch disabled   caught, 2
    M4  analysis pushed into `reasons`           caught, 1
    M5a `reasons.length ? …`       → always ok   caught
    M5b `reasons.length` → `all.length`          caught
    M5c `notes` dropped from the detail string   caught
    M6  `budget_left_ms < FLOOR`   → `<=`        caught, 1
    M7  `Math.max(0, …)` on seconds removed      caught, 1
    M8  `done > 0 ? done : 0`      → `: cap`     caught, 5
    M9  `Math.floor` on `total` removed          caught, 1 — SEE BELOW
    M10 absent coverage returns degraded         caught, 3

  M9 SURVIVED THE FIRST VERSION OF THIS SUITE, and that is the useful part.

  The floor test was written as nightsForFullCycle(10.9, 3.9) === 4, which
  passes with or without the floor on `total` — ceil(10.9/3) and ceil(10/3) are
  both 4. The assertion looked like it covered both floors and covered one. It
  was replaced with (10.9, 5): 2 nights floored, 3 unfloored. A test that cannot
  fail is worse than no test, because it is counted.

  A REJECTED MUTATION, recorded so the log is not overstated: moving the sweep
  reason into `notes` was originally logged as caught, but the edit pushes to
  `notes` before its `const` is initialised, so node threw a ReferenceError
  rather than any assertion failing. A crash is not evidence the assertions
  bite. M5a/M5b/M5c above are the realistic forms of that same mutation, and
  they are caught properly.

  SURVIVORS, stated rather than hidden:

    S1  `Math.max(1, Math.ceil(…))` → `Math.ceil(…)`. Survives, confirmed by
        running it. Both `throughput > 0` and `total > 0` are guaranteed by the
        branches above, so ceil() cannot return less than 1 and the max() is
        unreachable. It is defence against a future edit, not against current
        behaviour; a test for it would be asserting on dead code.

    S2  `parseCoverage` dropping the `at` field. Survives because nothing reads
        `at` yet. It is written and parsed so a later check can ask whether the
        coverage figure is itself stale relative to the heartbeat — the obvious
        next question — without another migration. Recorded so the gap is known
        rather than discovered.
*/
