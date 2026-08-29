#!/usr/bin/env node
/**
 * Industry coverage tests.  Run: npm run test:industries
 *
 * WHY THIS SUITE EXISTS
 *
 * The product's central claim is that it is not a generic dashboard — that it
 * "knows the specific problems of 26+ industries". That promise is delivered by
 * two lists that live in different files and are maintained separately:
 *
 *   src/lib/agents/catalog.ts   the ids a customer can PICK in Settings
 *   src/lib/industries.ts       the playbooks the dashboard RENDERS
 *
 * and they do not use the same identifiers. The picker says `agri`, `beauty`,
 * `healthcare`, `realestate`, `retail`; the playbooks say `agriculture`,
 * `beauty-salon`, `clinic`, `real-estate`, `retail-d2c`. Six of the twenty-six
 * pickable ids do not match their playbook slug at all.
 *
 * Today that works, because INDUSTRY_ALIAS maps every one of them. Nothing
 * enforces it. Add a twenty-seventh industry to the picker, forget the alias,
 * and resolveIndustry() returns undefined — IndustryPlaybook renders NOTHING,
 * silently. No error, no empty state, no log line: the customer simply never
 * sees the tailoring they were sold, and the only way to notice is for somebody
 * to set that industry and look at their own dashboard.
 *
 * So this asserts the property directly: every industry a customer can choose
 * must resolve to a playbook, and every playbook must be reachable.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IND = readFileSync(join(ROOT, "src", "lib", "industries.ts"), "utf8");
const CAT = readFileSync(join(ROOT, "src", "lib", "agents", "catalog.ts"), "utf8");

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

/* ---- Parse what ships, so the test cannot drift from it ------------------ */
const playbookSlugs = [...IND.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
const pickable = [...CAT.matchAll(/\{\s*id:\s*"([a-z0-9-]+)",\s*name:\s*"([^"]+)"/g)]
  .map((m) => ({ id: m[1], name: m[2] }));

const aliasBlock = (IND.match(/const INDUSTRY_ALIAS: Record<string, string> = \{([\s\S]*?)\n\};/) || [])[1] || "";
const alias = {};
for (const m of aliasBlock.matchAll(/"?([a-z0-9-]+)"?\s*:\s*"([a-z0-9-]+)"/g)) alias[m[1]] = m[2];

/** Mirrors resolveIndustry(). */
const resolve = (v) => {
  const k = String(v || "").toLowerCase().trim();
  if (!k) return undefined;
  const slug = alias[k] || k;
  return playbookSlugs.includes(slug) ? slug : undefined;
};

console.log("\nBoth lists parsed");
check(`playbooks found (${playbookSlugs.length})`, playbookSlugs.length >= 20);
check(`pickable industries found (${pickable.length})`, pickable.length >= 20);
check("the alias map parsed", Object.keys(alias).length > 10);

/*
  "generic" is Settings' "Any Business" — a deliberate opt-out with no
  industry-specific playbook, so it is the one id allowed to resolve to nothing.
*/
const OPT_OUT = new Set(["generic"]);

console.log("\nEVERY industry a customer can pick must render a playbook");
{
  const orphans = pickable.filter((p) => !OPT_OUT.has(p.id) && !resolve(p.id));
  if (orphans.length) {
    fail++;
    console.log(`  FAIL  ${orphans.length} pickable industries render no playbook:`);
    for (const o of orphans) console.log(`          ${o.id}  (${o.name}) — add an INDUSTRY_ALIAS entry or a playbook`);
  } else {
    pass++;
    console.log(`  ok    all ${pickable.length - OPT_OUT.size} real industries resolve to a playbook`);
  }
}

console.log("\nThe ids that differ between the two files are aliased");
for (const id of ["agri", "beauty", "healthcare", "realestate", "retail"]) {
  const r = resolve(id);
  check(`'${id}' (picker) resolves to '${r}'`, !!r);
}

console.log("\n'Any Business' opts out deliberately, and is the ONLY id that may");
check("'generic' resolves to no playbook", !resolve("generic"));
check("...and it is the only pickable id that does not resolve",
  pickable.filter((p) => !resolve(p.id)).every((p) => OPT_OUT.has(p.id)));

console.log("\nEvery playbook is reachable from the picker");
{
  const reachable = new Set(pickable.map((p) => resolve(p.id)).filter(Boolean));
  const unreachable = playbookSlugs.filter((s) => !reachable.has(s));
  // Content nobody can select is content nobody will ever see. It is not a
  // crash, but it is written, maintained work that cannot reach a customer.
  if (unreachable.length) {
    fail++;
    console.log(`  FAIL  ${unreachable.length} playbook(s) cannot be selected by any customer:`);
    for (const s of unreachable) console.log(`          ${s}`);
  } else {
    pass++;
    console.log(`  ok    all ${playbookSlugs.length} playbooks are reachable`);
  }
}

console.log("\nEvery playbook is actually usable");
{
  /*
    Each playbook object runs from `slug:` to its closing `outcome:`. An earlier
    version of this split on indentation and mis-parsed every entry, reporting
    stubs that did not exist — a test that cries wolf is worse than no test, so
    the block count is asserted against the slug count to prove the parse held.
  */
  const blocks = [...IND.matchAll(/slug:\s*"([a-z0-9-]+)"[\s\S]*?outcome:\s*"([^"]*)"/g)];
  check(`every playbook parsed (${blocks.length} of ${playbookSlugs.length})`,
    blocks.length === playbookSlugs.length);

  let thin = 0, badHref = 0, noOutcome = 0;
  for (const b of blocks) {
    const body = b[0];
    const fixes = [...body.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
    const pains = [...((body.match(/pains:\s*\[([\s\S]*?)\]/) || [])[1] || "").matchAll(/"[^"]+"/g)];
    if (fixes.length < 2 || pains.length < 2) thin++;
    if (fixes.some((h) => !h.startsWith("/"))) badHref++;
    if (!b[2] || b[2].length < 20) noOutcome++;
  }
  check("no playbook is a stub (every one has 2+ pains and 2+ tools)", thin === 0);
  check("every tool link is an in-app path", badHref === 0);
  check("every playbook states an outcome", noOutcome === 0);
}

console.log("\nEvery industry gets specialist agents, not just the generic set");
{
  /*
    Agents are generated per industry: commonAgents + SPECIAL + visualAgents.
    The common and visual ones are the same tools with the industry's name
    substituted in, so an industry with no SPECIAL entry is offered nothing its
    trade actually runs on — which is the "generic dashboard" this product
    positions itself against. Eight industries shipped that way: retail,
    healthcare, grocery, furniture, printing, footwear, photography and petcare.
  */
  const specialBlock = (CAT.match(/const SPECIAL: Record<string, Agent\[\]> = \{[\s\S]*?\n\};/) || [""])[0];
  const withSpecial = new Set(
    [...specialBlock.matchAll(/\n  "?([a-z0-9-]+)"?:\s*\[/g)].map((m) => m[1]),
  );
  // "generic" is Any Business — by definition it has no specialism.
  const missing = pickable.filter((p) => !OPT_OUT.has(p.id) && !withSpecial.has(p.id));
  if (missing.length) {
    fail++;
    console.log(`  FAIL  ${missing.length} industries have only the generic agent set:`);
    for (const m of missing) console.log(`          ${m.id}  (${m.name})`);
  } else {
    pass++;
    console.log(`  ok    all ${pickable.length - OPT_OUT.size} real industries have specialist agents`);
  }

  // Specialist agents must be wired to their own industry, or agentsForIndustry
  // silently returns them under someone else's tab.
  let misfiled = 0;
  for (const m of specialBlock.matchAll(/\n  "?([a-z0-9-]+)"?:\s*\[([\s\S]*?)\n  \],/g)) {
    const owner = m[1];
    for (const a of m[2].matchAll(/A\("([a-z0-9-]+)"/g)) if (a[1] !== owner) misfiled++;
  }
  check("every specialist agent is filed under its own industry", misfiled === 0);
}

console.log("\nAliases must not point at playbooks that do not exist");
{
  const dangling = Object.entries(alias).filter(([, slug]) => !playbookSlugs.includes(slug));
  if (dangling.length) {
    fail++;
    for (const [k, v] of dangling) console.log(`  FAIL  alias '${k}' points at missing playbook '${v}'`);
  } else { pass++; console.log(`  ok    all ${Object.keys(alias).length} aliases point at real playbooks`); }
}

/* ========================================================================= */
console.log("\nMODULE DISCOVERY: /tools claims to list every capability");
/* ========================================================================= */
{
  /*
    The AI Tools page is subtitled "Every Cortex capability, organised by the job
    it does for you" and listed FIFTEEN of a hundred and twenty-two modules.
    Receivables, payables, P&L, forecasting, RFM, churn, reorder — the things
    people go looking for — were all missing, and the page closed by telling the
    reader to go hunt through the sidebar instead.

    A discovery page that cannot discover is worse than not having one, because
    the reader concludes the product is smaller than it is. It now renders the
    complete index from NAV, which is also why this test checks the SOURCE of
    the list rather than counting cards: a hand-maintained list would drift the
    first time somebody shipped a module in a hurry.
  */
  const nav = readFileSync(join(ROOT, "src", "lib", "nav.ts"), "utf8");
  const toolsPage = readFileSync(join(ROOT, "src", "app", "(app)", "tools", "page.tsx"), "utf8");

  const navHrefs = [...nav.matchAll(/href:\s*"(\/[a-zA-Z0-9/_-]+)"/g)].map((m) => m[1]);
  check(`the sidebar defines modules (${navHrefs.length})`, navHrefs.length > 100);

  check("/tools builds its index from NAV rather than a hand-kept copy",
    /import \{ NAV \} from "@\/lib\/nav"/.test(toolsPage) && /navGroups\.map/.test(toolsPage));

  check("...so every sidebar module is listed on it",
    /NAV\.reduce|for \(const n of NAV\)/.test(toolsPage));

  check("the page no longer tells the reader to go hunt the sidebar",
    !/There are 120\+ in the sidebar/.test(toolsPage));

  // The headline count must come from the data, not a number typed in 2024.
  check("the module count is derived, not hardcoded",
    /\{NAV\.length\} modules/.test(toolsPage));
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
