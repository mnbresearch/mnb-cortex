/**
 * A refund must reverse ITS OWN SHARE, and a period change must carry value.
 *
 * WHAT THIS EXISTS TO PREVENT — two defects, both of which took real product
 * away from, or gave real product to, someone who had not paid for it.
 *
 * 1. THE ₹1 REFUND THAT TOOK ₹8,999 OF CREDITS.
 *
 *    handleRefundEvent never read the refund amount — the word did not appear
 *    in the file outside the alert text. Every refund event reversed the ENTIRE
 *    entitlement: all 10,000 credits of the pack, or all 365 days of the annual
 *    plan. Cashfree's own mandate-authorisation reversal is a ₹1 refund, so
 *    this was not an edge case; it is a normal event in the autorenew flow.
 *
 * 2. THIRTEEN MONTHS OF COMMAND FOR ₹47,989.
 *
 *    settle.ts stacked paid periods by TIME and then overwrote the plan name.
 *    Buy Try annual (₹7,990 → 365 days), buy Command monthly (₹39,999) on day
 *    one, and the workspace held 395 days of Command — a plan that lists at
 *    ₹39,999 per month. The carried days were bought at Try's price and were
 *    then honoured at Command's.
 *
 * Both fixes are pure arithmetic, so this suite EXECUTES them rather than
 * grepping for their shape. Every assertion below fails if the function it
 * tests is reverted, and that has been checked by reverting them.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "refundmath-"));

/* Compile the REAL modules. A test that restates the arithmetic it is testing
   cannot detect the arithmetic being wrong. */
try {
  execFileSync(join(root, "node_modules", ".bin", "tsc"),
    ["src/lib/pay/refund-math.ts", "src/lib/pay/period.ts",
     "--outDir", out, "--module", "esnext", "--target", "es2022",
     "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: root, stdio: "pipe" });
} catch (e) {
  console.error("Could not compile the refund/period modules\n" + (e.stdout || e).toString().slice(0, 800));
  process.exit(1);
}
/* `import "server-only"` is a Next build marker with no Node equivalent. */
for (const f of ["refund-math.js", "period.js"]) {
  const p = join(out, f);
  writeFileSync(p, readFileSync(p, "utf8").replace(/^import ["']server-only["'];?\s*$/m, ""));
}

const { planRefund, creditsToReclaim, daysToRemove, cycleDays, equivalentDays } =
  await import(pathToFileURL(join(out, "refund-math.js")).href);
/* refundReadiness lives in refund.ts, which imports Supabase — so it is read as
   source rather than executed. The RULES are what matter and they are asserted
   below against the real text. */
const refundSrc = readFileSync(join(root, "src/lib/pay/refund.ts"), "utf8");
const { nextPeriod, pricePerDay } =
  await import(pathToFileURL(join(out, "period.js")).href);

let pass = 0;
const failures = [];
const eq = (name, got, want, why = "") => {
  const ok = typeof want === "number" ? Math.abs(got - want) < 1e-9 : got === want;
  if (ok) pass++;
  else failures.push(`${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}${why ? "\n      " + why : ""}`);
};
const ok = (name, cond, why = "") => (cond ? pass++ : failures.push(`${name}${why ? "\n      " + why : ""}`));

/* ======================================================================= */
console.log("\nREFUND SHARE — a refund reverses what it refunded");
/* ======================================================================= */

{
  /* The exact defect: ₹1 back on the ₹8,999 pack. */
  const p = planRefund({ paid: 8999, refundAmount: 1, refundedSoFar: 0 });
  ok("a ₹1 refund on ₹8,999 is not treated as a full refund", p.full === false,
     "this is the bug: any refund reversed the whole entitlement");
  eq("...and reclaims 1 of 10,000 credits, not 10,000",
     creditsToReclaim(10000, p), 1);

  const annual = planRefund({ paid: 39999, refundAmount: 1, refundedSoFar: 0 });
  eq("a ₹1 refund on the annual plan removes 0 days, not 365",
     daysToRemove(365, annual), 0,
     "365 days for ₹1 is the same defect measured in time");
}

{
  const p = planRefund({ paid: 8000, refundAmount: 500, refundedSoFar: 0 });
  eq("a ₹500 refund on ₹8,000 is 6.25%", Math.round(p.share * 10000) / 10000, 0.0625);
  eq("...reclaiming 625 of 10,000 credits", creditsToReclaim(10000, p), 625);
  /* 6.25% of 30 days is 1.875, FLOORED to 1. Rounding to 2 would take a day the
     refund did not pay for, and the file's own rule is that every fraction
     favours the customer — for days as well as credits. */
  eq("...and 1 of 30 days", daysToRemove(30, p), 1);
}

{
  /* Repeated partials must accumulate against the total, not each start from
     the whole. Three thirds add up to the whole and no more. */
  const a = planRefund({ paid: 9000, refundAmount: 3000, refundedSoFar: 0 });
  const b = planRefund({ paid: 9000, refundAmount: 3000, refundedSoFar: 3000 });
  const c = planRefund({ paid: 9000, refundAmount: 3000, refundedSoFar: 6000 });
  eq("first third reclaims 3,333 credits", creditsToReclaim(10000, a, 0), 3333);
  eq("second third reclaims another 3,333", creditsToReclaim(10000, b, 3333), 3333);
  ok("the third one completes the refund", c.full === true);
  eq("...and reclaims the exact remainder, not another third",
     creditsToReclaim(10000, c, 6666), 3334,
     "3333+3333+3334 = 10000: a full refund must leave the customer nothing of the pack");
  eq("the cumulative total never exceeds what was paid", c.refundedTotal, 9000);
}

{
  /* A refund larger than the payment (a provider refunding gross of its fee)
     is capped rather than refused — refusing would leave it unreversed. */
  const p = planRefund({ paid: 5000, refundAmount: 6000, refundedSoFar: 0 });
  ok("an over-refund is treated as full", p.full === true);
  eq("...and does not reclaim more than was granted", creditsToReclaim(1000, p), 1000);
  eq("...and cannot remove more days than the cycle", daysToRemove(30, p), 30);
}

{
  const p = planRefund({ paid: 8999, refundAmount: 8999, refundedSoFar: 0 });
  ok("a full refund is recognised", p.full === true);
  eq("...and takes the whole pack", creditsToReclaim(10000, p), 10000);
  eq("...and the whole period", daysToRemove(365, p), 365);
}

/* ======================================================================= */
console.log("\nUNREADABLE AMOUNTS — the one case a human must decide");
/* ======================================================================= */

{
  const p = planRefund({ paid: 8999, refundAmount: null, refundedSoFar: 0 });
  ok("a refund with no readable amount reverses NOTHING", p.share === 0 && p.full === false);
  ok("...and is escalated to a human", p.needsHuman === true,
     "the tempting default is 'assume full', which confiscates a plan on the strength of a renamed JSON field");
  eq("...taking no credits in the meantime", creditsToReclaim(10000, p), 0);
  eq("...and no days", daysToRemove(365, p), 0);

  /* A DISPUTE is different: a chargeback takes the payment whether we like it
     or not, so the entitlement goes with it. */
  const d = planRefund({ paid: 8999, refundAmount: null, refundedSoFar: 0, isDispute: true });
  ok("a dispute with no amount IS treated as full", d.full === true && d.needsHuman === false);
  eq("...and reverses everything", creditsToReclaim(10000, d), 10000);
}

{
  const p = planRefund({ paid: 0, refundAmount: 500, refundedSoFar: 0 });
  ok("a refund against a payment with no recorded amount goes to a human",
     p.needsHuman === true, "no whole, so no share can be computed");
}

/* ======================================================================= */
console.log("\nROUNDING — every fraction favours the customer");
/* ======================================================================= */

{
  let overreach = 0;
  for (const paid of [799, 7990, 8999, 39999, 399990]) {
    for (const pct of [1, 7, 13, 33, 50, 66, 99]) {
      const amt = (paid * pct) / 100;
      const p = planRefund({ paid, refundAmount: amt, refundedSoFar: 0 });
      const credits = creditsToReclaim(10000, p);
      /* Never reclaim a larger fraction than was refunded. */
      if (credits > Math.ceil(10000 * (amt / paid))) overreach++;
    }
  }
  ok(`no combination reclaims more than its share (${overreach} violations)`, overreach === 0);

  eq("a fraction of a credit stays with the customer",
     creditsToReclaim(10001, planRefund({ paid: 10000, refundAmount: 625, refundedSoFar: 0 })), 625,
     "6.25% of 10,001 is 625.06 — floored, not rounded up");
}

/* ======================================================================= */
console.log("\nPERIOD REVALUATION — a cheap year does not become an expensive one");
/* ======================================================================= */

const TRY = { monthly: 799, annual: 7990 };
const COMMAND = { monthly: 39999, annual: 399990 };
const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

{
  /* The exploit, exactly as reported. */
  const d = nextPeriod({
    now: NOW,
    existingEndsAt: NOW + 365 * DAY,
    boughtDays: 30,
    priorPlan: "try", newPlan: "command",
    priorPricePerDay: pricePerDay(TRY, "annual"),
    newPricePerDay: pricePerDay(COMMAND, "monthly"),
  });
  const totalDays = Math.round((d.endsAt - NOW) / DAY);
  ok("365 days of Try does not become 395 days of Command", totalDays < 395,
     "₹47,989 for thirteen months of a ₹39,999/month plan");
  /* ₹7,990 of remaining Try ÷ ₹1,333.30 a day of Command = 5.99 days, floored
     to 5, plus the 30 the ₹39,999 bought. The floor is deliberate: rounding a
     part-day up would hand over a day of the expensive plan on every upgrade. */
  eq("...it becomes 35: 5 days of carried value plus the 30 bought", totalDays, 35);
  eq("...and the carried figure is stated, not implied", d.carriedDays, 5);
  ok("the decision records that it revalued", d.revalued === true);

  /* The arithmetic, stated independently: the carried days must be worth what
     was paid for them. */
  const carriedValue = d.carriedDays * pricePerDay(COMMAND, "monthly");
  const remainingValue = 365 * pricePerDay(TRY, "annual");
  ok("the carried days are worth no more than the days given up",
     carriedValue <= remainingValue + pricePerDay(COMMAND, "monthly"),
     `carried ₹${Math.round(carriedValue)} against ₹${Math.round(remainingValue)} surrendered`);
}

{
  /* A RENEWAL must still stack exactly as it always did. This is the case the
     original code was written for, and breaking it would take time away from
     somebody who bought next month early. */
  const d = nextPeriod({
    now: NOW, existingEndsAt: NOW + 12 * DAY, boughtDays: 30,
    priorPlan: "command", newPlan: "command",
    priorPricePerDay: pricePerDay(COMMAND, "monthly"),
    newPricePerDay: pricePerDay(COMMAND, "monthly"),
  });
  eq("a same-plan renewal stacks on the remaining days",
     Math.round((d.endsAt - NOW) / DAY), 42);
  ok("...and is not marked as revalued", d.revalued === false);
}

{
  /* A DOWNGRADE is deliberately generous: the customer keeps the value they
     bought, which buys many more days of a cheaper plan. */
  const d = nextPeriod({
    now: NOW, existingEndsAt: NOW + 20 * DAY, boughtDays: 30,
    priorPlan: "command", newPlan: "try",
    priorPricePerDay: pricePerDay(COMMAND, "monthly"),
    newPricePerDay: pricePerDay(TRY, "monthly"),
  });
  ok("a downgrade carries the value forward rather than confiscating it",
     d.carriedDays > 20,
     "20 days of Command is worth far more than 20 days of Try, and they paid for it");
}

{
  const d = nextPeriod({ now: NOW, existingEndsAt: 0, boughtDays: 30, priorPlan: "", newPlan: "try",
    priorPricePerDay: 0, newPricePerDay: pricePerDay(TRY, "monthly") });
  eq("a first purchase simply runs 30 days from now", Math.round((d.endsAt - NOW) / DAY), 30);
  eq("...carrying nothing", d.carriedDays, 0);
}

{
  /* An unresolvable prior price must not silently zero the carried days —
     that would take time away from a customer to fix an accounting nicety. */
  const d = nextPeriod({
    now: NOW, existingEndsAt: NOW + 100 * DAY, boughtDays: 30,
    priorPlan: "some_retired_plan", newPlan: "command",
    priorPricePerDay: 0, newPricePerDay: pricePerDay(COMMAND, "monthly"),
  });
  eq("with prices unknown, the days carry at face value as before",
     Math.round((d.endsAt - NOW) / DAY), 130);
  ok("...and it says so rather than pretending it revalued",
     d.revalued === false && typeof d.note === "string");
}

/* ======================================================================= */
console.log("\nACCUMULATION — partials then a full refund must not double-count");
/* ======================================================================= */

{
  /*
    THE DEFECT: daysToRemove had no `alreadyRemoved` parameter while
    creditsToReclaim did, so a full refund after two partials removed the whole
    cycle a second time. Two ₹500 partials on a ₹8,000 monthly plan take 3 days
    between them; the balance refund must take the remaining 27, not 30.
  */
  const a = planRefund({ paid: 8000, refundAmount: 500, refundedSoFar: 0 });
  const b = planRefund({ paid: 8000, refundAmount: 500, refundedSoFar: 500 });
  const dA = daysToRemove(30, a, 0);
  const dB = daysToRemove(30, b, dA);
  const full = planRefund({ paid: 8000, refundAmount: 7000, refundedSoFar: 1000 });
  const dC = daysToRemove(30, full, dA + dB);
  eq("two partials take 1 day each", `${dA},${dB}`, "1,1");
  ok("the balance refund is recognised as full", full.full === true);
  eq("...and takes only the days that are left", dC, 28);
  eq("the three together are exactly the cycle", dA + dB + dC, 30,
     "removing 30 again after the partials is how a refunded plan ends early");
}

{
  /* The same for a dispute with an unreadable amount arriving after partials —
     the case that used to remove a whole extra cycle. */
  const p1 = planRefund({ paid: 8000, refundAmount: 4000, refundedSoFar: 0 });
  const d1 = daysToRemove(30, p1, 0);
  const d2 = planRefund({ paid: 8000, refundAmount: null, refundedSoFar: 4000, isDispute: true });
  eq("a later dispute takes only the remainder", daysToRemove(30, d2, d1), 15);
}

/* ======================================================================= */
console.log("\nEQUIVALENT DAYS — a refund after a plan change");
/* ======================================================================= */

{
  /*
    Buy Command monthly, downgrade to Try: period.ts carries the value, so 30
    days of Command becomes ~1,500 days of Try. Refunding that Command payment
    with a flat cycleDays("monthly") removes 30 of those days and leaves the
    customer roughly four years of a plan they were refunded for.
  */
  const days = equivalentDays({
    paidCycleDays: 30,
    paidPricePerDay: pricePerDay(COMMAND, "monthly"),
    currentPricePerDay: pricePerDay(TRY, "monthly"),
  });
  ok("refunding a downgraded payment removes what it was worth, not 30 days", days > 1000,
     `removes ${days} days of Try`);

  eq("no plan change means no conversion",
     equivalentDays({ paidCycleDays: 30, paidPricePerDay: 100, currentPricePerDay: 100 }), 30);
  eq("an unresolvable price falls back to the payment's own cycle",
     equivalentDays({ paidCycleDays: 365, paidPricePerDay: 0, currentPricePerDay: 50 }), 365);
  eq("an upgrade converts the other way",
     equivalentDays({ paidCycleDays: 365,
       paidPricePerDay: pricePerDay(TRY, "annual"),
       currentPricePerDay: pricePerDay(COMMAND, "monthly") }), 5);
}

/* ======================================================================= */
console.log("\nCYCLE DAYS");
/* ======================================================================= */
eq("annual is 365 days", cycleDays("annual"), 365);
eq("monthly is 30", cycleDays("monthly"), 30);
eq("an unknown cycle is treated as monthly, the smaller reversal", cycleDays(""), 30);
eq("case does not matter", cycleDays("ANNUAL"), 365);

/* ======================================================================= */
console.log("\nREADINESS — only reverse when the money has actually gone back");
/* ======================================================================= */

{
  /*
    NOTHING USED TO ASK. The webhook routes on the event NAME, and the handler
    read only the amount — so a REFUND_FAILED (money still with us) reversed
    the customer's credits, and it claimed that refund's id as the event id, so
    the later genuine REFUND_SUCCESS was dismissed as "already handled".

    And a DISPUTE was reversed at creation, before anybody had decided it, with
    no path to give the product back if we won.
  */
  const code = refundSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok("the refund STATUS is read, not just the event name",
     /refund_status/.test(code), "REFUND_FAILED means the money is still with us");
  ok("a status that is not SUCCESS reverses nothing",
     /refund_not_completed/.test(code));
  ok("an open dispute reverses nothing and tells the operator",
     /dispute_pending/.test(code),
     "reversing at dispute creation takes the product from a customer who may win");
  ok("a dispute we WON is recognised as nothing to reverse",
     /dispute_won/.test(code));
  ok("only a lost or accepted dispute reverses",
     /dispute_lost/.test(code) && /LOST\|ACCEPT\|CHARGEBACK/.test(code));
  ok("the gate runs BEFORE the claim is taken",
     code.indexOf("refundReadiness(") < code.indexOf('from("payment_refunds")'),
     "claiming the event id first would make the real REFUND_SUCCESS look like a duplicate");
  ok("a failed reversal asks for a retry rather than acking",
     /throw new Error\(`refund reversal failed/.test(code),
     "returning ok:true told Cashfree it was handled, and nothing else retries refunds");
  ok("how much was already refunded includes the pre-migration column",
     /Math\.max\(fromEvents, Number\(p\.refunded_amount\)/.test(code),
     "refunds processed by the old code were invisible, so a redelivery re-reversed the whole cycle");
  ok("the reversal flag is set before anything that can throw",
     code.indexOf("reversedSomething = true") < code.indexOf("daysRemoved = days"),
     "a throw between the commit and the flag deleted the claim and let the event reverse twice");
}

/* ======================================================================= */
console.log("\nTHE REPAIR WINDOW — history is not repaired by a webhook");
/* ======================================================================= */

{
  const settle = readFileSync(join(root, "src/lib/pay/settle.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok("there is a repair window at all", /REPAIR_WINDOW_DAYS/.test(settle),
     "Cashfree answers PAID for an order from six months ago; replaying one granted a fresh period");
  ok("...and an old row with no recorded period is refused, not granted",
     /!alreadyGrantedAt && !recordedPeriodTo && rowAgeDays > REPAIR_WINDOW_DAYS/.test(settle));
  ok("...and escalated rather than silently dropped",
     /settle_outside_repair_window/.test(settle));
  ok("granted_at is written in a statement of its own",
     /void periodTo;/.test(settle),
     "sending period_to alongside it failed wholesale on an unmigrated column, so granted_at never landed");

  const verify = readFileSync(join(root, "src/app/api/pay/cashfree/verify/route.ts"), "utf8");
  ok("the verify endpoint requires admin, like the one that starts a payment",
     /hasRole\("admin"\)/.test(verify));
  ok("...and checks ownership BEFORE settling",
     verify.indexOf("getOrder(orderId)") < verify.indexOf("settleOrder(orderId)"),
     "the 403 used to fire after the grant path had already run against a stranger's order");
}

console.log(`\nrefund-math: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  A refund reverses its own share; an unknown amount reverses nothing; a plan change carries value, not days.");
