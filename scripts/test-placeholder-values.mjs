/**
 * Placeholder text must be a placeholder, never a value.
 *
 * ============================================================================
 * WHAT THIS CAUGHT
 * ============================================================================
 *
 * /quote and /invoice both opened with fields pre-filled like this:
 *
 *   useState({ name: "Your Company Pvt Ltd", detail: "GSTIN · Mumbai · …" })
 *   useState({ name: "Client Name" })
 *   useState({ name: "Customer Name" })
 *   useState([{ desc: "Service / product", qty: 1, rate: 50000 }])
 *   useState({ gstin: "27ABCDE1234F1Z5" })        // a fabricated GSTIN
 *
 * They read as placeholders. They are VALUES. Nothing clears on focus, and
 * the save path's own guard — `if (!party) return fail(...)` — is satisfied,
 * because "Client Name" is not empty.
 *
 * So an owner who pressed Save without editing got:
 *
 *   · a quotation addressed to a customer called "Client Name"
 *   · for a line item called "Service / product"
 *   · headed "Your Company Pvt Ltd" rather than their own business
 *   · and on /invoice, carrying a format-valid GSTIN belonging to nobody
 *
 * and `Invoice it` then turned that into a REAL RECEIVABLE, which ages
 * towards overdue, counts in DSO and the ageing buckets, feeds the 13-week
 * cash forecast, and can be named by the dashboard's "worst overdue invoice"
 * warning as though it were a genuine debtor.
 *
 * The seller block is worse than a cosmetic default: the workspace has known
 * the real company name since signup and simply never read it here.
 *
 * ============================================================================
 * WHY A TEST AND NOT JUST A FIX
 * ============================================================================
 *
 * A default value is the single easiest thing to add while building a form —
 * it makes the screenshot look finished. This is the second time the pattern
 * reached production (the demo-seeder contamination was the first). A rule
 * that lives only in someone's memory is a rule that comes back.
 */

import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

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

/*
  The shapes a human reads as "fill me in". Deliberately a NAMED list rather
  than a clever heuristic: a checker that guesses produces false alarms on
  legitimate defaults ("INR", "18", "Monthly"), and a false alarm here costs
  more than the bug, because the fix is to delete a default somebody chose.
*/
/*
  STRING LITERALS ARE MATCHED WITH `[^"]*`, NOT `[^"]{2,80}`.

  My first version used `/"([^"]{2,80})"/g` to pull quoted values out of a
  useState default, reasoning that a 0- or 1-character string could not be
  placeholder prose. That is true of the VALUES and false of the PARSE: a
  minimum length makes the regex skip empty strings, and skipping one throws
  every subsequent quote pair out of alignment.

  In `{ name: orgName || "", gstin: "27ABCDE1234F1Z5", addr: "" }` it paired
  the closing quote of `""` with the opening quote of the GSTIN, captured
  `, gstin: ` as if it were a value, and consumed the quote that would have
  started the real one. The fabricated GSTIN was never examined, and the
  mutation that put it back PASSED.

  Matching every literal including empty ones keeps the pairs aligned; the
  length filter then happens afterwards, on the extracted value, where it
  belongs.
*/
const PLACEHOLDERISH = [
  /^Your\s+(Company|Business|Firm)/i,
  /^(Client|Customer|Company|Business|Vendor|Supplier|Party)\s*Name$/i,
  /^(Service|Product|Item|Description)(\s*\/\s*\w+)?$/i,
  /^(Untitled|Sample|Example|Acme|Test)\b/i,
  /GSTIN\s*·/i,                       // the composed "GSTIN · Mumbai · email" default
  /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/, // a format-valid GSTIN hardcoded as a value
];

/*
  Forms that create a row another module will treat as real. These are the
  ones where a placeholder-as-value becomes a receivable, a payable or a
  customer record — not merely an odd-looking screen.
*/
const RECORD_FORMS = [
  "src/components/quote-builder.tsx",
  "src/components/invoice-generator.tsx",
];

for (const f of RECORD_FORMS) {
  const s = read(f);
  const defaults = [...s.matchAll(/useState[^(]*\(\s*(\{[\s\S]{0,400}?\}|\[[\s\S]{0,400}?\])\s*\)/g)]
    .map((m) => m[1]);

  for (const blob of defaults) {
    for (const sm of blob.matchAll(/"([^"]*)"/g)) {
      const v = sm[1];
      if (v.length < 2) continue;
      const bad = PLACEHOLDERISH.find((re) => re.test(v));
      check(!bad, `${f.replace("src/", "")} has no placeholder text as a default VALUE`,
        bad ? `"${v}" — move it to a placeholder attribute. A value survives to the database; ` +
              `on these two forms it becomes a receivable with nobody to chase.` : "");
    }
  }
}

/* ======================================================================== */
/* The positive half: the record forms must validate before writing         */
/* ======================================================================== */

for (const [f, field] of [
  ["src/components/quote-builder.tsx", "to.name"],
  ["src/components/invoice-generator.tsx", "buyer.name"],
]) {
  const s = read(f);
  check(new RegExp(`if \\(!${field.replace(".", "\\.")}\\.trim\\(\\)\\)`).test(s),
    `${f.replace("src/", "")} refuses to save without a named counterparty`,
    "the server rejects an EMPTY party, which a placeholder-as-value never was");
}

/* And they must use what the workspace already knows about the seller. */
for (const f of RECORD_FORMS) {
  const s = read(f);
  check(/orgName/.test(s), `${f.replace("src/", "")} seeds the seller from the workspace`,
    "the organisation's name has been on file since signup");
}
for (const p of ["src/app/(app)/quote/page.tsx", "src/app/(app)/invoice/page.tsx"]) {
  const s = read(p);
  check(/getOrgProfile\(\)/.test(s) && /orgName=\{/.test(s),
    `${p.replace("src/app/", "")} passes the real organisation name down`);
}

/* ======================================================================== */
/* A wider, advisory sweep: report the same shape anywhere else it appears  */
/* ======================================================================== */

const elsewhere = [];
for (const f of tsx("src/components")) {
  if (RECORD_FORMS.includes(f)) continue;
  const s = read(f);
  if (!/"use client"/.test(s.slice(0, 60))) continue;
  for (const m of s.matchAll(/useState[^(]*\(\s*(\{[\s\S]{0,300}?\}|"[^"]{2,60}")\s*\)/g)) {
    for (const sm of m[1].matchAll(/"([^"]*)"/g)) {
      if (sm[1].length < 2) continue;
      if (PLACEHOLDERISH.some((re) => re.test(sm[1]))) elsewhere.push(`${f.replace("src/", "")}  "${sm[1]}"`);
    }
  }
}

console.log(`\nplaceholder values: ${pass} passed, ${failures.length} failed`);
if (!failures.length) {
  console.log(`  ${RECORD_FORMS.length} record-creating forms carry no placeholder-as-value, validate the counterparty, and know the seller.`);
}
if (elsewhere.length) {
  console.log(`\n  Advisory — the same shape elsewhere (not failed: these do not create records):`);
  for (const e of [...new Set(elsewhere)]) console.log("    · " + e);
}
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
