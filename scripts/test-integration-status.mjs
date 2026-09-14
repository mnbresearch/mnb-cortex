/*
  "LIVE" HAS TO MEAN VERIFIED.

  Two things are asserted here, and the second is the one that matters longer
  than this commit.

  1. The status arithmetic in src/lib/integration-status.ts — three states, and
     `last_test_ok` being null rather than false when nothing was tested.

  2. That `Integration.testable` in the catalogue matches the switch cases in
     api/integrations/route.ts EXACTLY, in both directions. That flag existed
     for months, was set on seventeen providers, and was read by nothing — and
     it had already drifted: `typeform` had a real test case and no flag. Now
     that the UI hides the Test button based on it, a drift in one direction
     hides a working test and in the other offers a button that cannot work.
     An unread field is a field that is already wrong.

  Run: npm run test:integration-status
*/
import { readFileSync } from "node:fs";
import { readCode } from "./lib/read-code.mjs";
import {
  statusFor, lastTestOk, badgeFor, needsAttention,
} from "../src/lib/integration-status.ts";

let pass = 0;
const fails = [];
const ok = (name, cond, extra = "") => cond ? pass++ : fails.push(`${name}${extra ? " — " + extra : ""}`);
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* ─────────────────────────────────────────────────── statusFor ──────────── */

eq("verified and accepted is connected", statusFor(true, true), "connected");
eq("verified and rejected is an error", statusFor(false, true), "error");

/*
  THE CENTRAL CASE. ok:true with verified:false is what the `default` branch of
  testCredentials returns for 45 of 63 providers. It used to become
  "connected" — a green Live badge for a credential nothing had been asked
  about.
*/
eq("stored but unverified is saved, NOT connected", statusFor(true, false), "saved");
ok("an unverified credential is never connected", statusFor(true, false) !== "connected");

/*
  A rejection outranks the absence of a test. If a provider actively said no,
  that is a fact worth keeping even on a path that did not intend to verify.
*/
eq("rejection wins over unverified", statusFor(false, false), "error");

/* ─────────────────────────────────────────────────── lastTestOk ─────────── */

eq("a passed test records true", lastTestOk(true, true), true);
eq("a failed test records false", lastTestOk(false, true), false);

/*
  NULL, NOT FALSE. `false` asserts a test ran and failed, which is a second
  untrue claim replacing the first. Only null means "no test happened".
*/
eq("no test records null", lastTestOk(true, false), null);
eq("no test records null even when ok is false", lastTestOk(false, false), null);
ok("an untested provider never records a boolean", typeof lastTestOk(true, false) !== "boolean");

/* ───────────────────────────────────────────────────── badgeFor ─────────── */

eq("connected reads Live", badgeFor("connected").label, "Live");
eq("connected is green", badgeFor("connected").tone, "ok");
eq("saved reads Saved", badgeFor("saved").label, "Saved");
eq("saved is not green", badgeFor("saved").tone, "neutral");
eq("error reads Check", badgeFor("error").label, "Check");
eq("error is a warning", badgeFor("error").tone, "warn");

/*
  An unrecognised status must not default to green. Rows written before this
  change hold "connected" for untested providers and keep their badge, which is
  a deliberate choice; but a NEW unknown value defaulting to "ok" would be the
  original bug returning through the back door.
*/
for (const weird of [null, undefined, "", "pending", "live", "CONNECTED", "ok", "true"]) {
  ok(`unknown status is not green: ${JSON.stringify(weird)}`, badgeFor(weird).tone !== "ok");
}
ok("every badge carries a hint a screen reader can use",
  ["connected", "saved", "error", "zzz"].every((s) => badgeFor(s).hint.length > 20));
ok("only the verified badge claims verification",
  badgeFor("connected").hint.toLowerCase().includes("verified")
  && !badgeFor("saved").hint.toLowerCase().includes("we made a real"));

eq("only an error needs attention", needsAttention("error"), true);
eq("saved does not nag", needsAttention("saved"), false);
eq("connected does not nag", needsAttention("connected"), false);

/* ──────────────────── the flag must match the implementation ───────────── */

const cat = readFileSync(new URL("../src/lib/integrations.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/integrations/route.ts", import.meta.url), "utf8");

/* Every catalogue entry starts a line with `{ id: "..."`. */
const allIds = [...cat.matchAll(/^\s*\{\s*id:\s*"([a-z0-9_]+)"/gm)].map((m) => m[1]);
const flagged = [...cat.matchAll(/^\s*\{\s*id:\s*"([a-z0-9_]+)"[^\n]*testable:\s*true/gm)].map((m) => m[1]);

/* The switch lives between the function and the POST handler. */
const fnStart = route.indexOf("async function testCredentials");
const fnEnd = route.indexOf("export async function POST");
ok("testCredentials was located in the route", fnStart > -1 && fnEnd > fnStart);
const fnBody = route.slice(fnStart, fnEnd);
const cases = [...fnBody.matchAll(/case "([a-z0-9_]+)":/g)].map((m) => m[1]);

ok("the catalogue parsed", allIds.length > 50, `found ${allIds.length} ids`);
ok("the switch parsed", cases.length > 10, `found ${cases.length} cases`);

const missingFlag = cases.filter((c) => !flagged.includes(c));
const missingCase = flagged.filter((f) => !cases.includes(f));

ok("every provider with a real test case is flagged testable",
  missingFlag.length === 0, `unflagged: ${missingFlag.join(", ")}`);
ok("no provider is flagged testable without a test case",
  missingCase.length === 0, `flagged but untestable: ${missingCase.join(", ")}`);
ok("every case id is a real catalogue provider",
  cases.every((c) => allIds.includes(c)), `unknown: ${cases.filter((c) => !allIds.includes(c)).join(", ")}`);

/*
  And the flag must actually be a minority, or the premise is wrong. If someone
  later flags everything to silence the assertions above, this catches it.
*/
ok("most providers genuinely have no automated test",
  flagged.length < allIds.length / 2, `${flagged.length} of ${allIds.length} flagged`);

/* ───────────────── the route and the UI must use the shared module ─────── */

/*
  NEGATIVE ASSERTIONS RUN ON CODE, NOT ON PROSE.

  The first version of this suite failed — correctly — because the fix's own
  comment QUOTES the expression it replaced ("Was: status: test.ok ? …"). A
  grep for absence cannot tell an explanation of a bug from the bug, and this
  codebase documents what it removes, so every "no longer contains" check here
  would be permanently red for the most honest possible reason.

  readCode() strips comments and asserts that named landmarks survived. The
  naive stripper this used first is documented in scripts/lib/read-code.mjs —
  it ate real JSX in another file, which is how a negative assertion becomes
  one that cannot fail.
*/
const routeCode = readCode(import.meta.url, "../src/app/api/integrations/route.ts", [
  "async function testCredentials",
  "export async function POST",
  'case "stripe"',
]);
ok("the comment stripper actually removed the prose",
  !routeCode.includes("THE \"TEST\" BUTTON NO LONGER CLAIMS"));

ok("the route derives status from the shared module",
  /import\s*\{[^}]*statusFor[^}]*\}\s*from\s*"@\/lib\/integration-status"/.test(routeCode));
ok("the route no longer hardcodes the connected/error ternary",
  !/status:\s*test\.ok\s*\?\s*"connected"\s*:\s*"error"/.test(routeCode),
  "found the old binary status expression in live code");
ok("the route no longer stores test.ok as last_test_ok",
  !/last_test_ok:\s*test\.ok\b/.test(routeCode));
ok("the default branch declares itself unverified",
  /default:\s*return\s*\{\s*ok:\s*true,\s*verified:\s*false/.test(routeCode));
ok("the test op refuses to claim success without verification",
  /ok:\s*test\.verified\s*&&\s*test\.ok/.test(routeCode));

const ui = readCode(import.meta.url, "../src/components/integrations-manager.tsx", ["SYNCABLE", "function test(", "badgeFor("]);
ok("the UI renders the badge from the shared module",
  /import\s*\{[^}]*badgeFor[^}]*\}\s*from\s*"@\/lib\/integration-status"/.test(ui));
ok("the UI no longer decides Live from a status equality check",
  !/conn\.status === "connected" \? "Live"/.test(ui));
ok("the Test button is gated on the testable flag", /i\.testable\s*\?/.test(ui));

/* ────────────────────────────────────────────────────────── report ─────── */

console.log(`\nintegration status: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
console.log(`✓ all green — ${flagged.length} of ${allIds.length} providers are genuinely verifiable`);

/*
  MUTATION LOG — each applied to src/lib/integration-status.ts, suite run,
  reverted.

    M1  `statusFor` returns "connected" when !verified   caught, 3
    M2  `statusFor` drops the !ok guard                  caught, 2
    M3  `lastTestOk` returns `ok` unconditionally        caught, 3
    M4  `lastTestOk` returns false instead of null       caught, 3
    M5  `badgeFor("saved").tone` → "ok"                  caught, 2
    M6  `badgeFor` default branch → tone "ok"            caught, 8
    M7  `badgeFor("error")` → "Live"                     caught, 2
    M8  `needsAttention` returns true for "saved"        caught, 1

  The catalogue/switch cross-check is self-mutating in effect: removing
  `testable: true` from any flagged provider, or adding it to an unflagged one,
  fails it. That was verified by deleting the flag from `stripe` (caught) and
  adding one to `woocommerce` (caught).
*/
