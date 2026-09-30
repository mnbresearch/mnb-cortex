/**
 * A calculator that CAN read your workspace must read it.
 *
 * ============================================================================
 * THE CLAIM
 * ============================================================================
 *
 * /features says, over a grid that includes "28 Business Calculators":
 *
 *   "Nothing here needs setting up and nothing needs learning — they read the
 *    same numbers you already sent."
 *
 * When that was written, 28 of the 132 modules in the capability register were
 * `reference`: pure client components that open on an invented business and
 * never touch a row the customer imported. /networth greeted an owner with a
 * ₹1.5 crore cash balance and a ₹30 lakh term loan belonging to nobody.
 *
 * Nine of them had an exact or near-exact source already sitting in
 * WorkspaceSeed. Those nine now read it. This suite stops them drifting back.
 *
 * ============================================================================
 * WHY A LIST AND NOT "ALL OF THEM"
 * ============================================================================
 *
 * The other nineteen are NOT failures. /sip, /rentvsbuy and /buyvslease are
 * what-if tools about decisions nobody has made yet; /gst-calc computes tax on
 * an arbitrary amount you type; /gratuity needs one employee's last drawn
 * basic, which this product does not store. Seeding those would mean inventing
 * a plausible number and calling it the customer's — which is precisely the
 * defect this whole exercise removed.
 *
 * So the list below is an allow-list of "provably seedable", and the check is
 * that each of them IS seeded. Adding a route here is a claim that its inputs
 * exist in the workspace; leaving one out is a claim that they do not.
 */

import { readFileSync, existsSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

/* route -> the component it renders, and the seed field(s) it must consume. */
const SEEDED = {
  "dscr":        { cmp: "dscr-calc",         fields: ["ebitdaAnnual"] },
  "breakeven":   { cmp: "breakeven-mix",     fields: ["opex"] },
  "rate-card":   { cmp: "rate-card",         fields: ["opex"] },
  "payroll":     { cmp: "payroll-calc",      fields: ["monthlyPayroll", "headcount"] },
  "networth":    { cmp: "networth-builder",  fields: ["cash", "receivables", "inventoryValue", "payables"] },
  "markup":      { cmp: "markup-margin",     fields: ["avgOrderValue", "cogs", "revenue"] },
  "discount":    { cmp: "discount-impact",   fields: ["avgOrderValue", "cogs", "revenue"] },
  "tax":         { cmp: "tax-estimator",     fields: ["netProfitAnnual"] },
  "advance-tax": { cmp: "advance-tax",       fields: ["netProfitAnnual"] },
};

for (const [route, { cmp, fields }] of Object.entries(SEEDED)) {
  const pagePath = `src/app/(app)/${route}/page.tsx`;
  const cmpPath = `src/components/${cmp}.tsx`;
  if (!existsSync(new URL(pagePath, ROOT))) { failures.push(`${route}: page missing`); continue; }
  if (!existsSync(new URL(cmpPath, ROOT))) { failures.push(`${route}: ${cmpPath} missing`); continue; }

  const page = read(pagePath);
  const cmpSrc = read(cmpPath);
  /*
    COMMENTS STRIPPED BEFORE CHECKING WHAT THE CODE CONSUMES.

    The first version of the `consumes seed.X` check ran `cmpSrc.includes(f)`
    against the raw file. Mutation M1 — deleting `orDefault(seed?.ebitdaAnnual,
    3_600_000)` and hardcoding the number back — PASSED, because the block
    comment I had written directly above it explains at length why
    ebitdaAnnual is the right field. The guard was reading the prose that
    justifies the code instead of the code.

    Exactly the failure documented in scripts/lib/sql-schema.mjs: "Comments
    are prose about the code, not the code."
  */
  const cmpCode = cmpSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  check(/await getWorkspaceSeed\(\)/.test(page), `/${route} page fetches the workspace seed`);
  check(/seed=\{seed\}/.test(page), `/${route} passes the seed to its component`);
  check(/export default async function/.test(page), `/${route} page is async`);

  check(/seed\?\s*:\s*WorkspaceSeed/.test(cmpCode), `${cmp} declares the seed prop`);
  /*
    THE FIELD MUST BE READ, NOT MERELY MENTIONED.

    Two rounds of my own false negatives shaped this:

      1. `cmpCode.includes(f)` against the raw file matched the block comment
         explaining why the field was chosen (fixed by stripping comments).

      2. It then STILL passed when I deleted `orDefault(seed?.ebitdaAnnual, …)`
         and hardcoded the number back — because the field name survives as a
         string literal inside `seedSource(seed, "ebitdaAnnual")`.

    The second is the more alarming of the two. That exact state — the value
    reverted to an example while the banner still asks about the field — is a
    page showing invented figures under a label that says "from your
    workspace". A false "yours" is worse than an honest "example", which is
    the whole thesis of lib/seed-types.

    So the requirement is a property read: `seed?.field` or, where a helper
    takes the seed under another name, `s?.field`. A string literal will not
    satisfy `?.` + the field name.
  */
  for (const f of fields) {
    check(new RegExp(`\\?\\.${f}\\b`).test(cmpCode), `${cmp} reads seed.${f} as a value`,
      `the route is listed as seedable from ${f}. Naming it in seedSource() is not enough — ` +
      `that labels the figures "yours" while showing an example.`);
  }

  /*
    THE BANNER IS NOT OPTIONAL.

    A calculator showing real figures and a calculator showing invented ones
    look identical. Every seeded page in this repo carries <ExampleFigures>,
    whose entire job is to say which of the two the reader is looking at —
    and the rule established in lib/seed-types is that it must be asked about
    THIS page's fields, never about the seed as a whole, or a workspace that
    supplied only employees gets told its cash figures are its own.
  */
  check(/<ExampleFigures/.test(cmpCode), `${cmp} tells the reader whose numbers these are`);
  check(/source=\{/.test(cmpCode), `${cmp} passes a source to ExampleFigures`,
    "without a source the banner always says 'example' and the seeding is invisible");
  check(!/source=\{seedSource\(seed\)\}/.test(cmpCode) && !/seed\?\.hasAny/.test(cmpCode),
    `${cmp} scopes the banner to its own fields, not seed.hasAny`);
}

/* ======================================================================== */
/* The register must agree — it is what /features' claim is audited against  */
/* ======================================================================== */

const reg = JSON.parse(read("docs/capability-register.json"));
for (const route of Object.keys(SEEDED)) {
  const m = reg.modules[route];
  check(!!m && m.seeded === true,
    `the capability register records /${route} as seeded`,
    m ? `depth=${m.depth} seeded=${m.seeded} — run \`npm run capability:snapshot\`` : "absent from the register");
  check(!!m && m.depth !== "reference",
    `/${route} is no longer classified as a static reference page`,
    m ? `depth=${m.depth}` : "");
}

/*
  A ratchet, not a target. The count of static pages may fall as more become
  seedable; it must never rise, because rising means a page that read the
  customer's data stopped doing so.
*/
const referenceNow = Object.values(reg.modules).filter((m) => m.depth === "reference").length;
check(referenceNow <= 19,
  "the number of pages that never read the workspace has not grown",
  `${referenceNow} reference modules; it was 28 before this pass and 19 after`);

console.log(`\ncalculator seeding: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  ${Object.keys(SEEDED).length} calculators read the workspace and say so; ${referenceNow} remain deliberately static.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
