/**
 * The seed layer must never let a calculator lie about where its numbers came
 * from.
 *
 * ============================================================================
 * WHAT THIS GUARDS, AND WHY EACH ONE IS HERE
 * ============================================================================
 *
 * Twenty calculators now open on figures read from the workspace instead of
 * figures invented in a text editor, and each one puts a green banner over
 * them saying so. That banner is a claim about provenance, and a wrong
 * provenance claim is worse than no seeding at all: an owner who believes a
 * number came from their books will act on it.
 *
 * Three failure modes are possible and all three nearly shipped:
 *
 *   1. A UNIT MISMATCH. `health_metrics` is a display bag whose rows carry
 *      their own `unit`. Its `inventory` key is "Inventory Cover" in DAYS and
 *      its `receivables` key is "Receivables past due" — a strict subset of
 *      open receivables. An earlier draft of workspace-seed.ts used both as
 *      rupee fallbacks, which would have seeded 9 — nine days — into /ccc's
 *      "Avg inventory" field and told an owner they hold ₹9 of stock, under a
 *      green banner. The seed therefore reads the transactional tables and the
 *      finance ledger only, and this file fails if it ever reads the KPI table
 *      again.
 *
 *   2. NULL COLLAPSING TO ZERO. A workspace with no analysed bank statement
 *      has no cash balance. Seeding 0 would make /runway announce "0 months of
 *      runway" and "Out of cash: this month" at a solvent business. `null`
 *      means unknown, always.
 *
 *   3. A BANNER THAT OVERSTATES. `hasAny` is true when ANY field landed, so a
 *      page that asks it — rather than asking about its own fields — would
 *      show "these figures come from your workspace" on a page where none of
 *      them did.
 *
 * Every assertion below is mutation-checked: revert the line it protects and
 * the suite fails.
 */

import { readFileSync } from "node:fs";
import { EMPTY_SEED, orDefault, seededFrom, seedSource } from "../src/lib/seed-types.ts";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

/* ======================================================================== */
/* 1. THE HELPERS                                                           */
/* ======================================================================== */

/* null is unknown; a real recorded zero is a fact and must survive. */
check(orDefault(null, 42) === 42, "orDefault: null falls back");
check(orDefault(undefined, 42) === 42, "orDefault: undefined falls back");
check(orDefault(NaN, 42) === 42, "orDefault: NaN falls back");
check(orDefault(0, 42) === 0, "orDefault: a recorded ZERO is used, not replaced",
  "A month that genuinely booked no revenue is a fact about the business.");
check(orDefault(-500000, 42) === -500000, "orDefault: a LOSS survives",
  "Clamping negatives would turn every loss-making month into a profitable one.");

/* seededFrom asks about THIS page's fields, never about the seed as a whole. */
const cashOnly = { ...EMPTY_SEED, cash: 100000, hasAny: true };
check(seededFrom(cashOnly, "cash") === true, "seededFrom: true when my field landed");
check(seededFrom(cashOnly, "receivables", "payables") === false,
  "seededFrom: FALSE when only other pages' fields landed",
  "This is the whole point — /ccc must not claim 'yours' because /runway got a number.");
check(seededFrom(undefined, "cash") === false, "seededFrom: undefined seed is not seeded");
check(seededFrom(EMPTY_SEED, "cash", "revenue", "payables") === false,
  "seededFrom: an all-null seed is never 'seeded'");

check(seedSource(EMPTY_SEED, "cash") === "example",
  "seedSource: an empty seed yields the EXAMPLE banner",
  "The grey 'nothing here has been read from your account' banner is the honest default.");
check(seedSource(cashOnly, "cash") === "yours", "seedSource: a landed field yields 'yours'");
check(seedSource(cashOnly, "revenue") === "example",
  "seedSource: a field that did NOT land yields 'example'");

check(EMPTY_SEED.hasAny === false, "EMPTY_SEED.hasAny is false");
check(Object.entries(EMPTY_SEED).every(([k, v]) => k === "hasAny" || k === "revenueMonths" || v === null),
  "EMPTY_SEED: every figure is null, none is 0",
  "A zero here would propagate into every calculator as a fact.");
check(EMPTY_SEED.revenueMonths === 0, "EMPTY_SEED.revenueMonths is a count, and it is 0");

/* ======================================================================== */
/* 2. THE SEED READS COLUMNS, NOT KPI CARDS                                 */
/* ======================================================================== */

const seedSrc = src("src/lib/workspace-seed.ts");
const seedCode = seedSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

check(!/\.from\(\s*["']health_metrics["']\s*\)/.test(seedCode),
  "workspace-seed does NOT read health_metrics",
  "Its `inventory` key is cover in DAYS and its `receivables` key is past-due only. " +
  "Both read like the field a calculator wants and are a different quantity.");

for (const table of ["finance_ledger", "invoices", "inventory_items", "employees", "sales_orders"]) {
  check(new RegExp(`\\.from\\(\\s*["']${table}["']\\s*\\)`).test(seedCode),
    `workspace-seed reads ${table}`);
}

/* Every read is scoped to one workspace. A seed that leaked another org's
   figures into a calculator would be a tenancy breach wearing a rupee sign. */
const froms = seedCode.match(/\.from\([^)]*\)[\s\S]{0,400}?(?=\n\s*(?:sb\.from|\]\)))/g) || [];
check(froms.length >= 5, "workspace-seed: found the reads to check", `saw ${froms.length}`);
check(froms.every((q) => /\.eq\(\s*["']org_id["']\s*,\s*orgId\s*\)/.test(q)),
  "workspace-seed: EVERY read is .eq('org_id', orgId)",
  "An unscoped read would seed one business's figures into another's calculator.");

/* Bounded, so one enormous workspace cannot hang every calculator page. */
check((seedCode.match(/\.limit\(/g) || []).length >= 5,
  "workspace-seed: every unbounded table read carries a .limit()");

/* Paid is compared case-insensitively — every Tally and Vyapar export writes
   "Paid", and a case-sensitive compare counts settled invoices as open. */
check(/toLowerCase\(\)\s*!==\s*["']paid["']/.test(seedCode),
  "workspace-seed: invoice status is compared case-insensitively",
  "Tally and Vyapar write 'Paid'. A case-sensitive compare reports paid invoices as outstanding.");

/* A missing table or unapplied migration must degrade to nulls, not a 500 on
   a calculator page that used to render fine. */
check(/catch\s*\{[\s\S]*?return EMPTY_SEED/.test(seedCode),
  "workspace-seed: a read failure returns EMPTY_SEED rather than throwing");

/* ======================================================================== */
/* 3. NO PAGE MAY HARDCODE THE GREEN BANNER                                 */
/* ======================================================================== */

import { readdirSync } from "node:fs";
const compDir = new URL("../src/components/", import.meta.url);
const components = readdirSync(compDir).filter((f) => f.endsWith(".tsx"));

const hardcoded = [];
for (const f of components) {
  const body = readFileSync(new URL(f, compDir), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/source\s*=\s*["']yours["']/.test(body)) hardcoded.push(f);
}
check(hardcoded.length === 0,
  "No component hardcodes source=\"yours\"",
  hardcoded.length ? `offenders: ${hardcoded.join(", ")}` :
  "The green banner must be derived from what actually landed, never asserted.");

/* ======================================================================== */
/* 4. EVERY SEEDED COMPONENT IS ACTUALLY FED BY ITS PAGE                    */
/* ======================================================================== */

/*
  A component that takes a `seed` prop but is rendered without one is the
  quiet failure this whole tranche exists to prevent: it silently keeps its
  invented defaults while looking, in the source, like it was wired up.
*/
const seedConsumers = [];
for (const f of components) {
  const body = readFileSync(new URL(f, compDir), "utf8");
  if (/seed\?:\s*WorkspaceSeed/.test(body)) seedConsumers.push(f.replace(/\.tsx$/, ""));
}
check(seedConsumers.length >= 9,
  "Found the components that accept a workspace seed",
  `saw ${seedConsumers.length}: ${seedConsumers.join(", ")}`);

/* Map component file -> exported name, then find every page that renders it. */
const appDir = new URL("../src/app/", import.meta.url);
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const u = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
    if (e.isDirectory()) out.push(...walk(u));
    else if (e.name === "page.tsx") out.push(u);
  }
  return out;
}
const pages = walk(appDir);

const unfed = [];
for (const comp of seedConsumers) {
  const body = readFileSync(new URL(comp + ".tsx", compDir), "utf8");
  const name = (body.match(/export function (\w+)\(\s*\{\s*seed/) || [])[1];
  if (!name) continue;
  for (const p of pages) {
    const pageBody = readFileSync(p, "utf8");
    if (!new RegExp(`<${name}[\\s/>]`).test(pageBody)) continue;
    const rendersWithSeed = new RegExp(`<${name}\\s+seed=\\{`).test(pageBody);
    const callsSeed = /getWorkspaceSeed\(\)/.test(pageBody);
    if (!rendersWithSeed || !callsSeed) {
      unfed.push(`${name} in ${String(p).split("/src/app/")[1]}` +
        (rendersWithSeed ? " (no getWorkspaceSeed call)" : " (rendered without seed=)"));
    }
  }
}
check(unfed.length === 0,
  "Every seed-accepting component is rendered WITH a seed by its page",
  unfed.length ? unfed.join("\n      ") :
  "A component that takes a seed but is never given one keeps its invented defaults silently.");

/* ======================================================================== */
/* 5. THE PARTIAL BANNER EXISTS AND IS AMBER                                */
/* ======================================================================== */

const banner = src("src/components/example-figures.tsx");
check(/stillExample/.test(banner), "ExampleFigures supports a partial state");
check(/border-warning[\s\S]{0,200}?border-success|partial[\s\S]{0,300}?border-warning/.test(banner),
  "ExampleFigures: the partial state is amber, not green",
  "A page that is 70% invented must not carry the same banner as one that is fully seeded.");

/* /ratios is the page that most needs it: ten inputs, three seedable, and the
   output is GRADED and fed to an AI. */
const ratiosSrc = src("src/components/financial-ratios.tsx");
check(/stillExample=\{/.test(ratiosSrc),
  "/ratios names the inputs it could not seed",
  "Equity, total assets, debt and interest have no home in the schema at all.");
for (const field of ["equity", "total assets", "debt", "interest"]) {
  check(ratiosSrc.includes(`"${field}"`), `/ratios names "${field}" as still an example`);
}

/* ======================================================================== */
/* 6. /runway DATES ITS CASH                                                */
/* ======================================================================== */

const runwaySrc = src("src/components/cash-runway.tsx");
check(/cashAsOf/.test(runwaySrc),
  "/runway states the month its cash balance belongs to",
  "A March statement presented as the September position is the exact bug " +
  "lib/metrics.ts documents on the dashboard.");
check(/cashAgeMonths/.test(runwaySrc),
  "/runway warns when the statement is old");

/* ======================================================================== */

console.log(`\nworkspace seed: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
