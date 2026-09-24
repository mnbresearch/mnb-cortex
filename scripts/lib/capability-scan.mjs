/**
 * What each module ACTUALLY does, computed from source.
 *
 * ============================================================================
 * WHY THIS IS A SCANNER AND NOT A DOCUMENT
 * ============================================================================
 *
 * A census of all 132 modules found a recurring shape: a page with correct,
 * well-tested arithmetic wrapped around values that were invented. /ccc told
 * an owner "Roughly ₹52,05,479 is tied up in your cycle" from three made-up
 * figures while `invoices` and `inventory_items` sat one query away. /decisions
 * kept a journal in localStorage. /nps promised a trend it could not remember.
 *
 * None of those pages was broken, so nothing failed. They were engines with no
 * fuel line, and the only way anyone found out was by reading all 132 of them.
 *
 * A hand-written register would have the same problem: it would be a claim
 * about the code, maintained separately from the code, and it would drift —
 * which is precisely the defect class it exists to catch. So nothing here is
 * asserted by hand. Every field is DERIVED from the source, and the checked-in
 * snapshot is compared against a fresh scan on every run.
 *
 * The consequence is the point: a change that makes a page shallower shows up
 * as a diff in docs/capability-register.json, in the same commit, where a
 * reviewer sees it. Nobody has to notice.
 *
 * ============================================================================
 * WHAT IS AND IS NOT CLAIMED
 * ============================================================================
 *
 * These signals are STRUCTURAL. "reads the workspace" means the page reaches a
 * database read; it does not mean the numbers are right. Correctness is what
 * the other twenty suites are for. This one answers a narrower question that
 * no other test asks: is this page connected to anything?
 *
 * Resolution follows imports ONE hop from the page — into the components and
 * lib modules it names — because that is where the fuel line either exists or
 * does not. Going deeper would mark every page "reads" via some transitive
 * utility and the signal would go flat.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const APP = join(ROOT, "src/app/(app)");

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

/** Comments are prose about the code, not the code. Strip before matching. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every page.tsx under the app group, as a route path. */
export function routes() {
  const out = [];
  (function walk(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
      else if (e.name === "page.tsx") out.push(rel || "/");
    }
  })(APP, "");
  return out.sort();
}

/**
 * Resolve the local files a source file imports, one hop.
 *
 * Only "@/..." specifiers — a node_modules import cannot be the reason a page
 * is connected to the workspace.
 */
function localImports(src, seen = new Set()) {
  const files = [];
  for (const m of src.matchAll(/from\s+"(@\/[^"]+)"/g)) {
    const rel = m[1].replace(/^@\//, "src/");
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const p = join(ROOT, rel + ext);
      if (existsSync(p) && !seen.has(p)) { seen.add(p); files.push(p); break; }
    }
  }
  return files;
}

/**
 * A `fetch("/api/…")` is an import too.
 *
 * WITHOUT THIS THE REGISTER WAS WRONG, not merely coarse. /act drafts and
 * sends outreach through `fetch("/api/act")` and came back "reference" — the
 * same classification as a static rate table. /plan calls /api/priorities and
 * came back "browser-only" on the strength of the localStorage it uses to
 * remember which items are ticked.
 *
 * Both are among the deepest pages in the product, and a baseline that files
 * them at the bottom is worse than no baseline: it makes the register
 * something a reader learns to distrust, which is exactly how the hand-written
 * version would have failed.
 *
 * Client components reach the server through a route handler far more often
 * than through a direct import, so the handler is where their fuel line is.
 */
function apiRoutes(src, seen = new Set()) {
  const files = [];
  for (const m of src.matchAll(/fetch\(\s*[`"'](\/api\/[a-zA-Z0-9\-_/[\]]+)/g)) {
    /* Trim query strings and dynamic segments down to a directory that exists. */
    const parts = m[1].replace(/^\//, "").split("/").filter(Boolean);
    while (parts.length > 1) {
      const p = join(ROOT, "src/app", parts.join("/"), "route.ts");
      if (existsSync(p)) {
        if (!seen.has(p)) { seen.add(p); files.push(p); }
        break;
      }
      parts.pop();
    }
  }
  return files;
}

/* ---- the signals ------------------------------------------------------- */

/** Reaches a Supabase read, or one of lib/data.ts's readers. */
const READS = /\.from\(\s*["'][a-z_]+["']\s*\)|getUserAndOrg\(|serviceClient\(|fetchRows\(/;

/** Writes something back to the workspace. */
const WRITES = /\.(insert|update|upsert|delete)\(/;

/** Calls a model. */
const AI = /"\/api\/ai"|generateFor\(|withOrgAiKeys\(|callModel\(/;

/** Opens on figures read from the workspace rather than invented ones. */
const SEEDED = /getWorkspaceSeed\(|seed\?:\s*WorkspaceSeed/;

/**
 * The owner can save their own work.
 *
 * SPLIT FROM `restores` DELIBERATELY, and a mutation test is why. I first had
 * one `persists` signal matching both the save action and the load function,
 * then mutated /decisions to stop loading its saved entries — and the register
 * passed, because the component still imported the save action.
 *
 * That is not a flaw in the mutation; it is the exact shape /nps had before
 * this tranche. A page that can write and cannot read back is write-only: the
 * owner's work goes somewhere and never comes home. Conflating the two hides
 * the defect the register is for.
 */
const SAVES = /saveWorkbenchEntry\(|saveArtifact\(|saveQuote\(/;

/**
 * …and sees it again on the next visit.
 *
 * CALL SITES ONLY, and a second mutation is why. My first version also matched
 * `from("strategy_docs")` and the bare loader names — so a page that merely
 * IMPORTED lib/workbench.ts (for `canSaveWorkbench`, say) inherited the signal
 * from the library's own body, and removing the page's actual load call still
 * passed.
 *
 * A signal you get for importing a module is not a signal about the page. The
 * lookbehind excludes the `export async function listWorkbench…` declarations
 * in the library itself, so only a real invocation counts.
 */
const RESTORES = /(?<!function\s)\b(listWorkbench|latestWorkbench|listQuotes)\s*[<(]/;

/** Work kept in the browser only — the shape /decisions used to have. */
const LOCAL_ONLY = /localStorage\.(set|get)Item/;

/**
 * Scan one route and report what it is connected to.
 *
 * `depth` is a summary of the signals, in the order that matters to an owner:
 * does it know my business, does it remember what I do, or is it a reference
 * page? Deliberately coarse — a finer scale would invite argument about
 * borderline cases and the value here is catching a page that falls a whole
 * category, not one that shifts by a shade.
 */
export function scanRoute(route) {
  const pagePath = join(APP, route, "page.tsx");
  const pageSrc = read(pagePath);
  const seen = new Set([pagePath]);

  /* The page, everything it imports directly, and every API route those
     components call. One more hop from there, then stop: going deeper marks
     every page "reads" through some shared utility and the signal goes flat. */
  const directPaths = localImports(pageSrc, seen);
  const sources = [pageSrc, ...directPaths.map(read)];
  const handlerPaths = sources.flatMap((s) => apiRoutes(s, seen));
  const handlers = handlerPaths.map(read);
  const deep = [...sources, ...handlers].flatMap((s) => localImports(s, seen)).map(read);
  const all = strip([...sources, ...handlers, ...deep].join("\n"));
  const shallow = strip(sources.join("\n"));

  /*
    CALLER-SIDE SOURCES ONLY: the page, its components, and its route
    handlers — never src/lib.

    Two mutations were needed to arrive at this. `restores` first leaked in
    through `from("strategy_docs")` appearing anywhere in the transitive set,
    then through lib/workbench.ts's OWN internal call
    (`latestWorkbench` calls `listWorkbench`), so removing the page's load
    still scored true.

    The distinction that matters: the library PROVIDES the capability, the page
    either USES it or does not. Scanning the provider for evidence about the
    consumer is how a register ends up reporting a fuel line that was cut.
  */
  const callerPaths = [...directPaths, ...handlerPaths].filter((p) => !p.includes("/src/lib/"));
  const caller = strip([pageSrc, ...callerPaths.map(read)].join("\n"));

  const reads = READS.test(all);
  const writes = WRITES.test(all);
  const ai = AI.test(all);
  const seeded = SEEDED.test(shallow);
  const saves = SAVES.test(caller);
  const restores = RESTORES.test(caller);
  /** Kept for the summary: the owner's work survives only if BOTH are true. */
  const persists = saves && restores;
  /* Only counts when nothing else stores the work. A page that saves to the
     workspace AND caches a draft locally is not a localStorage-only page. */
  const localOnly = LOCAL_ONLY.test(all) && !saves && !writes;

  const depth =
    localOnly ? "browser-only"
    : (reads && writes) ? "data-backed"
    : reads ? "reads-only"
    : seeded ? "seeded"
    : ai ? "ai-only"
    : "reference";

  return { route, depth, reads, writes, ai, seeded, saves, restores, persists };
}

/** The whole register, as a plain object keyed by route. */
export function scanAll() {
  const out = {};
  for (const r of routes()) out[r] = scanRoute(r);
  return out;
}

/**
 * Depth ordering, for the one-way rule the test enforces.
 *
 * A route may gain capability freely. LOSING one is the regression this whole
 * mechanism exists to surface, so it has to be deliberate: the snapshot must
 * be regenerated in the same commit, and the diff says which page got
 * shallower and by how much.
 */
export const DEPTH_RANK = {
  "reference": 0,
  "browser-only": 1,
  "ai-only": 2,
  "seeded": 3,
  "reads-only": 4,
  "data-backed": 5,
};
