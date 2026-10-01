/**
 * A write the screen does not reflect is a lie the product tells.
 *
 * ============================================================================
 * THE SAME DEFECT, FOUR TIMES, ONE CAUSE
 * ============================================================================
 *
 * revalidatePath() marks a ROUTE stale on the server. It does NOT re-render a
 * client component that is already mounted holding its data as a prop, and the
 * client router cache keys on the full URL *including the query string*, which
 * revalidatePath does not carry.
 *
 * That single fact produced four separate "it does nothing" bugs:
 *
 *   /nps        delete removed the row from the database, said "Removed",
 *               and left it on screen.
 *   /captable   same, for saved scenarios.
 *   /decisions  same, latent — nobody had exercised its delete.
 *   /data       deleting an invoice at `?table=invoices&q=ZZ` removed it and
 *               kept displaying it. This is the Data Explorer: the module an
 *               owner uses to clean up a bad import. A Delete button that
 *               appears to do nothing, then says "already gone" on the second
 *               press, reads as a bug in THEIR data.
 *
 * I fixed the first three by hand, one at a time, across three days, without
 * noticing they shared a cause. The fourth is what made the cause visible.
 *
 * ============================================================================
 * WHAT THIS ASSERTS
 * ============================================================================
 *
 * Two routes exist for mutating in this product, and each needs its own rule:
 *
 *   FORM-BASED  — <SafeForm action={...}>. 18 call sites. SafeForm now calls
 *                 router.refresh() after a successful action, once, centrally.
 *                 The rule is that SafeForm keeps doing so.
 *
 *   PROGRAMMATIC — `await someAction(fd)` inside an onClick. Each component
 *                 owns its own refresh. The rule is that any such component
 *                 which also RENDERS server-supplied data must refresh, or
 *                 mirror that data into state and update it optimistically.
 *
 * The second rule is deliberately satisfiable two ways, because they are both
 * genuinely correct and the repo uses both: action-board.tsx mirrors into
 * state, collections-console.tsx refreshes. Demanding one style would force a
 * rewrite of working code to satisfy a checker, which is how checkers get
 * disabled.
 */

import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

function tsx(dir, out = []) {
  for (const e of readdirSync(new URL(dir + "/", ROOT), { withFileTypes: true })) {
    if (e.isDirectory()) tsx(`${dir}/${e.name}`, out);
    else if (/\.tsx$/.test(e.name)) out.push(`${dir}/${e.name}`);
  }
  return out;
}

/* ======================================================================== */
/* 1. THE SHARED WRAPPER                                                    */
/* ======================================================================== */

const safeForm = strip(read("src/components/safe-form.tsx"));
check(/useRouter\(\)/.test(safeForm), "SafeForm holds a router");
check(/router\.refresh\(\)/.test(safeForm),
  "SafeForm refreshes after a successful action",
  "every form-based mutation in the product goes through here; /data's delete " +
  "removed a row and kept showing it because nothing did");

/*
  The refresh must sit AFTER the returned-failure early return. Before it, a
  refusal ("name the client first") would be wiped off the screen by the
  re-render before it could be read.
*/
const okBranch = safeForm.indexOf("router.refresh()");
const failReturn = safeForm.indexOf("result.ok === false");
check(failReturn !== -1 && okBranch > failReturn,
  "and only on success, after the returned-failure branch",
  "refreshing on failure discards the error message");

const safeFormUsers = tsx("src/components").concat(tsx("src/app"))
  .filter((f) => /<SafeForm/.test(read(f)));
check(safeFormUsers.length >= 10,
  "SafeForm is the shared path for form mutations",
  `${safeFormUsers.length} call sites — the reason the fix belongs in one file`);

/* ======================================================================== */
/* 2. PROGRAMMATIC MUTATORS THAT RENDER SERVER DATA                         */
/* ======================================================================== */

const actions = read("src/lib/actions.ts");
const MUTATORS = [...actions.matchAll(/^export async function (\w+)/gm)].map((m) => m[1])
  .filter((n) => /^(save|add|create|update|delete|remove|set|toggle|approve|reject|convert|patch|import|generate|mark|seed|archive|dismiss|assign|record|retry|sync|stop|start|accept|invite|cancel)/i.test(n));

for (const f of tsx("src/components")) {
  const raw = read(f);
  if (!/"use client"/.test(raw.slice(0, 60))) continue;
  const code = strip(raw);

  const programmatic = MUTATORS.filter((m) => new RegExp(`await\\s+${m}\\s*\\(`).test(code));
  if (!programmatic.length) continue;

  /*
    Does it RENDER data the server handed it? A component whose only output
    comes from its own useState — the CSV importer's result, a generated API
    key — has nothing stale to show, and demanding a refresh there would be
    noise.
  */
  const propsMatch = code.match(/export function \w+\(\{([^}]*)\}/);
  const props = propsMatch ? propsMatch[1] : "";
  const serverProps = props.split(",").map((s) => s.split(/[:=]/)[0].trim()).filter(Boolean);
  const rendersAProp = serverProps.some((p) =>
    p && new RegExp(`\\{\\s*${p}[.\\[]|${p}\\.map\\(|${p}\\.length|\\{${p}\\}`).test(code));
  if (!rendersAProp) continue;

  const refreshes = /router\.refresh\(\)/.test(code);
  const mirrors = /useEffect\(\s*\(\)\s*=>\s*\{?\s*set\w+\(/.test(code);
  const navigates = /location\.(href|assign|reload)|router\.(push|replace)/.test(code);

  check(refreshes || mirrors || navigates,
    `${f.replace("src/", "")} reflects its own writes`,
    `calls ${programmatic.join(", ")} and renders server props (${serverProps.join(", ")}) ` +
    `but neither refreshes, mirrors into state, nor navigates away. ` +
    `This is the /nps defect: the write lands, the screen does not change.`);
}

console.log(`\nmutation reflects: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  SafeForm refreshes centrally for ${safeFormUsers.length} form sites; every programmatic mutator that renders server data reflects it.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
