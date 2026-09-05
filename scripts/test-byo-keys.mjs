/**
 * Bring-your-own AI key: it must actually be used, and never billed twice.
 *
 * WHAT THIS FEATURE CHANGES, AND WHY IT NEEDS PINNING.
 *
 * Until now every AI call in the product read `process.env.GEMINI_API_KEY` —
 * one platform key, ours, for every customer. That is disqualifying for any
 * buyer with their own AI governance or a data-processing agreement: they
 * cannot let a vendor pick which model sees their ledger, and their prompts
 * have to go to THEIR provider account under their own retention terms.
 *
 * The key now travels in request-scoped storage (lib/ai/byo.ts), loaded once by
 * chargeForMode() because that is the only place on all 27 AI paths that
 * already knows the workspace. That indirection is what makes the change small,
 * and it is also what makes it easy to break silently: if a single AI call site
 * goes back to reading process.env directly, that customer's prompts quietly
 * start flowing through our account again and nothing anywhere says so.
 *
 * So the assertions below are about two properties:
 *
 *   1. No AI module reads a provider key from the environment directly.
 *   2. A workspace on its own key is charged NO AI credits — because the model
 *      cost is already theirs, and charging as well is charging twice for one
 *      call.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}\n      ${d}`));

const root = resolve(import.meta.dirname, "..");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ---------------------------------------------------------------- 1. routing */

/*
  The provider keys. Any direct `process.env.X` read in an AI module bypasses
  the workspace's key — comments are stripped first, because several of these
  files legitimately DISCUSS the env vars in prose.
*/
const PROVIDER_ENVS = ["GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GOOGLE_API_KEY"];

const AI_MODULES = [
  "src/lib/ai/cortex.ts", "src/lib/ai/image.ts", "src/lib/ai/video.ts", "src/lib/ai/visibility.ts",
];

for (const f of AI_MODULES) {
  const code = strip(readFileSync(join(root, f), "utf8"));
  for (const e of PROVIDER_ENVS) {
    check(!new RegExp(`process\\.env\\.${e}\\b`).test(code),
      `${f} does not read process.env.${e} directly`,
      "that bypasses the workspace's own key and silently routes their prompts through our account — use aiKey()");
  }
  check(/aiKey\(/.test(code), `${f} resolves keys through aiKey()`);
}

/* The resolver must prefer the workspace's key, or the whole feature is a no-op. */
const BYO = strip(readFileSync(join(root, "src/lib/ai/byo.ts"), "utf8"));
check(/const own = currentOrgAiKeys\(\)\.keys\[envName\]/.test(BYO),
  "aiKey() looks at the workspace key first");
check(/return envKey\(envName\)/.test(BYO),
  "…and falls back to the platform key",
  "a workspace with no key of its own must keep working exactly as before");
check(/own && own\.trim\(\)\.length >= 20/.test(BYO),
  "a too-short workspace value is ignored rather than used",
  "a half-pasted key would otherwise take down that customer's AI with a 401");

/* ------------------------------------------------- 2. the key must be loaded */

const CREDITS = strip(readFileSync(join(root, "src/lib/credits.ts"), "utf8"));
check(/loadOrgAiKeys/.test(CREDITS) && /enterOrgAiKeys/.test(CREDITS),
  "chargeForMode loads the workspace's keys into scope",
  "this is the single hook on all 27 AI paths; without it aiKey() only ever sees the platform key");

/*
  Ordering matters and is easy to get wrong in a later edit: the keys must be
  loaded BEFORE the credit decision, because whose key it is determines what we
  may charge.
*/
const iLoad = CREDITS.indexOf("loadOrgAiKeys");
const iCharge = CREDITS.indexOf("byo.own");
check(iLoad > 0 && iCharge > iLoad,
  "keys are loaded before the credit decision is made",
  "the charge depends on whose key it is, so resolving it afterwards would always bill the customer");

/* ------------------------------------------- 3. never charged twice */

check(/if \(byo\.own\)/.test(CREDITS) && /cost: 0/.test(CREDITS),
  "a workspace on its own key is charged zero credits",
  "every number in CREDIT_COSTS is derived from OUR model cost; when the customer pays the provider directly, charging credits as well is charging twice for one call");

check(/"own-key"/.test(CREDITS),
  "the zero charge is a distinguishable reason, not silence",
  "usage screens and support need to be able to tell 'free because BYO' from 'free because metering broke'");

const GUARD = strip(readFileSync(join(root, "src/lib/api-guard.ts"), "utf8"));
check(/own-key/.test(GUARD),
  "creditDenial cannot render an out-of-credits error to a BYO workspace",
  "telling an enterprise on their own key that they are out of credits is both wrong and the kind of billing message that loses the account");

/* ------------------------------------------------- 4. it is reachable */

const CATALOGUE = readFileSync(join(root, "src/lib/integrations.ts"), "utf8");
check(/id: "ai"/.test(CATALOGUE), "the AI provider entry exists in the catalogue");
check(/id: "ai".*minPlan: "starter"/s.test(CATALOGUE.slice(CATALOGUE.indexOf('id: "ai"'), CATALOGUE.indexOf('id: "ai"') + 400)),
  "BYO keys are available on the LOWEST plan",
  "a workspace on its own key costs us nothing in model spend — gating it would be charging for the privilege of saving us money");

const ROUTE = strip(readFileSync(join(root, "src/app/api/integrations/route.ts"), "utf8"));
check(/case "ai":/.test(ROUTE), "the Test button has a real implementation for AI keys");
check(/verifyProviderKey/.test(ROUTE),
  "…that makes a real provider call",
  "a test that only checks the string is non-empty tells someone they are connected and lets them find out otherwise from an empty report three days later");
check(/id !== "ai" && !existing/.test(ROUTE),
  "BYO AI keys do not count against the integration quota");
check(/Object\.keys\(creds\)\.length/.test(ROUTE),
  "an empty submit is refused rather than stored as 'connected'",
  "every AI field is optional, so without this a blank form would show connected while every call fell back to the platform key");

check(readFileSync(join(root, "src/lib/nav.ts"), "utf8").includes('href: "/connect"'),
  "there is a Connect entry in the navigation");
check(readFileSync(join(root, "src/app/(app)/dashboard/page.tsx"), "utf8").includes("ConnectBanner"),
  "and an entry point on the dashboard");

/* ------------------------------------------- 5. the key never leaves the server */

const PAGE = readFileSync(join(root, "src/components/connect-keys.tsx"), "utf8");
check(/type="password"/.test(PAGE), "key inputs are password fields");
check(/setVals\(\{\}\)/.test(PAGE),
  "the key is dropped from component state once saved",
  "there is no reason to keep it in the browser after it is stored");
check(!/defaultValue=\{.*key/.test(PAGE),
  "a stored key is never rendered back into the form",
  "not even masked — a masked value is still a value that was sent to a browser, and nobody needs to READ their own key out of our UI");

const ERASURE = readFileSync(join(root, "src/lib/erasure.ts"), "utf8");
check(/integrations:/.test(ERASURE) && /REDACT/.test(ERASURE),
  "integration credentials are redacted from the workspace export");

console.log(`\nbyo-keys: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  Workspace keys win over the platform key, are never double-billed, and never reach the browser.");
