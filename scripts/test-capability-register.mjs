/**
 * The register must agree with the code, and no module may quietly get
 * shallower.
 *
 * ============================================================================
 * WHAT THIS IS FOR
 * ============================================================================
 *
 * A census of all 132 modules found a recurring failure that no test could
 * catch, because nothing was broken: pages with correct arithmetic wrapped
 * around invented numbers. /ccc stated "Roughly ₹52,05,479 is tied up in your
 * cycle" from three made-up figures while the real ones sat in the database.
 * /decisions kept a journal in localStorage. /nps promised a trend it had no
 * way to remember.
 *
 * Every one of those passed every suite in the repo. They were engines with no
 * fuel line, and the only way anybody found out was by reading all 132 modules
 * by hand. That is not a thing that happens twice.
 *
 * So the census result is checked in as a snapshot, and this recomputes it
 * from source on every run. Three failures are possible and each is useful:
 *
 *   A NEW MODULE WITH NO ENTRY. Someone shipped a page; the register says so
 *     and asks for one line of thought about what backs it.
 *
 *   A MODULE THAT GOT SHALLOWER. The regression this exists for — a page
 *     losing its database read, its save path, or its seed. Reported first
 *     and loudest, because this is the one that ships silently.
 *
 *   A MODULE THAT GOT DEEPER. Also a failure, deliberately. The snapshot is
 *     only worth having if it is current, and "regenerate and commit" is a
 *     five-second fix that puts the improvement in the diff where a reviewer
 *     sees it.
 *
 * ============================================================================
 * WHAT "reference" DOES NOT MEAN
 * ============================================================================
 *
 * It does not mean broken or unfinished. /epf, /tds, /gst-calc and
 * /advance-tax are pure calculators sitting on shared, heavily tested
 * statutory modules, and that is the right design for them — there is nothing
 * in a workspace that determines the EPF ceiling.
 *
 * The register measures CONNECTEDNESS, not quality. Its value is that a page
 * moving down a category is visible; it is not a scoreboard.
 */

import { readFileSync } from "node:fs";
import { scanAll, DEPTH_RANK } from "./lib/capability-scan.mjs";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

const snapPath = new URL("../docs/capability-register.json", import.meta.url);
let snap;
try {
  snap = JSON.parse(readFileSync(snapPath, "utf8"));
} catch {
  console.log("\ndocs/capability-register.json is missing or unreadable.\n" +
    "Run `npm run capability:snapshot` to create it.\n");
  process.exit(1);
}

const recorded = snap.modules || {};
const actual = scanAll();

/* ---- 1. Coverage --------------------------------------------------------- */

const newRoutes = Object.keys(actual).filter((r) => !recorded[r]);
check(newRoutes.length === 0,
  "every module in the app has a register entry",
  newRoutes.length
    ? `no entry for: ${newRoutes.join(", ")}\n      ` +
      "Run `npm run capability:snapshot` and check the entry says what you expect."
    : "");

const goneRoutes = Object.keys(recorded).filter((r) => !actual[r]);
check(goneRoutes.length === 0,
  "every register entry still corresponds to a module",
  goneRoutes.length
    ? `the register lists routes that no longer exist: ${goneRoutes.join(", ")}\n      ` +
      "If they were removed on purpose, run `npm run capability:snapshot`."
    : "");

/* ---- 2. Regressions, reported first and by name -------------------------- */

const shallower = [];
const deeper = [];
for (const [route, now] of Object.entries(actual)) {
  const was = recorded[route];
  if (!was) continue;
  const d = DEPTH_RANK[now.depth] - DEPTH_RANK[was.depth];
  if (d < 0) shallower.push(`${route}: ${was.depth} → ${now.depth}`);
  else if (d > 0) deeper.push(`${route}: ${was.depth} → ${now.depth}`);
}

check(shallower.length === 0,
  "NO MODULE HAS GOT SHALLOWER",
  shallower.length
    ? shallower.join("\n      ") +
      "\n\n      This is the regression the register exists to catch: a page that " +
      "\n      has lost its connection to the workspace and will now render " +
      "\n      invented numbers, or lose the owner's work, without failing " +
      "\n      anything else. If it is deliberate, regenerate the snapshot and " +
      "\n      say why in the commit message."
    : "");

check(deeper.length === 0,
  "the register is current",
  deeper.length
    ? deeper.join("\n      ") +
      "\n      These modules got DEEPER, which is good — the snapshot is just stale." +
      "\n      Run `npm run capability:snapshot` and commit the diff."
    : "");

/* ---- 3. Per-signal drift, so a partial loss is named --------------------- */

/*
  Depth is a coarse summary and can hide a real loss: a page can keep its
  database read (staying "data-backed") while losing its save path. Each
  boolean is compared on its own for exactly that reason.
*/
const signalLoss = [];
for (const [route, now] of Object.entries(actual)) {
  const was = recorded[route];
  if (!was) continue;
  for (const sig of ["reads", "writes", "ai", "seeded", "saves", "restores", "persists"]) {
    if (was[sig] === true && now[sig] !== true) signalLoss.push(`${route} lost "${sig}"`);
  }
}
check(signalLoss.length === 0,
  "no module has lost an individual capability",
  signalLoss.length
    ? signalLoss.join("\n      ") +
      "\n      A page can keep its depth while losing its save path — that is why " +
      "\n      each signal is checked on its own."
    : "");

/* ---- 4. The snapshot's own totals must not lie --------------------------- */

const counts = {};
for (const r of Object.values(actual)) counts[r.depth] = (counts[r.depth] || 0) + 1;
check(Number(snap.totals?.modules) === Object.keys(actual).length,
  "the register's module count matches reality",
  `register says ${snap.totals?.modules}, scan found ${Object.keys(actual).length}`);
for (const [d, n] of Object.entries(counts)) {
  check(Number(snap.totals?.[d]) === n, `register's "${d}" count is right`,
    `register says ${snap.totals?.[d]}, scan found ${n}`);
}

/* ---- 5. The floor: the pages this tranche connected must stay connected --- */

/*
  Named explicitly rather than left to the snapshot, because these are the ten
  calculators that were the census's worst offenders — correct arithmetic
  wrapped around invented numbers — and the seed layer is new enough to be the
  easiest thing for a future change to drop.
*/
const MUST_BE_SEEDED = [
  "ccc", "runway", "ratios", "pnl", "inventory-turns",
  "ltv", "valuation", "funnel", "saas", "funding",
];
const unseeded = MUST_BE_SEEDED.filter((r) => !actual[r]?.seeded);
check(unseeded.length === 0,
  "the ten seeded calculators still read the workspace",
  unseeded.length
    ? `no longer seeded: ${unseeded.join(", ")}\n      ` +
      "Each of these opened on an invented business before the seed layer. " +
      "Losing the seed puts them back to stating fiction in the second person."
    : "");

/*
  The three pages that used to throw the owner's work away.

  SAVE AND RESTORE ARE CHECKED SEPARATELY, and a mutation is why. With one
  combined `persists` signal, removing /decisions' ability to LOAD its saved
  entries still passed — the component imported the save action, so the signal
  stayed true. That is not a flaw in the mutation; it is exactly the shape /nps
  had before this tranche. A page that writes and cannot read back is
  write-only: the owner's work goes somewhere and never comes home.
*/
const MUST_PERSIST = ["decisions", "captable", "nps"];
const cannotSave = MUST_PERSIST.filter((r) => !actual[r]?.saves);
check(cannotSave.length === 0,
  "the three workbench pages can still save",
  cannotSave.length ? `no longer saving: ${cannotSave.join(", ")}` : "");
const cannotRestore = MUST_PERSIST.filter((r) => !actual[r]?.restores);
check(cannotRestore.length === 0,
  "…and can still read back what was saved",
  cannotRestore.length
    ? `saves but never loads: ${cannotRestore.join(", ")}\n      ` +
      "Write-only is the defect, not half of the fix."
    : "");

/* ---- report -------------------------------------------------------------- */

console.log(`\ncapability register: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  const order = Object.entries(counts).sort((a, b) => DEPTH_RANK[b[0]] - DEPTH_RANK[a[0]]);
  for (const [d, n] of order) console.log(`  ${String(n).padStart(3)}  ${d}`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
