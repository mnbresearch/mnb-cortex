#!/usr/bin/env node
/**
 * Entitlement rule tests.  Run: npm run test:entitlement
 *
 * These rules decide who can use the paid product. Both ways of getting them
 * wrong cost real money, and neither is visible to `tsc`:
 *
 *   too lenient → lapsed workspaces use the product for free;
 *   too strict  → a PAYING customer is refused service, which is worse and is
 *                 exactly the bug this suite was written after nearly shipping
 *                 (turning OFF auto-renew must NOT revoke time already paid for).
 *
 * It compiles and imports the REAL src/lib/entitlement.ts rather than
 * re-stating the logic, so the test cannot quietly drift from the code.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "entitlement-"));

try {
  execFileSync(
    join(root, "node_modules", ".bin", "tsc"),
    ["src/lib/entitlement.ts", "--outDir", out, "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler"],
    { cwd: root, stdio: "inherit" },
  );
} catch {
  console.error("Could not compile src/lib/entitlement.ts");
  process.exit(1);
}

const { effectiveStatus, isLapsed } = await import(pathToFileURL(join(out, "entitlement.js")).href);

const days = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const BLOCK = true, ALLOW = false;

/** [name, subscription_status, subscription_ends_at, opts, expected] */
const cases = [
  // --- must be ALLOWED. A false positive here refuses a paying customer. ---
  ["brand-new signup, 3 days of trial left",      "trialing",  null,      { trialEndsAt: days(3) },   ALLOW],
  ["trialing with no trial_ends_at recorded",     "trialing",  null,      {},                         ALLOW],
  ["paid one-off, 20 days left",                  "active",    days(20),  {},                         ALLOW],
  ["super-admin grant, NULL ends_at",             "active",    null,      {},                         ALLOW],
  ["auto-renew turned OFF, 10 days still paid",   "active",    days(10),  { autorenew: "CANCELLED" }, ALLOW],
  ["mandate ON_HOLD, 10 days still paid",         "active",    days(10),  { autorenew: "ON_HOLD" },   ALLOW],
  ["live mandate, renewal 1 day late",            "active",    days(-1),  { autorenew: "ACTIVE" },    ALLOW],
  ["live mandate, renewal 2 days late",           "active",    days(-2),  { autorenew: "ACTIVE" },    ALLOW],
  ["unparseable ends_at (never lock out on bad data)", "active", "not-a-date", {},                    ALLOW],

  // --- must be BLOCKED. A false negative here gives the product away. ---
  ["trial expired yesterday",                     "trialing",  null,      { trialEndsAt: days(-1) },  BLOCK],
  ["paid period ended, no auto-renew",            "active",    days(-1),  {},                         BLOCK],
  ["live mandate, renewal 5 days late (past grace)", "active", days(-5),  { autorenew: "ACTIVE" },    BLOCK],
  ["super-admin suspended, period remaining",     "suspended", days(30),  {},                         BLOCK],
  ["cancelled by super-admin",                    "cancelled", days(30),  {},                         BLOCK],
  ["legacy single-L 'canceled' spelling",         "canceled",  days(30),  {},                         BLOCK],
];

let failed = 0;
for (const [name, status, endsAt, opts, expected] of cases) {
  const got = isLapsed(effectiveStatus(status, endsAt, opts));
  const ok = got === expected;
  if (!ok) failed++;
  const verdict = expected ? "blocked" : "allowed";
  console.log(`${ok ? " ok " : "FAIL"}  ${verdict.padEnd(7)}  ${name}${ok ? "" : `   <-- got ${got ? "blocked" : "allowed"}`}`);
}

rmSync(out, { recursive: true, force: true });

console.log(failed ? `\n${failed} of ${cases.length} FAILED` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
