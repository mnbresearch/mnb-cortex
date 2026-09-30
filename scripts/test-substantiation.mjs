/**
 * No public surface may assert a benefit it cannot substantiate.
 *
 * ============================================================================
 * WHY A THIRD CLAIMS SUITE
 * ============================================================================
 *
 * test:claims checks published NUMBERS against their sources and keeps a
 * banned-phrase list. test:derived-counts checks that counts are derived.
 * Neither catches the shape of defect this file is about: a number that has
 * no source anywhere, invented in a text editor, and rendered as though it
 * were measured.
 *
 * The repo has now removed three of these:
 *
 *   "₹8.4L recovered"                  deleted (no measurement behind it)
 *   three named testimonials            deleted (fabricated)
 *   45% of reporting hours saved,       this pass — they were the two
 *   3% of revenue from better decisions constants in roi-calculator.tsx,
 *                                       printed as large bold figures on
 *                                       the public pricing page
 *
 * All three were written in good faith as illustration and all three read as
 * fact to a visitor. ASCI expects substantiation on demand for exactly this;
 * more to the point, this product's whole pitch is that it does not tell you
 * things that are not true.
 *
 * ============================================================================
 * AND THE PRIVACY CLAIM
 * ============================================================================
 *
 * A page may only say "nothing is stored" if nothing on that page is stored.
 * /health-check said "we keep nothing" on the same screen as a form that
 * POSTs name, email and phone to /api/inquiry, which inserts them into
 * `leads`. Under the DPDP Act that is a notice failure, not a wording nit —
 * so any page making an absolute no-storage claim must have no lead form, or
 * must scope the claim and carry a consent control.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));

/* Every public page, plus the components only they render. */
function publicFiles(dir = "src/app", out = []) {
  for (const e of readdirSync(new URL(dir + "/", ROOT), { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === "(app)" || e.name === "api") continue;   // signed-in and server routes
      publicFiles(`${dir}/${e.name}`, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(`${dir}/${e.name}`);
  }
  return out;
}
const SURFACE = [
  ...publicFiles(),
  "src/components/roi-calculator.tsx",
  "src/components/pricing-client.tsx",
  "src/components/health-check-client.tsx",
].filter((p) => existsSync(new URL(p, ROOT)));

check(SURFACE.length > 10, "the public surface was found", `${SURFACE.length} files`);

/* ======================================================================== */
/* 1. THE TWO CONSTANTS, BY NAME                                            */
/* ======================================================================== */

const roi = strip(read("src/components/roi-calculator.tsx"));
check(!/\*\s*0?\.45\b/.test(roi), "the 45% reporting-hours constant is gone",
  "hrs * 0.45 * 52 asserted a 45% time saving with nothing behind it");
check(!/\*\s*0?\.03\b/.test(roi), "the 3%-of-revenue decision-uplift constant is gone",
  "rev * 100 * 0.03 asserted a revenue uplift with nothing behind it");
check(!/decisionValue/.test(roi), "the decision-upside output is removed, not reworded",
  "no input a visitor could supply turns 'better decisions are worth 3% of revenue' into their claim rather than ours");
check(/setShare|share/.test(roi),
  "the saving fraction is an input the visitor sets",
  "the output must be arithmetic on numbers they chose");
check(/PLANS/.test(roi), "the money side of the tool quotes a real price",
  "so it cannot drift from the pricing table beside it");

/* ======================================================================== */
/* 2. NO NEW UNSOURCED PERFORMANCE CLAIMS ANYWHERE PUBLIC                   */
/* ======================================================================== */

/*
  Deliberately narrow. This looks for the specific sentence shapes that make
  an outcome promise — "save 40%", "recover 3x", "cut costs by half" — and
  not for every digit followed by a percent sign, because plan allowances,
  GST rates and interest rates are all legitimately percentages. A checker
  that flags `18%` on a GST page is one nobody runs twice.
*/
const OUTCOME = [
  /\b(save|saves|saving|cut|cuts|reduce|reduces|boost|boosts|increase|increases|improve|improves|recover|recovers|grow|grows)\b[^.<>{}]{0,40}\b\d{1,3}\s*%/i,
  /\b\d{1,3}\s*%\b[^.<>{}]{0,30}\b(faster|cheaper|more|less|fewer|higher|lower|saving|savings|uplift|increase|reduction)\b/i,
  /\b\d+(\.\d+)?\s*x\b[^.<>{}]{0,30}\b(faster|more|better|return|roi)\b/i,
];
for (const f of SURFACE) {
  const src = strip(read(f));
  for (const re of OUTCOME) {
    const m = src.match(re);
    check(!m, `no unsourced outcome claim in ${f}`,
      m ? `"${m[0].trim().slice(0, 90)}" — if this is real, cite the measurement; if it is illustrative, make it an input the visitor sets` : "");
  }
}

/* ======================================================================== */
/* 3. ABSOLUTE PRIVACY CLAIMS MUST MATCH THE PAGE THEY SIT ON               */
/* ======================================================================== */

const ABSOLUTE = /\b(nothing is stored|we keep nothing|we store nothing|nothing is saved|we save nothing)\b/i;
for (const f of SURFACE) {
  const src = strip(read(f));
  const hit = src.match(ABSOLUTE);
  if (!hit) continue;
  check(false, `${f} makes an absolute no-storage claim`,
    `"${hit[0]}" — scope it to the part that is true. /health-check said this on the same screen as a form ` +
    `that inserts name, email and phone into \`leads\`.`);
}

/*
  Any public form collecting contact details needs a consent control and a
  link to the policy — the standard /pricing already met and /health-check
  did not.
*/
const CONTACT = /type="email"|placeholder="Work email"|placeholder="Phone/i;
/*
  AUTHENTICATION IS NOT LEAD CAPTURE.

  My first pass flagged /login, which has an email field inside a form and
  therefore matched. Demanding a marketing-consent checkbox before someone
  can sign in to an account they already pay for would be absurd, and the
  legal basis is different: signing in is the performance of a contract the
  user has already entered, not the collection of a prospect's details for
  marketing. A checker that demands the absurd is one people learn to
  silence, so it is excluded by name rather than by loosening the rule.
*/
const AUTH_PAGES = /\/(login|signup|auth|reset|forgot|verify|accept)\//;
for (const f of SURFACE) {
  const src = read(f);
  if (AUTH_PAGES.test(f)) continue;
  if (!CONTACT.test(src)) continue;
  if (!/<form/.test(src)) continue;
  check(/type="checkbox"[^>]*required|required[^>]*type="checkbox"/.test(src),
    `${f} has a required consent checkbox on its contact form`);
  check(/href="\/privacy"/.test(src),
    `${f} links to the privacy policy from that form`);
}

/* ======================================================================== */
/* 4. NO PRICE COMPARISON AGAINST OTHER CATEGORIES                          */
/* ======================================================================== */

const compare = strip(read("src/app/compare/page.tsx"));
check(!/"Monthly cost"/.test(compare),
  "the comparison table no longer rates competitors' pricing",
  "plans run ₹4,999–₹39,999/mo; a row placing Cortex below a CRM was not defensible");
check(!/fraction of the cost/i.test(compare),
  "and makes no 'fraction of the cost' claim against a named alternative");
check(/characterisation|our characterisation/i.test(compare),
  "the table says which column this repo can be held to",
  "a grid of ticks reads as measured fact about all five columns otherwise");

console.log(`\nsubstantiation: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  ${SURFACE.length} public files: no unsourced outcome claim, no absolute storage claim, every contact form consented.`);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
