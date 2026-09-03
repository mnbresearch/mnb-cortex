#!/usr/bin/env node
/**
 * AI generation-profile tests.  Run: npm run test:ai-profiles
 *
 * WHY THIS SUITE EXISTS
 *
 * The dashboard pulse took 27.9s and 38.9s against a real workspace, to produce
 * what its own prompt describes as "a 3-sentence executive pulse".
 *
 * Current Gemini Flash models think before answering, and nothing in this
 * codebase told them how much. Every call went out with one config — a
 * three-sentence pulse and a full strategic deep dive alike — so the model
 * deliberated at length before writing a word anyone would see.
 *
 * The second-order problem is worse than the latency. THINKING TOKENS COUNT
 * AGAINST maxOutputTokens. The old cap was 1024, so a model that thinks for
 * 1024 tokens has nothing left and returns an EMPTY answer — a documented
 * failure mode of Gemini 2.5/3 Flash. It would strike precisely on the hardest
 * questions, the ones worth thinking about, and present as the AI silently
 * returning nothing.
 *
 * These tests pin the invariants that keep both problems fixed: every profile
 * must leave real room for an answer after thinking is paid for, the modes
 * users wait on must be the fast ones, and the deep modes must actually be
 * allowed to reason.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/*
  cortex.ts imports "server-only" and the env/model helpers, which will not load
  outside Next. The profile table is plain data, so it is extracted from the
  source rather than imported — this still tests what ships, and cannot drift,
  because a rename breaks the parse and fails the suite.
*/
const SRC = readFileSync(join(ROOT, "src", "lib", "ai", "generation.ts"), "utf8");
const CORTEX = readFileSync(join(ROOT, "src", "lib", "ai", "cortex.ts"), "utf8");

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

function profileConst(name) {
  const m = SRC.match(new RegExp(`const ${name}: GenProfile = \\{([^}]+)\\}`));
  if (!m) return null;
  const max = Number((m[1].match(/maxOutputTokens:\s*(\d+)/) || [])[1]);
  const think = Number((m[1].match(/thinkingBudget:\s*(\d+)/) || [])[1]);
  return { maxOutputTokens: max, thinkingBudget: think };
}

const FAST = profileConst("FAST");
const STANDARD = profileConst("STANDARD");
const DEEP = profileConst("DEEP");

console.log("\nThe three profiles exist and parse");
check("FAST is defined", !!FAST);
check("STANDARD is defined", !!STANDARD);
check("DEEP is defined", !!DEEP);
if (!FAST || !STANDARD || !DEEP) { console.log("\ncannot continue\n"); process.exit(1); }

console.log("\nThinking must never be able to eat the whole answer");
for (const [name, p] of [["FAST", FAST], ["STANDARD", STANDARD], ["DEEP", DEEP]]) {
  // The bug: thinkingBudget == maxOutputTokens leaves zero tokens to answer with.
  check(`${name} leaves room to answer after thinking (${p.maxOutputTokens} > ${p.thinkingBudget})`,
    p.maxOutputTokens > p.thinkingBudget);
  // A margin, not a technicality: at least half the budget must remain.
  check(`${name} keeps at least half its budget for the answer`,
    p.maxOutputTokens - p.thinkingBudget >= p.maxOutputTokens / 2);
  check(`${name} raised the cap above the old 1024 that caused empty responses`,
    p.maxOutputTokens > 1024);
}

console.log("\nProfiles are ordered: fast < standard < deep");
check("FAST thinks less than STANDARD", FAST.thinkingBudget < STANDARD.thinkingBudget);
check("STANDARD thinks less than DEEP", STANDARD.thinkingBudget < DEEP.thinkingBudget);
check("DEEP has the most room to answer", DEEP.maxOutputTokens >= STANDARD.maxOutputTokens);

console.log("\nthinkingBudget must not be 0");
{
  /*
    Gemini 3 Flash and Flash-Lite do not support turning thinking off. Asking
    for 0 on such a model is a 400 on EVERY call — a total AI outage dressed as
    an optimisation.
  */
  for (const [name, p] of [["FAST", FAST], ["STANDARD", STANDARD], ["DEEP", DEEP]])
    check(`${name} asks for a small budget, not an unsupported zero`, p.thinkingBudget > 0);
}

console.log("\nThe modes users actually wait on are the fast ones");
{
  const table = (SRC.match(/const MODE_PROFILE: Record<string, GenProfile> = \{([\s\S]*?)\n\};/) || [])[1] || "";
  const assigned = Object.fromEntries(
    [...table.matchAll(/^\s*([a-zA-Z_]+):\s*(FAST|STANDARD|DEEP)/gm)].map((m) => [m[1], m[2]]),
  );
  check("the dashboard pulse is FAST — it is the one on screen with a spinner",
    assigned.pulse === "FAST");
  check("scenario stress-testing is DEEP", assigned.scenario === "DEEP");
  check("forecasting is DEEP", assigned.forecast === "DEEP");
  check("at least three modes are pinned FAST",
    Object.values(assigned).filter((v) => v === "FAST").length >= 3);
  check("no mode is left pointing at a profile that does not exist",
    Object.values(assigned).every((v) => ["FAST", "STANDARD", "DEEP"].includes(v)));
}

console.log("\nUnknown modes fall back rather than throwing");
check("profileFor defaults to STANDARD for an unlisted mode",
  /return MODE_PROFILE\[mode\] \|\| STANDARD;/.test(SRC));

console.log("\nThe 400 fallback that stops this becoming an outage");
check("a rejected thinkingConfig is retried without it",
  /thinkingUnsupported = true/.test(CORTEX) && /buildBody\(false\)/.test(CORTEX));
check("the retry is remembered, so the probe is paid once not per call",
  /let thinkingUnsupported = false/.test(CORTEX));
check("an empty model response is logged with its finishReason",
  /finishReason/.test(CORTEX) || /finishReason/.test(SRC));

console.log("\nThe profile is actually threaded to the request");
check("generateFor passes a per-mode profile", /runCortex\(\[\{ role: "user", content: user \}\], context, profileFor\(mode\)\)/.test(CORTEX));
/*
  Asserts the PROPERTY (runOnce takes the profile, in that position) rather than
  pinning the entire signature. The original pattern ended at `GenProfile)` and
  so broke the moment a fifth parameter was added for the tool-calling org —
  reporting a failure about token budgets for a change that had nothing to do
  with them. A test should fail when the thing it names is wrong, not when an
  unrelated parameter appears next to it.
*/
check("runOnce receives it", /runOnce\(provider: string, messages: Msg\[\], context: string, profile: GenProfile/.test(CORTEX));
check("…and the profile is still passed at the call site", /runOnce\(provider, messages, context2, profile/.test(CORTEX));
check("the Gemini body uses it", /generationConfig\(profile, \{ temperature/.test(CORTEX));
check("thinkingConfig carries the profile's budget", /thinkingBudget: profile\.thinkingBudget/.test(SRC));

/* ========================================================================= */
console.log("\nEVERY Gemini call site must use the shared budget, not its own");
/* ========================================================================= */
{
  /*
    cortex.ts was fixed first, and SIX other files turned out to be making their
    own Gemini requests with hand-written config and no thinking budget:
    visibility (900 and 1200), act (900), priorities (1024), gst (2048),
    bankstatement (4096).

    visibility is the one that does real damage. It asks an answer engine
    whether a business gets recommended and then looks for the brand in the
    reply. An empty reply contains no brand, so the product reports "you are not
    recommended" — a false negative on the number that feature exists to
    produce, indistinguishable from a true one.
  */
  const dir = join(ROOT, "src", "lib", "ai");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "generation.ts" && f !== "models.ts");
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    if (!/generativelanguage\.googleapis\.com|geminiUrl/.test(src)) continue;   // not a Gemini caller
    // A literal token cap means the call invented its own budget.
    if (/maxOutputTokens:\s*\d+/.test(src)) offenders.push(f);
  }
  if (offenders.length) {
    fail++;
    console.log(`  FAIL  ${offenders.length} Gemini caller(s) still hand-roll their own budget:`);
    for (const o of offenders) console.log(`          lib/ai/${o}`);
  } else {
    pass++;
    console.log("  ok    no Gemini caller in lib/ai hand-rolls its own token budget");
  }

  const gen = SRC;
  check("EXTRACT exists for document parsing, where output matters more than thinking",
    /export const EXTRACT: GenProfile/.test(gen));
  check("...and it leaves far more room to answer than to think",
    (() => {
      const m = gen.match(/EXTRACT: GenProfile = \{ maxOutputTokens: (\d+), thinkingBudget: (\d+) \}/);
      return m && Number(m[1]) >= Number(m[2]) * 4;
    })());
  check("generationConfig always attaches a thinking budget",
    /thinkingConfig: \{ thinkingBudget: profile\.thinkingBudget \}/.test(gen));
  check("callers cannot override the budget away via `extra`",
    /\.\.\.extra,\n\s*maxOutputTokens/.test(gen));
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
