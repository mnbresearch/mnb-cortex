/*
  READ A SOURCE FILE WITH ITS COMMENTS REMOVED — SAFELY.

  WHY THIS EXISTS, AND THE BUG THAT CAUSED IT.

  Several suites assert that a fixed bug's code is ABSENT ("this file no longer
  contains `status: test.ok ? …`"). This codebase documents what it removes and
  quotes the broken expression verbatim in the comment above the fix, so those
  greps have to run on code with comments stripped or they are permanently red
  for the most honest possible reason.

  The obvious stripper is wrong:

      s.replace(/\/\*[\s\S]*?\*\//g, "")

  components/ai-panel.tsx contains a file input whose `accept` attribute lists
  the MIME wildcard for text — and that slash-star opens a block comment which
  then runs to the next close, silently deleting fifteen lines of real JSX,
  including the very line one suite was asserting the presence of. The suite
  reported a failure for code that was there. It could just as easily have
  reported a PASS for a negative assertion whose subject had been deleted,
  which is a test that cannot fail: strictly worse than no test, because it is
  counted.

  (This very comment hit the same class of problem while being written: the
  first draft quoted the JSX comment delimiters literally and closed itself
  early. Hence the prose.)

  Two defences here, because one was not enough:

    1. A block comment is only stripped when what precedes it on its line is
       nothing but whitespace or an opening brace — i.e. a standalone block
       comment or a JSX-wrapped one. Every block comment in this repo is
       written that way, and a MIME type, a URL or a regex inside an
       expression never is.

    2. `readCode` takes LANDMARKS: snippets that must still be present after
       stripping. A stripper that eats code fails loudly at the point of use
       instead of quietly weakening whatever is asserted next. The instrument
       gets tested before it is trusted.
*/
import { readFileSync } from "node:fs";

/** Strip comments, but only the ones that occupy their own line. */
export function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "*") {
      // What is between the start of this line and here?
      const lineStart = src.lastIndexOf("\n", i - 1) + 1;
      const before = src.slice(lineStart, i);
      const standalone = /^[\s{]*$/.test(before);
      const end = src.indexOf("*/", i + 2);
      if (standalone && end !== -1) {
        // Keep the newlines so reported line numbers stay meaningful.
        out += src.slice(i, end + 2).replace(/[^\n]/g, "");
        i = end + 2;
        continue;
      }
    }
    if (src[i] === "/" && src[i + 1] === "/") {
      const lineStart = src.lastIndexOf("\n", i - 1) + 1;
      if (/^[\s{]*$/.test(src.slice(lineStart, i))) {
        const nl = src.indexOf("\n", i);
        i = nl === -1 ? src.length : nl;
        continue;
      }
    }
    out += src[i++];
  }
  return out;
}

/**
 * Read `rel` (relative to the repo root) with standalone comments removed.
 *
 * `landmarks` are snippets that MUST survive. Pass the things the caller is
 * about to assert around — a function signature, a nearby line — so a stripper
 * fault surfaces here rather than as a silently vacuous assertion later.
 */
export function readCode(baseUrl, rel, landmarks = []) {
  const raw = readFileSync(new URL(rel, baseUrl), "utf8");
  const code = stripComments(raw);
  const missing = landmarks.filter((l) => !code.includes(l));
  if (missing.length) {
    throw new Error(
      `readCode(${rel}): stripping comments removed code that must survive.\n` +
      missing.map((m) => `  missing landmark: ${JSON.stringify(m)}`).join("\n") +
      `\n  (${raw.length} chars in, ${code.length} out)`,
    );
  }
  return code;
}
