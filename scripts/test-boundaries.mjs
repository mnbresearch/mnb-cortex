/**
 * The client/server boundary, checked as a module graph.
 *
 * WHY THIS EXISTS.
 *
 * `src/components/gbp-studio.tsx` is a client component and it imported
 * `@/lib/gbp`, which begins `import "server-only"`. That is not a style
 * complaint — `server-only` exists to throw, and Next.js fails the build with
 * "You're importing a component that needs server-only". It survived because
 * NOTHING ELSE CATCHES IT: `tsc --noEmit` passes (the types are real and the
 * import resolves), and every test in this repo passed too. The only thing that
 * would have caught it is a full `next build`, which in this sandbox takes long
 * enough that it is not run on every change.
 *
 * So the check lives here, where it costs a second.
 *
 * It walks the import graph TRANSITIVELY rather than checking direct imports.
 * The fix for the gbp case was to split the client-safe half into
 * `lib/gbp-shared.ts`; a direct-imports-only check would pass that and then miss
 * the obvious regression where `gbp-shared` later imports `gbp` for one helper
 * and quietly re-poisons every component downstream of it.
 *
 * Three things are checked:
 *   1. No client component reaches a `server-only` module by any path.
 *   2. No client component reaches `next/headers` (cookies/headers are
 *      request-scoped and throw in the browser) by any path.
 *   3. Every `@/...` import resolves to a file that exists.
 *
 * (3) is not about the boundary. It is here because a broken path alias is the
 * other build-only failure — TypeScript resolves `@/lib/x` through tsconfig
 * paths and is happy, but a file renamed without updating an importer only
 * explodes at bundle time.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "src");
let pass = 0;
const failures = [];

function ok(name) { pass++; }
function bad(name, detail) { failures.push(`${name}\n      ${detail}`); }
function check(cond, name, detail) { cond ? ok(name) : bad(name, detail); }

/* ---------------------------------------------------------------- collect */

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const src = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

/**
 * Strip comments before looking for imports or directives.
 *
 * Without this the scan reports files whose only mention of "use client" or
 * "server-only" is a comment explaining the boundary — which is exactly what the
 * files fixed by this test now contain. A test that flags its own documentation
 * is a test people switch off.
 */
function strip(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Resolve a `@/x` or relative specifier to a real file on disk. */
function resolveSpec(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // node_modules — not ours to police
  for (const c of [base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c)) return c;
  }
  return { missing: base };
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g;

const imports = new Map();   // file -> [{spec, target}]
const isClient = new Set();
const isServerOnly = new Set();
const isServerAction = new Set();
const usesNextHeaders = new Set();

for (const [f, raw] of src) {
  const code = strip(raw);
  // The directive is only a directive on the FIRST statement of the file.
  if (/^\s*["']use client["']/.test(code)) isClient.add(f);
  if (/^\s*["']use server["']/.test(code)) isServerAction.add(f);
  if (/(^|\n)\s*import\s+["']server-only["']/.test(code)) isServerOnly.add(f);

  const list = [];
  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (spec === "next/headers") usesNextHeaders.add(f);
    const target = resolveSpec(f, spec);
    list.push({ spec, target });
  }
  imports.set(f, list);
}

const rel = (f) => f.slice(ROOT.length - 3);

/* ------------------------------------------------- the parse must be sane */
// Guards. If the scan silently matched nothing, every assertion below would
// "pass" while checking nothing at all — the failure mode that made an earlier
// test in this repo green for the wrong reason.

check(files.length > 200, "scan: found the source tree", `only ${files.length} files under src/`);
check(isClient.size > 20, "scan: found client components", `only ${isClient.size} files with "use client"`);
check(isServerOnly.size >= 3, "scan: found server-only modules", `only ${isServerOnly.size} found`);
check(
  [...imports.values()].reduce((n, l) => n + l.length, 0) > 500,
  "scan: parsed imports",
  "import regex matched almost nothing"
);
// A known-good anchor: this file is server-only and must be seen as such.
check(
  isServerAction.size >= 2,
  "scan: found server-action modules",
  `only ${isServerAction.size} files with "use server" — the cut below would do nothing`
);
check(
  [...isServerOnly].some((f) => f.endsWith("/lib/gbp.ts")),
  "scan: lib/gbp.ts detected as server-only",
  "the directive scan is not seeing a file that definitely has it"
);

/* ----------------------------------------------------- transitive closure */

/*
  A `"use server"` module is where the graph STOPS, not a violation.

  The first version of this test flagged topbar, user-menu, playbooks and four
  others for "reaching server-only code" through `lib/actions.ts`. They do reach
  it, textually — and it is entirely correct. `lib/actions.ts` declares
  `"use server"`, so the bundler replaces each import with an RPC stub and never
  follows it into the browser bundle. That is the standard server-action pattern
  and it is what ships in production today.

  So traversal is cut at a server action, exactly as the bundler cuts it.
  Reporting those seven files would have been a test that cries wolf, and the
  rational response to a test that cries wolf is to stop running it.
*/
function reaches(start, predicate) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop();
    for (const { target } of imports.get(cur) || []) {
      if (!target || target.missing || seen.has(target)) continue;
      if (isServerAction.has(target)) continue;   // RPC boundary; bundler stops here
      if (predicate(target)) return [cur, target];
      seen.add(target);
      stack.push(target);
    }
  }
  return null;
}

for (const c of [...isClient].sort()) {
  const hit = reaches(c, (t) => isServerOnly.has(t));
  check(
    !hit,
    `boundary: ${rel(c)} stays out of server-only code`,
    hit ? `reaches server-only ${rel(hit[1])} via ${rel(hit[0])}` : ""
  );

  const hdr = reaches(c, (t) => usesNextHeaders.has(t));
  check(
    !hdr,
    `boundary: ${rel(c)} stays out of next/headers`,
    hdr ? `reaches next/headers through ${rel(hdr[1])} via ${rel(hdr[0])}` : ""
  );
}

/* -------------------------------------------------------- imports resolve */

let broken = 0;
for (const [f, list] of imports) {
  for (const { spec, target } of list) {
    if (target && target.missing) {
      broken++;
      bad(`import: ${rel(f)}`, `"${spec}" resolves to nothing on disk`);
    }
  }
}
check(broken === 0, "imports: every @/ and relative path resolves", `${broken} broken`);

/* ------------------------------------------------------------------ report */

console.log(`\nboundaries: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
console.log(
  `  ${isClient.size} client components checked transitively against ` +
  `${isServerOnly.size} server-only modules; ${files.length} files scanned.`
);
