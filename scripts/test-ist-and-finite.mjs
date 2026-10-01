/**
 * Two classes that both end the same way: a confident wrong number on screen.
 *
 * ============================================================================
 * PART ONE — THE SERVER IS IN UTC AND EVERY CUSTOMER IS IN INDIA
 * ============================================================================
 *
 * Vercel runs in UTC. IST is UTC+5:30, with no daylight saving. So for the
 * 5h30m after midnight IST — 18:30 to 23:59 UTC — the UTC calendar date is
 * YESTERDAY from the customer's point of view.
 *
 * The repo already knew this. statutory.ts has istToday/istDate/istISO with a
 * long comment explaining that `toISOString().slice(0,10)` is off by a day,
 * and 2026_zz_aggregate_ist_overdue.sql fixed the same thing in SQL. The fix
 * was applied to the deadline module and the aggregate, and then not
 * propagated. Eight places still measured dates in UTC:
 *
 *   advance tax      `nextInstalment` read getUTCFullYear/Month/Date, so at
 *                    02:00 IST on 16 June it said the 15 June instalment was
 *                    due "today" — it was due YESTERDAY, and s.234C interest
 *                    was already running. On 1 April before 05:30 it read
 *                    March, decided the FY had not started, and showed NO
 *                    next instalment at all.
 *
 *   43B(h) SQL       `current_date - p.dated` with the session in UTC. One day
 *                    short means `age_days > 45` is false on the morning a
 *                    bill actually crosses, so /msme reported ZERO exposure on
 *                    a disallowed deduction.
 *
 *   ageing ×4        `Math.round((Date.now() - dueUTCmidnight)/86_400_000)`
 *                    crosses the half-day mark at 12:00 UTC = 17:30 IST, so
 *                    from half past five an invoice due TODAY read as one day
 *                    past due. /receivables and the dashboard therefore
 *                    printed DIFFERENT overdue totals every evening, and the
 *                    same number went into a reminder EMAIL — overstating, to
 *                    a debtor, in our customer's name.
 *
 *   `today` ×2       `new Date().toISOString().slice(0,10)` in sendReminderAI
 *                    and workflows. Before 05:30 IST, yesterday's overdue
 *                    invoices were filtered out; if it was the only one, the
 *                    action answered "You have no overdue receivables right
 *                    now — nothing to chase." A false negative on the one
 *                    thing this product is for.
 *
 *   free check       `deadline < now` against a wall clock, so an invoice went
 *                    overdue at 05:30 IST on its own due date. This is the
 *                    public lead magnet — the first number a prospect sees —
 *                    and it disagreed with the product they then signed up to.
 *
 * ============================================================================
 * PART TWO — Infinity.toFixed(1) IS THE STRING "Infinity"
 * ============================================================================
 *
 * Four calculators computed a sentinel `Infinity` deliberately, guarded it at
 * one render site, and printed it raw at another:
 *
 *   saas-metrics     three stats guard `=== Infinity`; CAC payback did not,
 *                    in the stat AND in the text sent to the model. Clearing
 *                    ARPU printed "CAC payback Infinity mo".
 *   discount-impact  the Stat says "impossible"; the sentence below said
 *                    "sell Infinity% more units".
 *   roi-payback      the Stat says "never"; the sentence said "paying back in
 *                    Infinity months".
 *   cap-table        a zero pre-money divided to Infinity and then
 *                    Infinity/Infinity, printing "Investors NaN%".
 *
 * The pattern is identical in all four: whoever added the guard added it to
 * the number and not to the prose beside it. That is what this part pins.
 */

import { readFileSync, readdirSync } from "node:fs";
/*
  The real modules, executed — not read. Everything in section 1 runs the
  shipping code at the exact instants the bugs occurred; sections 2 and 3 read
  source, because "no file does X" is a claim about the whole tree and cannot
  be executed. Other suites already import these .ts files directly.
*/
import { istTodayISO, daysPastDueIST } from "../src/lib/statutory.ts";
import { nextInstalment as nextInstalmentProbe } from "../src/lib/advance-tax.ts";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const eq = (a, b, n) => check(a === b, n, a === b ? "" : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

/* ========================================================================= */
/* 1. THE HELPERS, EXERCISED AT THE EXACT BOUNDARY                           */
/* ========================================================================= */

/*
  18:30 UTC is 00:00 IST the NEXT day. These two instants are one millisecond
  apart and must give different IST dates; any UTC-based implementation gives
  the same one for both.
*/
eq(istTodayISO(new Date("2026-06-15T18:29:59.999Z")), "2026-06-15",
   "one ms before midnight IST is still the 15th");
eq(istTodayISO(new Date("2026-06-15T18:30:00.000Z")), "2026-06-16",
   "midnight IST rolls the date, though UTC is still the 15th");

/* The 17:30 IST rounding flip: an invoice due today must read 0 all day. */
for (const [utc, label] of [
  ["2026-06-16T00:00:00Z", "05:30 IST"],
  ["2026-06-16T11:59:00Z", "17:29 IST"],
  ["2026-06-16T12:00:00Z", "17:30 IST — where Math.round used to flip"],
  ["2026-06-16T18:29:00Z", "23:59 IST"],
]) {
  eq(daysPastDueIST("2026-06-16", new Date(utc)), 0,
     `an invoice due today is 0 days past due at ${label}`);
}
eq(daysPastDueIST("2026-06-15", new Date("2026-06-16T12:00:00Z")), 1, "yesterday is 1");
eq(daysPastDueIST("2026-06-17", new Date("2026-06-16T12:00:00Z")), -1,
   "tomorrow is NEGATIVE one — the sign carries 'not yet due'");
eq(daysPastDueIST(null, new Date()), 0, "no due date is 0, never NaN");
eq(daysPastDueIST("not a date", new Date()), 0, "an unparseable date is 0, never NaN");

/* The advance-tax window, at the instant it used to be wrong. */
{
  const at = (utc) => nextInstalmentProbe(new Date(utc), false);
  /* 02:00 IST on 16 June = 20:30 UTC on the 15th. */
  const dayAfter = at("2026-06-15T20:30:00Z");
  check(dayAfter && dayAfter.by === "15 Sep",
    "at 02:00 IST on 16 June the next instalment is September",
    `got ${dayAfter ? `${dayAfter.by} in ${dayAfter.daysAway}d` : "null"} — the UTC version said ` +
    `"15 Jun, today" for an instalment that was due yesterday and already accruing 234C interest`);

  /* 02:00 IST on 1 April = 20:30 UTC on 31 March — the new financial year. */
  const fyStart = at("2026-03-31T20:30:00Z");
  check(fyStart && fyStart.by === "15 Jun",
    "at 02:00 IST on 1 April the next instalment is June",
    `got ${fyStart ? fyStart.by : "null"} — the UTC version read March, decided the FY had not ` +
    `started, walked last year's dates and returned null, showing no instalment at all`);

  /* Mid-afternoon, where UTC and IST agree: must be unchanged. */
  const plain = at("2026-06-16T09:00:00Z");
  check(plain && plain.by === "15 Sep", "and the ordinary daytime case is unchanged");
}

/* ========================================================================= */
/* 2. NO SURFACE MEASURES A DATE IN UTC                                      */
/* ========================================================================= */

/*
  `new Date()` WITH NO ARGUMENT, specifically — "what is today". A bare
  `toISOString().slice(0,10)` on some OTHER date is not this bug, and my first
  version flagged two of them in metrics.ts that are correct: `monthStart()`
  and `monthKey()` build a month BUCKET key and are pinned to UTC on purpose,
  matched by `set timezone = 'UTC'` in 2026_zz_aggregate_ist_overdue.sql so the
  TS and SQL agree. Moving one side alone would make two screens disagree,
  which is worse than the skew they share.
*/
const UTC_TODAY = /new Date\(\)\.toISOString\(\)\.slice\(/;

/*
  Files that compare a date to "today" or age an invoice. `issue_date`
  defaults are excluded deliberately and handled separately below — a stamp is
  a different question from a comparison.
*/
for (const [f, what] of [
  ["src/lib/metrics.ts", "the dashboard's overdue total"],
  ["src/lib/workflows.ts", "the workflow email's overdue list"],
  ["src/app/(app)/receivables/page.tsx", "the receivables ageing buckets"],
  ["src/app/(app)/payables/page.tsx", "the DPO figure"],
  ["src/lib/ai/tools.ts", "days_past_due as handed to the model"],
  ["src/lib/collections/index.ts", "the first-reminder gate and the draft body"],
]) {
  const s = strip(read(f));
  /*
    The DIVISOR has to be one day. metrics.ts:494 rounds
    `(Date.now() - monthStart) / (30 * 86_400_000)` into months-ago, which is
    a different quantity with no 17:30 boundary — my first version flagged it
    and was wrong.
  */
  const rounded = [...s.matchAll(/Math\.round\(/g)].some((m) => {
    const win = s.slice(m.index, m.index + 160);
    /* `[^)]*` could not cross the nested parens in
       `Math.round((Date.now() - new Date(String(from)).getTime()) / 86_400_000)`,
       so the mutation restoring exactly that line SURVIVED the first version
       of this check. A window plus two substring tests cannot be defeated by
       nesting. The `30 *` exclusion keeps metrics.ts's months-ago rounding
       out of it, which is a different quantity with no 17:30 boundary. */
    return /Date\.now\(\)|\bnow\b/.test(win) && /86_?400_?000/.test(win) && !/30\s*\*/.test(win);
  });
  check(!rounded,
    `${f.replace("src/", "")} does not round a wall clock into days — ${what}`,
    "Math.round against a UTC-midnight date flips at 17:30 IST");
  check(!UTC_TODAY.test(s),
    `${f.replace("src/", "")} does not take "today" from toISOString`,
    "that is the UTC date, which is yesterday's for 5h30m after midnight IST");
}

/* sendReminderAI is in the big actions.ts, so check the function, not the file. */
{
  const s = strip(read("src/lib/actions.ts"));
  const fn = s.slice(s.indexOf("sendReminderAI"), s.indexOf("sendReminderAI") + 3000);
  check(/istTodayISO\(\)/.test(fn),
    "sendReminderAI compares against the IST date",
    "with the UTC date, an invoice that went overdue yesterday was filtered out and " +
    "the action answered 'nothing to chase'");
  check(/daysPastDueIST/.test(fn),
    "and the days figure in the reminder EMAIL is IST-exact",
    "this number is sent to our customer's customer, in our customer's name");
}

/* The 43B(h) window, in SQL. */
{
  const files = readdirSync(new URL("supabase/migrations/", ROOT)).filter((f) => /msme/i.test(f)).sort();
  const latest = files[files.length - 1];
  /*
    SQL comments stripped first. Without this the check below matched the old
    expression quoted in the new file's own header — the sixth time in this
    repo a guard has read an explanatory comment instead of the code, and the
    reason every other suite here strips before matching.
  */
  const sql = read(`supabase/migrations/${latest}`)
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
  check(/now\(\) at time zone 'Asia\/Kolkata'/.test(sql),
    `the live cortex_msme_exposure (${latest}) ages in IST`,
    "`current_date` resolves in the session timezone, which is UTC on Supabase — one day " +
    "short on the morning a bill crosses 45 days, reporting zero exposure on a " +
    "deduction that will be disallowed");
  check(!/\(current_date - p\.dated\)/.test(sql),
    "and no longer uses a bare current_date");
  /* The migration must actually be applied, not merely present. */
  check(read("supabase/migrations/ORDER.txt").includes(latest),
    `${latest} is listed in ORDER.txt`,
    "a migration that is not in ORDER.txt never runs");
}

/* The public lead magnet must agree with the product. */
{
  const s = strip(read("src/lib/free-check.ts"));
  check(/Asia\/Kolkata/.test(s) && /deadline < todayMs/.test(s),
    "the free ledger check marks overdue against the IST date",
    "`deadline < now` made an invoice overdue at 05:30 IST on its own due date — more " +
    "overdue than the product itself would then show the same prospect");
}

/* ========================================================================= */
/* 3. A SENTINEL Infinity IS NEVER PRINTED                                   */
/* ========================================================================= */

/*
  Find every `.toFixed(` applied to a value the same file elsewhere compares to
  Infinity. That cross-reference is the whole trick: it only flags components
  that ALREADY know the value can be infinite, which is exactly the four bugs
  and none of the dozens of ordinary toFixed calls.
*/
function tsx(dir, out = []) {
  for (const e of readdirSync(new URL(dir + "/", ROOT), { withFileTypes: true })) {
    if (e.isDirectory()) tsx(`${dir}/${e.name}`, out);
    else if (/\.tsx$/.test(e.name)) out.push(`${dir}/${e.name}`);
  }
  return out;
}

for (const f of tsx("src/components")) {
  const s = strip(read(f));
  const sentinels = new Set(
    [...s.matchAll(/([\w.]+)\s*===\s*Infinity/g)].map((m) => m[1]),
  );
  if (!sentinels.size) continue;

  for (const name of sentinels) {
    const esc = name.replace(/\./g, "\\.");
    /* Every place the value is formatted … */
    const uses = [...s.matchAll(new RegExp(`${esc}\\.toFixed\\(`, "g"))];
    /* … must sit on a line that also tests it. */
    for (const u of uses) {
      /*
        A WINDOW, not the line. A guard is routinely a ternary whose test sits
        on a previous line from the branch that formats — scenario-planner
        tests null, then Infinity, then calls toFixed three lines down, and it
        is entirely correct. Line-matching called both it and my own
        discount-impact fix defects.
      */
      const line = s.slice(Math.max(0, u.index - 400), u.index + 120);
      check(new RegExp(`${esc}\\s*===\\s*Infinity`).test(line),
        `${f.replace("src/components/", "")} guards ${name} wherever it prints it`,
        `...${line.trim().slice(-110)} — this file already treats ${name} as possibly ` +
        `Infinity elsewhere, and Infinity.toFixed() renders the literal text "Infinity"`);
    }
  }
}

/* cap-table's is an arithmetic fix, not a render guard, so it is named. */
{
  const s = strip(read("src/components/cap-table.tsx"));
  check(/r\.preMoney > 0 && totalShares > 0/.test(s),
    "cap-table refuses to divide by a zero pre-money",
    "0 pre-money gave pricePerShare 0 → newInvestorShares Infinity → totalShares Infinity → " +
    "investorPct Infinity/Infinity = NaN, printing 'Investors NaN%'");
  check(/pricePerShare > 0 \? r\.raise \/ pricePerShare : 0/.test(s),
    "and issues no shares rather than Infinity of them");
}

console.log(`\nIST + finite numbers: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log("  8 date surfaces measure in IST; no component prints a sentinel Infinity.");
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
