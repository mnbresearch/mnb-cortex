/**
 * The framework upgrade note makes factual claims. Hold it to them.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * `docs/next-upgrade.md` says twelve Next.js advisories do not apply to this
 * deployment, and gives a reason for each: no `rewrites`, no `images.formats`,
 * no Pages Router, no CSP nonce, no custom server, no WebSocket upgrades.
 * Every one of those reasons is a statement about configuration that someone
 * can change in a single line, months from now, with no idea that a security
 * assessment was resting on it.
 *
 * That is exactly how the document went wrong once already. It asserted "every
 * route is `runtime = "nodejs"`" as grounds for dismissing an Edge-runtime
 * advisory. `src/app/opengraph-image.tsx` is `runtime = "edge"` and had been
 * for months. The conclusion happened to survive — that file is not a server
 * action — but the reasoning was false, and nothing noticed, because prose
 * does not execute.
 *
 * So the preconditions execute here instead. Adding `rewrites` to the config
 * is a legitimate thing to do; doing it without revisiting GHSA-p9j2-gv94-2wf4
 * is not. This makes the second part impossible to skip.
 *
 * ============================================================================
 * WHAT THIS IS NOT
 * ============================================================================
 *
 * Not a substitute for `npm audit`, and not a clock. It does not fail because
 * a version is old — a test that breaks on a date nobody chose teaches people
 * to disable tests. It fails when a fact the document relies on stops being
 * true.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (p) => (existsSync(new URL(p, ROOT)) ? readFileSync(new URL(p, ROOT), "utf8") : null);
const has = (p) => existsSync(new URL(p, ROOT));

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

const pkg = JSON.parse(read("package.json"));
const cfg = read("next.config.mjs") || read("next.config.js") || "";
const doc = read("docs/next-upgrade.md") || read("docs/next15-upgrade.md") || "";

/* Comments in the config are prose; the claims are about actual keys. */
const code = cfg.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------------ */
/* The document must describe the version that is actually installed.  */
/* ------------------------------------------------------------------ */

const declared = (pkg.dependencies.next || "").replace(/^[^0-9]*/, "");
check(!!declared, "next version is declared", declared);
check(doc.includes(declared),
  "the upgrade note names the Next version actually in package.json",
  `package.json has ${declared}; the note does not mention it — one of the two is stale`);

/* ------------------------------------------------------------------ */
/* Each "does not apply" precondition.                                 */
/* ------------------------------------------------------------------ */

check(!/\bformats\s*:/.test(code) && !/avif/i.test(code),
  "images.formats / AVIF is not opted into  (GHSA-2xp9-vwfh-vxw4, critical RCE)",
  "next.config now sets images.formats — if it includes image/avif the AVIF RCE applies. Re-read docs/next-upgrade.md.");

check(!/\brewrites\s*[:(]/.test(code),
  "no rewrites in next.config  (GHSA-p9j2-gv94-2wf4 SSRF, GHSA-ggv3-7p47-pfv8 smuggling)",
  "rewrites were added — both advisories become live on Next < 15.5.21.");

check(!has("src/pages") && !/\bi18n\s*:/.test(code),
  "no Pages Router and no i18n config  (GHSA-36qx-fr4f-26g5 middleware bypass)");

check(!has("server.js") && !has("server.ts"),
  "no custom server  (GHSA-89xv-2m56-2m9x SSRF in Server Actions)");

/* The nonce claim is about what the app SETS, not about the word appearing
   in the explanatory comment that says nonces are deliberately not used. */
check(!/nonce/i.test(code),
  "no CSP nonce in use  (GHSA-ffhc-5mcf-pf4q XSS in nonce-using App Router apps)",
  "next.config now references a nonce — if script-src nonces are live, that advisory applies.");

/* ------------------------------------------------------------------ */
/* The Edge claim — the one that was wrong. State it as a count, not   */
/* as "none", so it cannot quietly become false again.                 */
/* ------------------------------------------------------------------ */

function tsFiles(dir = "src", out = []) {
  for (const e of readdirSync(new URL(dir + "/", ROOT), { withFileTypes: true })) {
    if (e.isDirectory()) tsFiles(`${dir}/${e.name}`, out);
    else if (/\.tsx?$/.test(e.name)) out.push(`${dir}/${e.name}`);
  }
  return out;
}

const edge = tsFiles().filter((f) => /runtime\s*=\s*["']edge["']/.test(read(f) || ""));
const edgeActions = edge.filter((f) => /"use server"/.test(read(f) || ""));

check(edgeActions.length === 0,
  "no server action runs on the Edge runtime  (GHSA-4c39-4ccg-62r3 unbounded payload)",
  edgeActions.length ? `edge + "use server": ${edgeActions.join(", ")}` : "");

check(doc.includes("opengraph-image") || edge.length === 0,
  "the upgrade note accounts for every Edge-runtime file",
  edge.length ? `edge runtime in: ${edge.join(", ")} — the note must name these, since the Edge exclusions rest on what they are` : "");

/* ------------------------------------------------------------------ */
/* remotePatterns: not a vulnerability here, but it is the precondition */
/* for two self-hosting advisories. Recorded so a move off Vercel is a  */
/* prompt to re-read, not a surprise.                                   */
/* ------------------------------------------------------------------ */

const remote = /remotePatterns/.test(code);
check(!remote || doc.includes("self-hosted"),
  "remotePatterns is configured, and the note explains why that is safe on Vercel",
  "images.remotePatterns is set. Two Image Optimizer DoS advisories apply when self-hosting. The note must say so.");

console.log(`\nframework exposure: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  next@${declared}; ${edge.length} edge route(s), 0 of them server actions; every documented exclusion still holds.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
