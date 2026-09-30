/**
 * "What Cortex does about it" must be something Cortex does.
 *
 * ============================================================================
 * WHY
 * ============================================================================
 *
 * /industries/[slug] lists this industry's pains and then, under the heading
 * "What Cortex does about it", a ticked list of tools. 108 of them across 27
 * industries. The landing page points at the same data: "the exact problems
 * it watches and the tools it uses to fix them".
 *
 * Some of those hrefs went to `reference` modules — calculators that take
 * numbers you type and watch nothing. A tick beside "Buy vs Lease for fleet"
 * under that heading reads as "Cortex is handling this". It is not; it is a
 * tool the owner drives.
 *
 * Both belong on the page. Rendering them identically was the defect. So
 * every fix must either point at a module that reads the workspace, or carry
 * `calc: true` and be rendered with a chip saying so.
 *
 * Also checks that every href resolves to a real module at all — a fix
 * pointing at a route that does not exist is a 404 under a tick.
 */

import { readFileSync } from "node:fs";
import { INDUSTRIES } from "../src/lib/industries.ts";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const reg = JSON.parse(read("docs/capability-register.json")).modules;

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

let total = 0, calc = 0;
for (const ind of INDUSTRIES) {
  for (const f of ind.fixes) {
    total++;
    const route = String(f.href).replace(/^\//, "").split(/[?#]/)[0];
    const m = reg[route];

    check(!!m, `${ind.slug}: "${f.tool}" points at a module that exists`, `/${route} is not in the capability register`);
    if (!m) continue;

    if (m.depth === "reference") {
      calc++;
      check(f.calc === true,
        `${ind.slug}: "${f.tool}" is marked as a calculator`,
        `/${route} never reads the workspace. Under "What Cortex does about it" that needs \`calc: true\`, ` +
        `or re-point it at a module that does.`);
    } else {
      check(f.calc !== true,
        `${ind.slug}: "${f.tool}" is not mislabelled a calculator`,
        `/${route} is ${m.depth} — it reads real data, so the chip understates it`);
    }
  }
}

/* Both surfaces that render fixes must actually show the distinction. */
for (const [file, what] of [
  ["src/app/industries/[slug]/page.tsx", "the industry page"],
  ["src/components/industry-picker.tsx", "the landing-page picker"],
]) {
  const src = read(file);
  check(/f\.calc/.test(src), `${what} renders the calculator chip`,
    "marking the data without showing it changes nothing for the reader");
}

/*
  The jewellery fix claimed "Live costing with metal/stone rates". The agent
  behind it takes a free-text box the owner types rates into; nothing in this
  repo fetches a metal or stone price. "Live" was the whole claim.
*/
const src = read("src/lib/industries.ts");
check(!/Live costing/.test(src),
  "no fix claims live commodity rates",
  "nothing in this repo fetches a metal or stone price — the rates are typed in");

console.log(`\nindustry fixes: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  ${total} fixes across ${INDUSTRIES.length} industries; ${calc} are calculators and say so.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
