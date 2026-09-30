/**
 * Every test:* script must be reachable from `npm test`.
 *
 * ============================================================================
 * WHY
 * ============================================================================
 *
 * Eight suites written in a single day — workspace-seed, workbench,
 * advance-tax, register, windowed-reads, auth-entry, upsert-arbiters and
 * schema-conformance — were all absent from the aggregate `test` script. Each
 * one was run by hand when it was written and then never again. That is worse
 * than not having written them: the repo looks covered, CI is green, and the
 * suite protecting the advance-tax engine has not executed since the day it
 * was authored.
 *
 * The failure is structural, not careless. Adding a script to package.json is
 * one edit; adding it to a 78-item `&&` chain is a second edit nobody is
 * reminded to make. So this asserts the two stay in step — a new suite that
 * is not wired in fails immediately, while the author still has the context
 * to wire it in.
 */

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const declared = Object.keys(pkg.scripts).filter((s) => s.startsWith("test:"));
const wired = new Set(
  (pkg.scripts.test || "")
    .split("&&")
    .map((s) => s.trim().replace(/^npm run /, ""))
);

const orphans = declared.filter((s) => !wired.has(s));

/* The reverse direction too: `npm test` naming a script that no longer
   exists fails the whole chain with an opaque npm error. */
const dangling = [...wired].filter((s) => s && !pkg.scripts[s]);

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

check(declared.length > 50, "the suites are declared", `${declared.length} test:* scripts`);
check(orphans.length === 0,
  "every test:* script runs as part of `npm test`",
  orphans.length ? `orphaned: ${orphans.join(", ")}` : "");
check(dangling.length === 0,
  "`npm test` names no script that does not exist",
  dangling.length ? `dangling: ${dangling.join(", ")}` : "");

console.log(`\nsuite coverage: ${pass} passed, ${failures.length} failed`);
if (!failures.length) console.log(`  all ${declared.length} suites reachable from \`npm test\`.`);
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
