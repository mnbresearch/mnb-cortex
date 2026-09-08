/*
  THE FIRST SESSION, EXECUTED.

  This is the substitute for a human signing up, and it exists because the bug
  it covers was 100% reproducible, shipped anyway, and could not have been
  caught by any test in this repo.

  WHAT HAPPENED.

  TRIAL_DAYS is 0 — deliberately; there is no free tier. ensureWorkspace()
  therefore stamps trial_ends_at = now, entitlement reads `expired` one tick
  after signup, and billing marks the workspace locked. TrialGuard covers every
  page except a short ALLOW list. The onboarding wizard — the screen the
  post-signup redirect sends people to — links to exactly three places:

      /import        its primary button
      /receivables   its finish button
      /dashboard     its secondary button

  None of the three were on the list. So the sequence was: sign up, land on a
  welcome wizard, complete it, press the button it hands you, and hit a lock
  asking for ₹4,999. Seeding the full sample business works and is awaited,
  which made it worse — the data was there and could not be looked at.

  A second one of the same shape: `locked` ignored the credit balance, while
  lib/credits.ts has a deliberate pay-as-you-go path (a lapsed workspace holding
  credits may spend them, because bought credits ARE the entitlement when there
  is no trial). So a customer who bought the ₹149 pack the landing page
  advertises got a server that metered their credits and a UI that covered
  every page — while /billing told them to buy a ₹149 pack.

  WHY NO TEST COULD SEE EITHER.

  The list lived in a "use client" React component. The decision lived inside
  getBillingStatus(), behind `import "server-only"` and a Supabase round-trip.
  Neither was reachable from node, so neither was ever executed — and the two
  things that had to agree (the list, and the destinations it had to cover)
  lived in different files with nothing comparing them.

  Both are now pure functions in lib/paywall.ts with no imports at all. This
  file executes them, and reads the wizard's destinations OUT OF THE WIZARD, so
  adding a fourth button there fails this test until the list catches up.
*/
import { readFileSync } from "node:fs";
import { isLocked, isAllowedWhileLocked, PAYWALL_ALLOW } from "../src/lib/paywall.ts";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else failures.push(`${name}${detail ? " — " + detail : ""}`);
}

/* ===================================================== 1. THE DECISION ==== */

const NEW_SIGNUP = { enforceable: true, status: "expired", blocked: false, credits: 0, unlimited: false };

check(
  "a brand-new workspace with no plan and no credits IS locked",
  isLocked(NEW_SIGNUP) === true,
  "there is no free tier; this is the intended state and the reason the ALLOW list below has to be right",
);

check(
  "...but one that bought a credit pack is NOT",
  isLocked({ ...NEW_SIGNUP, credits: 1 }) === false,
  "lib/credits.ts lets a lapsed workspace spend its balance. A UI that locks someone the server would serve is a customer who paid and cannot see it",
);

check(
  "a ₹149 Taster pack unlocks the product",
  isLocked({ ...NEW_SIGNUP, credits: 165 }) === false,
  "the exact case the landing page advertises",
);

check(
  "an unlimited allowance override unlocks it",
  isLocked({ ...NEW_SIGNUP, unlimited: true }) === false,
  "credits_allowance = -1 is how an operator hands out a manual grant",
);

check(
  "a paid, current workspace is not locked",
  isLocked({ ...NEW_SIGNUP, status: "active" }) === false,
);

/*
  THE OPERATOR LEVER MUST OUTRANK THE ESCAPE HATCHES.

  `expired` is a clock. `suspended`/`cancelled` is a decision someone made about
  a chargeback or an abuse report. Before this, chargeForMode refused only when
  `isLapsed && !hasOverride && balance < cost` — so a suspended workspace
  holding credits, or holding ANY non-zero allowance override, carried on
  working. The console page promised suspension "locks that customer out".
*/
check(
  "a suspended workspace is locked even holding credits",
  isLocked({ ...NEW_SIGNUP, blocked: true, credits: 999_999 }) === true,
  "a suspension must not be survivable by holding a balance",
);
check(
  "a suspended workspace is locked even with an unlimited override",
  isLocked({ ...NEW_SIGNUP, blocked: true, unlimited: true }) === true,
  "the override short-circuit is exactly what let a suspended account keep spending ₹77-a-clip Veo",
);
check(
  "a suspended workspace is locked even while nominally active",
  isLocked({ ...NEW_SIGNUP, blocked: true, status: "active" }) === true,
);

check(
  "enforcement is OFF before the trial columns are migrated",
  isLocked({ ...NEW_SIGNUP, enforceable: false }) === false &&
  isLocked({ ...NEW_SIGNUP, enforceable: false, blocked: true }) === false,
  "locking every customer out because a migration has not run yet is the worst possible failure",
);

/* ============================ 2. THE WIZARD'S OWN DESTINATIONS ============ */
/*
  Read out of the component, not restated here. Restating them would reproduce
  the original bug in the test: two lists that agree today and drift tomorrow.
*/
const wizard = readFileSync("src/components/onboarding-wizard.tsx", "utf8");
const destinations = [...wizard.matchAll(/href="(\/[a-z0-9/-]*)"/gi)].map((m) => m[1]);
const unique = [...new Set(destinations)];

check(
  "the wizard's destinations were actually found",
  unique.length >= 3,
  `found ${unique.length} — if this parse breaks the test goes quiet instead of failing`,
);

for (const d of unique) {
  check(
    `a locked user can reach the wizard's own link ${d}`,
    isAllowedWhileLocked(d),
    "the onboarding wizard hands the user this button; a lock behind it is a dead end on the first screen",
  );
}

/* ============================ 3. THE PATHS THAT MUST STAY OPEN ============ */

for (const [path, why] of [
  ["/onboarding", "the first screen after signup"],
  ["/billing", "where you pay"],
  ["/usage", "/billing tells locked users to buy a ₹149 pack, and this is the only place selling one"],
  ["/settings", "company name and industry cost us nothing"],
  ["/import?table=invoices", "query strings must not defeat the match"],
]) {
  check(`${path} is reachable while locked`, isAllowedWhileLocked(path), why);
}

/* ============================ 4. AND THE ONES THAT MUST NOT ============== */

for (const [path, why] of [
  ["/agents", "image and video generation is the most expensive thing in the product"],
  ["/collections", "sends mail to the customer's customers"],
  ["/workflows", "runs scheduled work on our infrastructure"],
  ["/practice", "a Practice-plan feature"],
  ["/pricing-optimizer", "a real billable product page whose prefix collides with /pricing — the reason PAYWALL_ALLOW_EXACT exists"],
]) {
  check(`${path} is NOT reachable while locked`, !isAllowedWhileLocked(path), why);
}

/* ============================ 5. THE LIST STAYS HONEST ==================== */

check(
  "the allow list is short",
  PAYWALL_ALLOW.length <= 10,
  `${PAYWALL_ALLOW.length} entries — every addition is a page given away for free, and the list grows one reasonable-sounding entry at a time`,
);

/*
  Both consumers must use the shared helper rather than keeping a private copy.
  A component that re-declares the list is how this diverged in the first place.
*/
const guard = readFileSync("src/components/trial-guard.tsx", "utf8");
check(
  "trial-guard.tsx uses the shared list, not its own",
  /isAllowedWhileLocked/.test(guard) && !/const ALLOW\s*=/.test(guard),
  "a second copy of the list is the original bug",
);
const billing = readFileSync("src/lib/billing.ts", "utf8");
check(
  "billing.ts uses the shared decision, not its own expression",
  /isLocked\(\{/.test(billing) && !/status === "expired" && !/.test(billing.replace(/isLocked[\s\S]{0,120}/, "")),
  "the paywall and the meter must not be able to disagree",
);

/* ------------------------------------------------------------------ report */
console.log(`\npaywall — the first session: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log(`  Wizard destinations checked against the live list: ${unique.join(", ")}`);
console.log("  A new signup is locked, and can still finish setting up, look at its own books, and pay.");
