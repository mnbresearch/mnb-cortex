/**
 * Every model id we send to Google must be one Google actually serves.
 *
 * WHY THIS IS A TEST.
 *
 * A wrong model id is invisible until it reaches production, and then it is
 * total: `gemini-2.0-flash` was hardcoded in three files, Google shut it down,
 * and every chat, report, Deep Dive and agent call started returning
 *
 *     404 — "This model models/gemini-2.0-flash is no longer available."
 *
 * while the retry wrapper reported it to the customer as "the engine is busy
 * (rate limit)". The entire AI half of the product was dead and the error
 * message actively pointed away from the cause.
 *
 * Nothing in TypeScript can catch that — a model id is a string. So the ids are
 * pinned here against a list transcribed from ai.google.dev, WITH the date it
 * was checked, so that adding one is a deliberate act and the list's staleness
 * is visible rather than assumed.
 *
 * WHAT THIS TEST CANNOT DO.
 *
 * It cannot know that Google retired something yesterday. That is what the
 * CANDIDATES-not-a-single-name design in models.ts is for: the caller walks the
 * list on a 404, so a retirement degrades to the next model instead of taking
 * the product down. This test guards the other failure — an id that was never
 * real in the first place, which no amount of fallback can save, because every
 * entry in the list would have to be wrong in the same way to notice.
 *
 * ALSO CHECKED: that a retired model cannot creep back in, and that the
 * candidate lists are ordered cheapest-capable-first, since the first entry is
 * what almost every call actually pays for.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}\n      ${d}`));

/*
  Transcribed from https://ai.google.dev/gemini-api/docs/models and
  .../docs/pricing — CHECKED 5 SEPTEMBER 2026.

  If this list is more than a few months old when you read it, re-check it
  rather than trusting it. Anything not here is either retired or invented, and
  the point of the list is that you cannot tell which from the code.
*/
const CHECKED_ON = "2026-09-05";

const LIVE_TEXT = new Set([
  "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash",
  "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview",
  "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro",
  // Aliases. Deliberately allowed, but never FIRST — see the ordering check.
  "gemini-flash-latest",
]);

const LIVE_IMAGE = new Set([
  "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image", "gemini-2.5-flash-image",
]);

const LIVE_VIDEO = new Set([
  "veo-3.1-generate-preview", "veo-3.1-fast-generate-preview",
  "veo-3.1-lite-generate-preview", "gemini-omni-1.1-flash",
]);

/* Explicitly shut down by Google. These must never reappear. */
const RETIRED = new Set([
  "gemini-2.0-flash", "gemini-2.0-flash-lite",
  "gemini-3.1-flash-lite-preview", "gemini-3-pro-preview",
  "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro",
  // Never-real names that a previous version of this file guessed at.
  "gemini-2.5-flash-image-preview", "imagen-4.0-generate",
]);

const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "models-"));

try {
  execFileSync(join(root, "node_modules", ".bin", "tsc"),
    ["src/lib/ai/models.ts", "--outDir", out, "--module", "esnext", "--target", "es2022",
     "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: root, stdio: "pipe" });
} catch (e) {
  console.error("Could not compile src/lib/ai/models.ts\n" + (e.stdout || e).toString().slice(0, 600));
  process.exit(1);
}

/* Import the REAL functions, with no env pin, so we see the shipped defaults. */
delete process.env.GEMINI_MODEL;
delete process.env.GEMINI_IMAGE_MODEL;
const { geminiTextModels, geminiImageModels } =
  await import(pathToFileURL(join(out, "models.js")).href);

const text = geminiTextModels();
const image = geminiImageModels();

check(text.length >= 3, "parse: text candidates", `${text.length}`);
check(image.length >= 2, "parse: image candidates", `${image.length}`);

for (const m of text) {
  check(LIVE_TEXT.has(m), `text model "${m}" is a model Google serves`,
    `not in the list checked on ${CHECKED_ON} — either it is invented, or the list is stale and needs re-checking against ai.google.dev`);
  check(!RETIRED.has(m), `text model "${m}" is not retired`,
    "a retired id 404s on every call, and the retry wrapper reports it as a rate limit");
}
for (const m of image) {
  check(LIVE_IMAGE.has(m), `image model "${m}" is a model Google serves`);
  check(!RETIRED.has(m), `image model "${m}" is not retired`);
}

/* --------------------------------------------------- the video candidates */

const VIDEO_SRC = readFileSync(join(root, "src/lib/ai/video.ts"), "utf8");
const vidList = VIDEO_SRC.match(/const fallbacks = \[([^\]]+)\]/);
check(!!vidList, "parse: veo candidate list");
if (vidList) {
  const models = [...vidList[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  check(models.length >= 1, "parse: found veo models", `${models.length}`);
  for (const m of models) {
    check(LIVE_VIDEO.has(m), `veo model "${m}" is a model Google serves`,
      `not in the list checked on ${CHECKED_ON}`);
  }
  /* Veo is billed per SECOND and is by far the most expensive thing we call.
     Standard is 8x Lite; putting it first would be a four-figure monthly
     mistake on one active account. */
  check(!models.includes("veo-3.1-generate-preview") || models[0] !== "veo-3.1-generate-preview",
    "Veo Standard is not the default",
    "at $0.40/s it is 8x Lite and 4x Fast; an 8s clip costs ~₹306 against a credit price of ~₹36");
}

/* ------------------------------------------------------ ordering and cost */

/*
  The first candidate is what essentially every call pays for — the rest only
  run after a 404. So the order is a pricing decision, not a preference.
  Output price per 1M tokens, ai.google.dev, checked 2026-09-05:
*/
const OUT_PRICE = {
  "gemini-3.8-flash": 3.75, "gemini-3.7-flash": 3.75, "gemini-3.6-flash": 3.75,
  "gemini-3.5-flash": 9.00, "gemini-3.5-flash-lite": 2.50, "gemini-2.5-flash": 2.50,
  "gemini-flash-latest": 9.00,   // unknown by definition; costed pessimistically
};

const priced = text.filter((m) => OUT_PRICE[m] !== undefined);
check(priced.length === text.length, "every text candidate has a known price",
  `unpriced: ${text.filter((m) => OUT_PRICE[m] === undefined).join(", ")}`);

check(OUT_PRICE[text[0]] <= 3.75,
  `the default text model is not an expensive one — got "${text[0]}" at $${OUT_PRICE[text[0]]}/1M out`,
  "the first entry is what nearly every call pays; an expensive default is a silent margin leak");

check(text[text.length - 1] === "gemini-flash-latest",
  "the floating alias is LAST",
  "`-latest` hot-swaps under us with two weeks' notice; it is a safety net, not a default we choose");

/*
  An alias must never be the primary. It can change model — and therefore price
  and behaviour — without a deploy, which is exactly what you do not want in
  front of a metered, margin-constrained product.
*/
check(!/latest/.test(text[0]), "the default is a pinned version, not an alias");

/* -------------------------------------- the retirement defence must exist */

const SRC = readFileSync(join(root, "src/lib/ai/models.ts"), "utf8");
check(/GEMINI_MODEL/.test(SRC), "a model can be pinned by env without a deploy",
  "when Google breaks something at 2am, changing an env var is the fastest fix available");
check(text.length >= 3, "there is more than one fallback",
  "a single hardcoded name is how the whole AI layer died last time");

/* And the pin must actually take effect, not just be read. */
{
  process.env.GEMINI_MODEL = "gemini-2.5-flash";
  const out2 = mkdtempSync(join(tmpdir(), "models2-"));
  execFileSync(join(root, "node_modules", ".bin", "tsc"),
    ["src/lib/ai/models.ts", "--outDir", out2, "--module", "esnext", "--target", "es2022",
     "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: root, stdio: "pipe" });
  const m2 = await import(pathToFileURL(join(out2, "models.js")).href);
  const pinned = m2.geminiTextModels();
  check(pinned[0] === "gemini-2.5-flash", "GEMINI_MODEL actually moves to the front",
    `got ${pinned[0]}`);
  check(new Set(pinned).size === pinned.length, "…without duplicating itself in the fallbacks",
    pinned.join(", "));
  delete process.env.GEMINI_MODEL;
}

/* ========================================================================= */
/*  THE OTHER THREE PROVIDERS — which this suite never looked at             */
/* ========================================================================= */
/*
  Everything above is Google. The summary line below used to read "all live
  as of <date>" on the strength of that alone, while the Anthropic, Groq and
  OpenAI defaults sat unchecked in eight inline call sites. Two of them were
  dead by the time anybody looked:

    claude-3-5-sonnet-20241022   retired 2025-10-28 — every request errors
    llama-3.3-70b-versatile      decommissioned by Groq 2026-08-16 — 404

  Both are reachable through bring-your-own-key, which is sold. A customer
  pasting a valid Groq key and no GROQ_MODEL got a hard failure on every AI
  action in the product, from a key that was perfectly good.

  They now live in one module, and this is what keeps it honest.
*/
{
  const md = readFileSync(join(root, "src/lib/ai/model-defaults.ts"), "utf8");

  /* Models each provider has withdrawn. Add to this list rather than quietly
     editing a default: a name here is a fact somebody verified. */
  const PROVIDER_RETIRED = new Map([
    ["claude-3-5-sonnet-20241022", "Anthropic retired it on 2025-10-28"],
    ["claude-3-5-sonnet-20240620", "Anthropic retired the 3.5 Sonnet family"],
    ["claude-3-opus-20240229", "Anthropic deprecated Opus 3"],
    ["llama-3.3-70b-versatile", "Groq decommissioned it on 2026-08-16"],
    ["llama-3.1-70b-versatile", "Groq decommissioned it earlier"],
    ["gpt-4-vision-preview", "OpenAI withdrew the preview"],
  ]);

  const defaults = [...md.matchAll(/export const ([A-Z_]+_DEFAULT_MODEL)\s*=\s*"([^"]+)"/g)]
    .map((m) => ({ name: m[1], model: m[2] }));

  check(defaults.length === 3, "all three provider defaults are declared in one module",
    defaults.map((d) => `${d.name}=${d.model}`).join(" "));

  for (const d of defaults) {
    check(!PROVIDER_RETIRED.has(d.model),
      `${d.name} "${d.model}" is not a withdrawn model`,
      PROVIDER_RETIRED.get(d.model) || "");
  }

  /* No inline model id may creep back into a call site. That is how six
     copies of a dying Groq model came to exist. */
  const inline = [];
  for (const f of ["priorities", "gst", "visibility", "act", "bankstatement", "cortex"]) {
    const src = readFileSync(join(root, `src/lib/ai/${f}.ts`), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/process\.env\.(GROQ_MODEL|ANTHROPIC_MODEL|OPENAI_MODEL)\s*\|\|\s*"([^"]+)"/g)) {
      inline.push(`lib/ai/${f}.ts: ${m[1]} || "${m[2]}"`);
    }
  }
  check(inline.length === 0,
    "no call site hardcodes its own provider model fallback",
    inline.length ? inline.join("\n      ") + "\n      Use model-defaults.ts — six copies is six things to update." : "");

  /* The stamp goes stale, because a model list is a claim about the world.
     Twelve months, matching how fast these providers actually retire things:
     the Groq model here lasted about twenty months. */
  const stamp = (md.match(/MODEL_DEFAULTS_CHECKED_ON = "(\d{4})-(\d{2})-(\d{2})"/) || []);
  check(stamp.length === 4, "model-defaults carries a verification date");
  if (stamp.length === 4) {
    const months = (Date.now() - Date.parse(`${stamp[1]}-${stamp[2]}-${stamp[3]}`)) / (30.44 * 86_400_000);
    check(months < 12,
      "the provider defaults were verified within twelve months",
      `stamp reads ${stamp[1]}-${stamp[2]}-${stamp[3]} — ${Math.round(months)} months ago. ` +
      "Re-check each provider's deprecation page and move the date.");
  }
}

console.log(`\nmodels: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`  ${text.length} text, ${image.length} image candidates — all live as of ${CHECKED_ON}; default "${text[0]}".`);
console.log(`  Anthropic, Groq and OpenAI defaults checked too — those were never in scope before, and two were dead.`);
