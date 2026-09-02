#!/usr/bin/env node
/**
 * Statutory calculator tests.  Run: npm run test:statutory
 *
 * WHY THIS SUITE EXISTS
 *
 * These calculators tell an Indian business how much tax to withhold from a
 * real vendor, what to pay a departing employee, and what a late GST return
 * costs. A wrong constant here is not a rendering bug — it moves money.
 *
 * The TDS table was found carrying rates superseded in 2024:
 *
 *     194H commission     5%        -> 2%   (Finance Act 2024, from 1 Oct 2024)
 *     194H threshold      15,000    -> 20,000
 *     194J threshold      30,000    -> 50,000
 *     194I rent threshold 2,40,000  -> 6,00,000
 *     194A interest       40,000    -> 50,000
 *     194C               no annual aggregate limit at all
 *
 * At 5%, the tool told a business to withhold two and a half times what the law
 * requires from every broker and agent it pays — money the vendor then reclaims
 * as a refund a year later. At a 2.4L rent threshold it had businesses
 * deducting tax on rent that no longer attracts it.
 *
 * The root cause was that the table carried NO EFFECTIVE DATE. Its comment said
 * "FY-agnostic typical rates", which is not a thing that exists: every one of
 * these numbers moves with a Finance Act. Nothing on the screen or in the code
 * told a reader how old they were.
 *
 * A test cannot know when Parliament changes a rate. What it CAN do is make the
 * current values explicit, so that changing one is a deliberate act with a
 * failing test attached rather than a silent edit — and make sure the effective
 * date never disappears again.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(ROOT, "src", "components", f), "utf8");

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

/** Pages live under src/app/(app), not src/components. */
function readPage(rel) {
  return readFileSync(new URL(`../src/app/(app)/${rel}`, import.meta.url), "utf8");
}

/* ========================================================================= */
console.log("\nTDS — rates and thresholds, FY 2025-26");
/* ========================================================================= */
{
  const src = read("tds-calc.tsx");
  const sections = Object.fromEntries(
    [...src.matchAll(/code:\s*"([^"]+)"[^}]*?rate:\s*([\d.]+),\s*threshold:\s*(\d+)(?:,\s*annual:\s*(\d+))?/g)]
      .map((m) => [m[1], { rate: Number(m[2]), threshold: Number(m[3]), annual: m[4] ? Number(m[4]) : undefined }]),
  );
  check(`the section table parsed (${Object.keys(sections).length} sections)`, Object.keys(sections).length >= 9);

  const expect = (code, rate, threshold, why) => {
    const s = sections[code];
    if (!s) { fail++; console.log(`  FAIL  ${code} missing from the table`); return; }
    check(`${code} = ${rate}% over ₹${threshold.toLocaleString("en-IN")}${why ? ` — ${why}` : ""}`,
      s.rate === rate && s.threshold === threshold);
  };

  // The two that were wrong, and cost real money.
  expect("194H", 2, 20000, "was 5% / ₹15,000, superseded Oct 2024");
  expect("194I-land", 10, 600000, "was ₹2,40,000");
  expect("194I-plant", 2, 600000, "was ₹2,40,000");
  expect("194J", 10, 50000, "was ₹30,000");
  expect("194J-tech", 2, 50000, "was ₹30,000");
  expect("194A", 10, 50000, "was ₹40,000");
  // Unchanged, pinned so a future edit is deliberate.
  expect("194C", 2, 30000);
  expect("194C-ind", 1, 30000);
  expect("194Q", 0.1, 5000000);
  expect("194", 10, 5000);

  console.log("\n  194C aggregate limit — the one that catches people out");
  check("194C carries the ₹1,00,000 annual aggregate", sections["194C"]?.annual === 100000);
  check("...for the individual/HUF variant too", sections["194C-ind"]?.annual === 100000);
  check("the UI warns that crossing it applies TDS retrospectively",
    /once you have paid this vendor/.test(src) && /including the payments you did not deduct on/.test(src));

  console.log("\n  The vintage must be on the screen");
  check("an effective date is declared", /RATES_AS_OF\s*=\s*"[^"]*2025-26[^"]*"/.test(src));
  check("...and rendered to the user, not just left in a comment",
    /Rates current for \{RATES_AS_OF\}/.test(src));
  check("the old 'FY-agnostic typical rates' claim is gone", !/FY-agnostic/.test(src));

  console.log("\n  No-PAN handling");
  check("section 206AA floors the rate at 20%", /Math\.max\(s\.rate,\s*20\)/.test(src));
}

/* ========================================================================= */
console.log("\nGRATUITY — Payment of Gratuity Act");
/* ========================================================================= */
{
  const src = read("gratuity-calc.tsx");
  check("uses (salary x 15 x years) / 26", /salary \* 15 \* totalYears\) \/ 26/.test(src));
  check("caps at the ₹20,00,000 statutory ceiling", /2_000_000|20000000/.test(src));
  check("requires 5 continuous years", /years >= 5/.test(src));
  check("rounds up a final year of 6 months or more", /months >= 6/.test(src));
  check("tells the user when the cap bit", /capped/.test(src));
  check("mentions the death/disability exception", /death.?\/?.?disability|death or disability/i.test(src));
}

/* ========================================================================= */
console.log("\nEPF / ESI — contribution rates");
/* ========================================================================= */
{
  const src = read("epf-calc.tsx");
  check("employee PF is 12% of the PF wage", /pfWage \* 0\.12/.test(src));
  check("EPS is 8.33%", /0\.0833/.test(src));
  check("EPS wage is capped at ₹15,000", /Math\.min\(pfWage,\s*15000\)/.test(src));
  check("employer EPF is 12% less EPS", /0\.12\) - eps/.test(src));
  check("ESI applies at or below ₹21,000 gross", /gross <= 21000/.test(src));
  check("employee ESI is 0.75%", /0\.0075/.test(src));
  check("employer ESI is 3.25%", /0\.0325/.test(src));
}

/* ========================================================================= */
console.log("\nADVANCE TAX — instalment schedule");
/* ========================================================================= */
{
  const src = read("advance-tax.tsx");
  for (const [by, cum] of [["15 Jun", "0.15"], ["15 Sep", "0.45"], ["15 Dec", "0.75"], ["15 Mar", "1"]])
    check(`${by} → ${Math.round(Number(cum) * 100)}% cumulative`,
      new RegExp(`"${by}",\\s*cum:\\s*${cum.replace(".", "\\.")}`).test(src));
}

/* ========================================================================= */
console.log("\nGST late fee — GSTR-3B");
/* ========================================================================= */
{
  const src = read("gst-latefee.tsx");
  check("₹50 a day for a regular return", /nil \? 20 : 50/.test(src));
  check("₹20 a day for a nil return", /nil \? 20 : 50/.test(src));
  check("interest at 18% a year", /0\.18/.test(src));
  check("a nil return carries no interest, having no tax", /nil \? 0 :/.test(src));
  check("the fee is capped", /Math\.min\(rawFee/.test(src));
}

/* ========================================================================= */
console.log("\nGST rate slabs — GST 2.0, effective 22 September 2025");
/* ========================================================================= */
{
  /*
    The 12% and 28% slabs were ABOLISHED on 22 Sep 2025: 12% items moved mostly
    to 5%, 28% to 18%, and a 40% demerit rate was created. Both the reference
    table and the calculator were still showing the pre-2025 five-slab list, two
    years later — someone pricing a real invoice with it would have charged a
    rate that no longer exists.

    Asserted in both places because they drifted independently. The negative
    assertions are the point: this test exists to stop 12 and 28 coming back.
  */
  const calc = read("gst-calc.tsx");
  const m = calc.match(/const RATES = \[([^\]]*)\]/);
  check("gst-calc: the RATES array is parseable", !!m);
  const rates = m ? m[1].split(",").map((x) => Number(x.trim())) : [];
  check("gst-calc: parsed a plausible slab list", rates.length >= 3 && rates.every((n) => !Number.isNaN(n)));
  check("gst-calc: 12% is gone", !rates.includes(12));
  check("gst-calc: 28% is gone", !rates.includes(28));
  check("gst-calc: 5% is offered", rates.includes(5));
  check("gst-calc: 18% is offered", rates.includes(18));
  check("gst-calc: the 40% demerit rate is offered", rates.includes(40));

  const page = readPage("gst/page.tsx");
  check("gst page: no 12% slab card", !/slab:\s*"12%"/.test(page));
  check("gst page: no 28% slab card", !/slab:\s*"28%"/.test(page));
  check("gst page: a 40% slab card exists", /slab:\s*"40%"/.test(page));
  check("gst page: the as-of date is stated on screen",
    /RATES_AS_OF/.test(page) && /22 September 2025/.test(page));
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
