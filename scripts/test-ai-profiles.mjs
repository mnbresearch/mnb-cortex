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
import { readFileSync, mkdtempSync } from "node:fs";
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
const SRC = readFileSync(join(ROOT, "src", "lib", "ai", "cortex.ts"), "utf8");

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
  /thinkingUnsupported = true/.test(SRC) && /buildBody\(false\)/.test(SRC));
check("the retry is remembered, so the probe is paid once not per call",
  /let thinkingUnsupported = false/.test(SRC));
check("an empty model response is logged with its finishReason",
  /finishReason/.test(SRC));

console.log("\nThe profile is actually threaded to the request");
check("generateFor passes a per-mode profile", /runCortex\(\[\{ role: "user", content: user \}\], context, profileFor\(mode\)\)/.test(SRC));
check("runOnce receives it", /runOnce\(provider: string, messages: Msg\[\], context: string, profile: GenProfile\)/.test(SRC));
check("the Gemini body uses it", /maxOutputTokens: profile\.maxOutputTokens/.test(SRC));
check("thinkingConfig carries the profile's budget", /thinkingBudget: profile\.thinkingBudget/.test(SRC));

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
