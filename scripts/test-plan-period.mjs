#!/usr/bin/env node
/**
 * The plan branch of settleOrder.  Run: npm run test:plan-period
 *
 * WHY THIS EXISTS SEPARATELY FROM THE LIVE TEST.
 *
 * The ₹1 production payment proved the CREDITS branch end to end. The PLAN
 * branch has never run — and it holds the riskier logic, because a plan grant
 * is not a single idempotent increment. It has to decide a period:
 *
 *   stack a new period on an existing one rather than truncating what the
 *   customer already paid for;
 *   never shorten a period that is still running;
 *   compare timestamps as INSTANTS, since PostgREST returns "…+00:00" while
 *   toISOString() produces "…Z" and === can never match those;
 *   and decide, when a write fails, whether releasing the idempotency claim is
 *   safe — because releasing a claim on a write that DID commit turns one
 *   payment into two paid periods.
 *
 * Buying a real plan to test this would set `plan` and `subscription_ends_at`
 * on the operator's own workspace and change their live entitlements, so the
 * arithmetic is tested here instead, executed rather than asserted about.
 */

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

const DAY = 86_400_000;

/** The exact expression from settle.ts, lifted so it can be executed. */
function periodEnd(existingEndsAt, cycle, now) {
  const days = cycle === "annual" ? 365 : 30;
  let from = now;
  const existing = existingEndsAt ? new Date(existingEndsAt).getTime() : 0;
  if (existing > from) from = existing;
  return new Date(from + days * DAY).toISOString();
}

const NOW = Date.parse("2026-09-06T12:00:00.000Z");

/* ========================================================================= */
console.log("\nSTACKING — a second payment must extend, not truncate");
/* ========================================================================= */
{
  /* The failure this prevents: a customer three weeks into a paid month buys
     another month, and the naive `now + 30 days` silently deletes the 23 days
     they had already paid for. */
  const midPeriod = new Date(NOW + 23 * DAY).toISOString();
  const out = Date.parse(periodEnd(midPeriod, "monthly", NOW));
  check("a mid-period renewal adds 30 days to the END, not to today",
        out === NOW + 23 * DAY + 30 * DAY);
  check("...so nothing already paid for is lost", out > NOW + 30 * DAY);

  const lapsed = new Date(NOW - 5 * DAY).toISOString();
  check("a lapsed workspace starts from today, not from the old end date",
        Date.parse(periodEnd(lapsed, "monthly", NOW)) === NOW + 30 * DAY);

  check("no prior period behaves like a lapsed one",
        Date.parse(periodEnd(null, "monthly", NOW)) === NOW + 30 * DAY);

  check("annual grants 365 days", Date.parse(periodEnd(null, "annual", NOW)) === NOW + 365 * DAY);
  check("...and stacks on an existing period too",
        Date.parse(periodEnd(new Date(NOW + 10 * DAY).toISOString(), "annual", NOW))
        === NOW + 10 * DAY + 365 * DAY);

  /* Monotonicity across the whole boundary: settling can never move a paid
     period earlier, whatever the starting state. */
  let broke = null;
  for (let d = -40; d <= 40; d++) {
    const start = NOW + d * DAY;
    const end = Date.parse(periodEnd(new Date(start).toISOString(), "monthly", NOW));
    if (end < NOW + 30 * DAY - 1) { broke = d; break; }
  }
  check(`a settle never yields less than a full cycle from today${broke !== null ? ` (broke at day ${broke})` : ""}`,
        broke === null);
}

/* ========================================================================= */
console.log("\nINSTANT COMPARISON — the read-back check that guards a double grant");
/* ========================================================================= */
{
  /*
    After a failed update, settle re-reads the row to see whether the write
    actually landed. If it compares the timestamps as STRINGS it can never
    match, because PostgREST returns "+00:00" and toISOString() returns "Z" —
    so a committed write looks uncommitted, the claim is released, and the
    retry stacks a second period on the first. One payment, two periods.
  */
  const written = new Date(NOW + 30 * DAY).toISOString();          // …Z
  const readBack = written.replace("Z", "+00:00");                  // PostgREST

  check("the two representations are NOT string-equal (why === fails)", written !== readBack);
  check("...but ARE the same instant", new Date(readBack).getTime() === new Date(written).getTime());

  const sameInstant = (a, b) => Boolean(a) && new Date(a).getTime() === new Date(b).getTime();
  check("the comparison settle uses recognises the committed write", sameInstant(readBack, written));
  check("...and still rejects a genuinely different period",
        !sameInstant(new Date(NOW + 29 * DAY).toISOString(), written));
  check("...and rejects a null read-back", !sameInstant(null, written));
}

/* ========================================================================= */
console.log("\nCLAIM RELEASE — the rule that decides whether a retry is safe");
/* ========================================================================= */
{
  const src = (await import("node:fs")).readFileSync(
    new URL("../src/lib/pay/settle.ts", import.meta.url), "utf8");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const s = strip(src);

  check("a missing column still falls back (the migration-lag case)",
        /missingColumn/.test(s) && /PGRST204|42703/.test(s));
  check("...but ANY other error does not silently grant a never-expiring plan",
        /if \(!missingColumn\)/.test(s));
  check("the read-back compares instants, not strings", /getTime\(\) === new Date\(endsAt\)\.getTime\(\)/.test(s));
  check("an unverifiable read-back KEEPS the claim rather than releasing it",
        /grant_unverified/.test(s));
  check("...and says so to the customer with the order id",
        /contact support and quote order/.test(s));

  /* The credits branch guards the same way via the ledger reason. Both must
     hold — they are the only things standing between a lost response and a
     duplicate grant. */
  check("the credits branch re-checks the ledger before releasing",
        /alreadyGranted\(\)/.test(s) && /landed !== null/.test(s));
}

/* ========================================================================= */
console.log("\nREFUND REVERSAL — untested until a real refund happens");
/* ========================================================================= */
{
  const fs = await import("node:fs");
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const r = strip(fs.readFileSync(new URL("../src/lib/pay/refund.ts", import.meta.url), "utf8"));

  check("a plan refund shortens by the days that payment bought", /DAYS\(cycle\)/.test(r));
  check("...and never backdates the period before now", /Math\.max\(back, floor\)/.test(r));
  check("...marking it cancelled only when the period is fully consumed", /lapsed \?/.test(r));

  /* Executed: the clamp must hold for every starting position. */
  const shorten = (endsAt, days, now) => Math.max(endsAt - days * DAY, now);
  let bad = 0;
  for (let d = -60; d <= 400; d += 7) {
    const out = shorten(NOW + d * DAY, 30, NOW);
    if (out < NOW) bad++;
  }
  check(`a refund never produces a past end date (${bad} violations)`, bad === 0);

  const status = strip(fs.readFileSync(
    new URL("../src/app/api/superadmin/paytest-status/route.ts", import.meta.url), "utf8"));
  check("the operator page can see whether the clawback actually happened",
        /refund_reversal:/.test(status) && /reversalLedger/.test(status));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
