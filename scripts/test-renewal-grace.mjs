/**
 * A customer whose mandate is about to debit must not be treated as lapsed.
 *
 * ============================================================================
 * THE THREE THINGS THAT HAPPENED TO SOMEONE WHO WAS PAYING CORRECTLY
 * ============================================================================
 *
 * entitlement.ts grants a 3-day RENEWAL_GRACE_DAYS to a live mandate, and says
 * why: UPI Autopay requires 24h pre-debit notice, bank retries are routine, a
 * webhook can lag. Refusing at the exact stroke of the period end turns
 * ordinary settlement lag into an outage for someone who has paid.
 *
 * That grace lives inside effectiveStatus(), which opens with:
 *
 *     if (s !== "active") return s;
 *
 * So it exists only while the stored row still says `active`.
 *
 * expire_lapsed_subscriptions() — the FIRST step of the 04:30 cron — flipped
 * the row to `expired` as soon as `subscription_ends_at < now()`, with no
 * grace and no reference to autorenew_status. One UPDATE and the grace was
 * unreachable for that workspace, permanently. On the same cron run:
 *
 *   LOCKED OUT   billing.ts → "expired" → paywall → the full-screen
 *                "Your subscription has ended" modal, over a product they are
 *                still paying for.
 *   NOT WATCHED  autopilot's entitled() returns false, so their analysis,
 *                alerts and collections are skipped. The route's own docblock
 *                says that is the failure it was written to fix; it fixed
 *                entitled() and left step 1 to defeat it.
 *   DUNNED       renewal-email.ts skipped a live mandate only while status was
 *                `active`. After the sweep it is `expired`, the skip missed,
 *                and we sent "Your plan has ended — Renew my plan" to someone
 *                whose mandate was about to debit. Our own mail, inviting a
 *                double payment.
 *
 * And a SECOND, independent instance that needed no cron at all: billing.ts
 * imported isHardStopped from entitlement.ts and then re-derived the lapse
 * itself as `now > subEnd`, with no grace. chargeForMode() used statusOf() and
 * served the customer while this function locked the screen — the exact
 * inversion paywall.ts warns about: "A UI that locks someone the server would
 * serve is a customer who paid and cannot see what they paid for."
 *
 * ============================================================================
 * WHAT THIS ASSERTS
 * ============================================================================
 *
 * The TS grace is EXECUTED at the boundary. The SQL is read, because this
 * sandbox has no Postgres — but the window in the SQL is pinned to the
 * TypeScript constant, so the two cannot drift apart silently. That is the
 * same TS-to-SQL pinning already used for cortex_norm_name and the practice
 * pool.
 */

import { readFileSync, readdirSync } from "node:fs";
import { effectiveStatus, statusOf, RENEWAL_GRACE_DAYS } from "../src/lib/entitlement.ts";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const eq = (a, b, n) => check(a === b, n, a === b ? "" : `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const DAY = 86_400_000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const ahead = (d) => new Date(Date.now() + d * DAY).toISOString();

/* ========================================================================= */
/* 1. THE GRACE, EXECUTED AT ITS EDGES                                       */
/* ========================================================================= */

eq(RENEWAL_GRACE_DAYS, 3, "the grace is three days");

for (const mandate of ["ACTIVE", "INITIALIZED"]) {
  /*
    INITIALIZED matters as much as ACTIVE: it is what the subscription POST
    writes the moment a mandate is created, and Cashfree may not promote it
    until the first debit authorises. A customer mid-authorisation is the last
    one to lock out.
  */
  eq(effectiveStatus("active", ago(1), { autorenew: mandate }), "active",
     `a ${mandate} mandate one day past the period is still served`);
  eq(effectiveStatus("active", ago(2.9), { autorenew: mandate }), "active",
     `a ${mandate} mandate just inside the grace is still served`);
  eq(effectiveStatus("active", ago(3.1), { autorenew: mandate }), "expired",
     `a ${mandate} mandate past the grace expires — the grace is a floor, not a licence`);
}

eq(effectiveStatus("active", ago(1), { autorenew: null }), "expired",
   "no mandate, one day past: expired, exactly as before");
eq(effectiveStatus("active", ago(1), { autorenew: "CANCELLED" }), "expired",
   "a cancelled mandate gets no grace");
eq(effectiveStatus("active", ahead(5), { autorenew: null }), "active",
   "inside the period, no mandate: active");
eq(statusOf({ subscription_status: "active", subscription_ends_at: ago(2), autorenew_status: "ACTIVE" }), "active",
   "statusOf reads the mandate off the row");

/* ========================================================================= */
/* 2. THE SQL SWEEP MUST AGREE WITH THE TYPESCRIPT                           */
/* ========================================================================= */

{
  /*
    The LAST migration that redefines the function is the live one. Reading the
    whole directory rather than naming a file means a later migration that
    reintroduces the bug is caught, instead of this test happily reading the
    fixed one forever.
  */
  const files = readdirSync(new URL("supabase/migrations/", ROOT))
    .filter((f) => /\.sql$/.test(f))
    .sort()
    .filter((f) => /expire_lapsed_subscriptions/.test(read(`supabase/migrations/${f}`)));
  const live = files[files.length - 1];
  check(Boolean(live), "a migration defines expire_lapsed_subscriptions");

  const sql = stripSql(read(`supabase/migrations/${live}`));

  check(/autorenew_status/.test(sql),
    `the live sweep (${live}) consults the mandate`,
    "without it the sweep expires a workspace whose mandate debits tomorrow, and " +
    "effectiveStatus can never grant the grace again because it short-circuits on " +
    "a non-active status");

  check(/'ACTIVE'/.test(sql) && /'INITIALIZED'/.test(sql),
    "and honours both live mandate states");

  /* The window has to BE the constant, not merely resemble it. */
  const m = sql.match(/now\(\)\s*-\s*interval\s*'(\d+)\s*days?'/i);
  check(Boolean(m), "the sweep subtracts an interval before expiring a live mandate");
  if (m) {
    eq(Number(m[1]), RENEWAL_GRACE_DAYS,
       "and that interval equals RENEWAL_GRACE_DAYS");
  }

  /* The old unconditional form must be gone. */
  check(!/subscription_ends_at\s*<\s*now\(\)\s*\n?\s*returning/i.test(sql),
    "the unconditional `subscription_ends_at < now()` form is gone");
}

/* ========================================================================= */
/* 3. ONE DEFINITION OF LAPSE — THE UI MUST NOT OUTRUN THE SERVER            */
/* ========================================================================= */

{
  const s = strip(read("src/lib/billing.ts"));

  check(/effectiveStatus/.test(s),
    "billing.ts derives the lapse from effectiveStatus",
    "it imported isHardStopped from entitlement.ts and then re-derived the lapse " +
    "itself with no grace, so the paywall locked a customer the meter was serving");

  check(!/subStatus === "active" && subEnd !== null && now > subEnd/.test(s),
    "and no longer recomputes `now > subEnd` on its own");

  check(/autorenew_status/.test(s),
    "and reads the mandate off the row to do it");

  /* A pooled client must inherit the FIRM's grace, or it locks out while the
     firm does not — the same asymmetry the pooling block was written to end. */
  const pooled = s.slice(s.indexOf("resolvePayer"), s.indexOf("subStatus = payerStatus"));
  check(/autorenewStatus = \(firmRow as any\)\.autorenew_status/.test(pooled),
    "a pooled client inherits the payer's mandate along with its dates");
}

/* ========================================================================= */
/* 4. NOBODY IS ASKED TO PAY AGAIN WHILE A MANDATE IS LIVE                   */
/* ========================================================================= */

{
  const g = strip(read("src/components/trial-guard.tsx"));
  check(/autorenewActive/.test(g),
    "the renewal banner knows whether a mandate is live");
  check(/daysLeft <= 7 && !autorenewActive/.test(g),
    "and does not say \"Your plan renews in N days — Renew\" when it is",
    "following that prompt buys a second period the customer did not need; " +
    "settle.ts stacks it correctly, which is correct arithmetic on a mistake " +
    "we caused");

  const layout = strip(read("src/app/(app)/layout.tsx"));
  check(/autorenewActive=\{billing\.autorenewActive\}/.test(layout),
    "and the layout actually passes it",
    "a prop with a default of false is silently off if nobody supplies it");
}

{
  const r = strip(read("src/lib/renewal-email.ts"));
  check(/const mandateLive =/.test(r) && /if \(mandateLive\)/.test(r),
    "the renewal email skips on the mandate alone");
  check(!/=== "ACTIVE" && status === "active"/.test(r),
    "not on the mandate AND the stored status",
    "the stored status is exactly what the sweep rewrites one cron step earlier, " +
    "which is how a live-mandate customer got the \"your plan has ended\" notice");
  check(/INITIALIZED/.test(r), "and treats a mandate mid-authorisation as live");
}

/* ========================================================================= */
/* 5. A RETIRED PLAN MUST STILL BE CANCELLABLE                               */
/* ========================================================================= */

{
  const a = strip(read("src/components/autorenew.tsx"));
  check(/ALL_PLANS\.find/.test(a),
    "the auto-renewal control resolves against ALL_PLANS",
    "with PLANS (the six live tiers) a workspace on a retired or " +
    "operator-provisioned plan rendered the heading with nothing under it — no " +
    "status, no next charge, and no way to switch a live mandate off");
  check(!/\bPLANS\.find/.test(a.replace(/ALL_PLANS\.find/g, "")),
    "and nowhere falls back to the live-only list");
}

console.log(`\nrenewal grace: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log("  A live mandate is served, not locked; not dunned; and can always be switched off.");
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
