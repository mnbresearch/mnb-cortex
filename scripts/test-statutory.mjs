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
/*
  THE VINTAGE CHECK IS NOW DERIVED, because the hardcoded one became the bug.

  This block used to assert /RATES_AS_OF = "...2025-26..."/ — a literal year.
  On 1 April 2026 that stamp went stale, and the test did not notice. Worse: it
  actively PINNED the staleness, because updating the calculator to FY 2026-27
  would have failed the suite. The regression harness had become the thing
  holding the defect in place, which is the most expensive way for a test to be
  wrong — it converts a silent problem into a discouraged fix.

  So the expected financial year is computed from the clock. Indian FY runs
  April to March, so before April we are still in the FY that began last
  calendar year. When the year rolls, this fails on its own and names the year
  it wants. A tax tool that cannot tell you its own vintage is worse than one
  with no vintage at all, because the stamp is what stops anyone checking.
*/
/* ========================================================================= */
function currentIndianFY(now = new Date()) {
  /* IST, because a deploy at 23:00 UTC on 31 March is already 1 April in
     Delhi and this file is about Indian statute. */
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60_000);
  const y = ist.getUTCFullYear();
  const startYear = ist.getUTCMonth() >= 3 ? y : y - 1; // month 3 === April
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
const FY = currentIndianFY();

console.log(`\nTDS — rates and thresholds, FY ${FY}`);
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

  console.log("\n  The vintage must be on the screen, and must be THIS year");
  const stamp = src.match(/RATES_AS_OF\s*=\s*"([^"]*)"/);
  check("an effective date is declared", Boolean(stamp));
  check(`...and it is the current financial year (${FY})`,
    Boolean(stamp) && stamp[1].includes(FY));
  if (stamp && !stamp[1].includes(FY)) {
    console.log(`        the calculator says "${stamp[1]}" — check whether the Finance Act`);
    console.log(`        for FY ${FY} moved any rate or threshold, then re-stamp it`);
  }
  check("...and rendered to the user, not just left in a comment",
    /Rates current for \{RATES_AS_OF\}/.test(src));
  check("the old 'FY-agnostic typical rates' claim is gone", !/FY-agnostic/.test(src));

  /*
    The 194-series labels are now section numbers from a REPEALED Act. Keeping
    them is the right call — every CA and every vendor invoice in India still
    says "194J" — but only if the screen says where they went, because a
    deductor who quotes 194J on a FY 2026-27 return has quoted the wrong Act.
  */
  console.log("\n  The Income-tax Act 2025 renumbering is disclosed");
  check("the s.393 consolidation is stated", /\b393\b/.test(src));
  check("...and rendered, not just commented",
    /\{ACT_NOTE\}/.test(src) && /export const ACT_NOTE/.test(src));
  check("...and says the payment code changed, not the rate",
    /payment\s*\n?\s*code|payment code/.test(src) && /unchanged/.test(src));

  console.log("\n  No-PAN handling");
  check("section 206AA floors the rate at 20%", /Math\.max\(s\.rate,\s*20\)/.test(src));
}

/* ========================================================================= */
console.log("\nEPF / EPS / ESI — one ladder, two pages");
/* ========================================================================= */
/*
  /epf and /payroll gave DIFFERENT ANSWERS to the same statutory question.
  epf-calc computed PF on the full basic; payroll-calc capped it at the
  ₹15,000 wage ceiling. On a ₹25,000 basic that is ₹3,000 a month against
  ₹1,800 — and an owner preparing an offer sees both screens.

  Neither was wrong, which is why it survived: contributing above the ceiling
  is a real employer choice. What was wrong was that the product picked
  silently, differently, in two places. lib/epf.ts is the single ladder;
  these assertions are what keep it single.
*/
{
  const epf = await import("../src/lib/epf.ts");

  console.log("\n  The ceiling");
  const below = epf.computeEpf({ basic: 12_000, gross: 20_000 });
  check("below the ceiling, PF is on the full basic", below.pfWage === 12_000);
  check("...and the ceiling is reported as not binding", below.ceilingBinds === false);

  const above = epf.computeEpf({ basic: 25_000, gross: 45_000 });
  check("above the ceiling, the statutory minimum caps PF at ₹15,000", above.pfWage === 15_000);
  check("...and the page is told the choice now matters", above.ceilingBinds === true);
  check("employee PF at the ceiling is ₹1,800", above.employeePF === 1_800);

  console.log("\n  The policy is a choice, and EPS is not");
  const policy = epf.computeEpf({ basic: 25_000, gross: 45_000, aboveCeiling: true });
  check("opting above the ceiling raises PF to 12% of the full basic", policy.employeePF === 3_000);
  check("...but EPS stays capped — that cap is law, not policy",
    policy.employerEPS === above.employerEPS && policy.epsWage === 15_000);
  check("employer EPS + EPF always equals 12% of the PF wage",
    policy.employerEPS + policy.employerEPF === Math.round(policy.pfWage * 0.12));

  console.log("\n  The two pages agree");
  for (const basic of [8_000, 12_000, 15_000, 25_000, 60_000]) {
    const monthly = epf.computeEpf({ basic, gross: basic * 1.8 });
    const annual = epf.annualPf(basic * 12);
    check(`₹${basic.toLocaleString("en-IN")} basic: /epf and /payroll compute the same PF`,
      Math.abs(monthly.employeePF * 12 - annual.employee) <= 12);
  }

  console.log("\n  ESI");
  check("ESI applies at exactly the ₹21,000 ceiling", epf.computeEpf({ basic: 10_000, gross: 21_000 }).esiApplies === true);
  check("...and not one rupee above it", epf.computeEpf({ basic: 10_000, gross: 21_001 }).esiApplies === false);
  check("employee ESI is 0.75%", epf.computeEpf({ basic: 10_000, gross: 20_000 }).employeeESI === 150);
  check("employer ESI is 3.25%", epf.computeEpf({ basic: 10_000, gross: 20_000 }).employerESI === 650);

  console.log("\n  Neither page may keep a private copy");
  const epfSrc = read("epf-calc.tsx"), payrollSrc = read("payroll-calc.tsx");
  check("epf-calc computes through lib/epf", /computeEpf\(/.test(epfSrc));
  check("payroll-calc computes through lib/epf", /annualPf\(/.test(payrollSrc));
  check("no inline PF ceiling survives in either page",
    !/15_?000\s*\*\s*12/.test(payrollSrc.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    !/Math\.min\(\s*pfWage/.test(epfSrc.replace(/\/\*[\s\S]*?\*\//g, "")));
  check("the vintage is on screen", /EPF_RATES_AS_OF/.test(epfSrc));
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
/*
  THESE WERE REGEXES AGAINST epf-calc.tsx, and they broke the moment the
  formulas moved into lib/epf.ts — the same shape of problem as the TDS block
  above, where a test asserting the IMPLEMENTATION rather than the BEHAVIOUR
  made the correct fix look like a regression.

  The rates are now asserted against the exported constants, which is what a
  future reader actually needs pinned: `EPF_RATE` being 0.12 is a fact about
  Indian statute, whereas `/pfWage \* 0\.12/` appearing in a particular .tsx
  was a fact about where the code happened to live that week.

  The behavioural coverage — the ceiling, the policy, EPS being capped
  regardless of it, and the two pages agreeing — is in the block above.
*/
{
  const epf = await import("../src/lib/epf.ts");
  check("employee PF is 12% of the PF wage", epf.EPF_RATE === 0.12);
  check("EPS is 8.33%", epf.EPS_RATE === 0.0833);
  check("EPS wage is capped at ₹15,000", epf.PF_WAGE_CEILING_MONTHLY === 15_000);
  check("employer EPF is 12% less EPS",
    (() => { const r = epf.computeEpf({ basic: 10_000, gross: 18_000 });
             return r.employerEPF === Math.round(10_000 * 0.12) - r.employerEPS; })());
  check("ESI applies at or below ₹21,000 gross", epf.ESI_GROSS_CEILING_MONTHLY === 21_000);
  check("employee ESI is 0.75%", epf.ESI_EMPLOYEE_RATE === 0.0075);
  check("employer ESI is 3.25%", epf.ESI_EMPLOYER_RATE === 0.0325);
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
  /*
    The slab list now lives in src/lib/gst-rates.ts rather than inside
    gst-calc.tsx, so that invoice-generator and quote-builder can validate
    against it — they took a free numeric GST field and would happily put an
    abolished 12% on a document a customer receives. Importing and running the
    module beats regexing it: `isValidGstRate` is what the invoice actually
    calls, so this tests the thing rather than a lookalike.
  */
  const G = await import(join(ROOT, "src", "lib", "gst-rates.ts"));
  const rates = G.GST_RATES.map((r) => r.v);

  check("gst rates: 12% is gone", !rates.includes(12));
  check("gst rates: 28% is gone", !rates.includes(28));
  check("gst rates: 5% is offered", rates.includes(5));
  check("gst rates: 18% is offered", rates.includes(18));
  check("gst rates: the 40% demerit rate is offered", rates.includes(40));
  check("gst rates: 3% bullion/jewellery is offered", rates.includes(3));
  check("gst rates: 0.25% rough diamonds is offered", rates.includes(0.25));

  check("isValidGstRate accepts a real slab", G.isValidGstRate(18) === true);
  check("isValidGstRate rejects the abolished 12%", G.isValidGstRate(12) === false);
  check("isValidGstRate rejects the abolished 28%", G.isValidGstRate(28) === false);
  check("...and 12% gets a warning that says why", /abolished/.test(G.gstRateWarning(12) ?? ""));
  check("...and 28% too", /abolished/.test(G.gstRateWarning(28) ?? ""));
  check("a valid rate produces no warning", G.gstRateWarning(5) === null);
  check("a negative rate is refused", G.gstRateWarning(-5) !== null);

  console.log("\n  The document surfaces must warn, not just the calculator");
  for (const f of ["invoice-generator.tsx", "quote-builder.tsx"]) {
    check(`${f} validates the GST rate`, /gstRateWarning/.test(read(f)));
  }
  check("gst-calc uses the shared table", /from "@\/lib\/gst-rates"/.test(read("gst-calc.tsx")));
  check("gst-calc shows its vintage on screen", /\{RATES_AS_OF\}/.test(read("gst-calc.tsx")));

  console.log("\n  GST late fee — the cap is turnover-linked, not flat");
  {
    /*
      The cap was a flat ₹10,000 for everyone, with no turnover input, so the
      correct figure was not even computable. Worst for the smallest filer: a
      nil return a year late showed ₹7,300 against a true ₹500.
    */
    const lf = read("gst-latefee.tsx");
    check("a nil return caps at ₹500", /NIL_CAP\s*=\s*500/.test(lf));
    check("the ₹1.5cr band caps at ₹2,000", /cap:\s*2_000/.test(lf));
    check("the ₹5cr band caps at ₹5,000", /cap:\s*5_000/.test(lf));
    check("the top band caps at ₹10,000", /cap:\s*10_000/.test(lf));
    check("turnover is an input, so the cap is knowable", /TURNOVER_BANDS/.test(lf) && /setBand/.test(lf));
    check("the flat 10,000-for-everyone cap is gone", !/Math\.min\(rawFee,\s*10000\)/.test(lf));
    check("it declares an as-of date", /RATES_AS_OF/.test(lf));
  }

  /*
    THESE FOUR ASSERTIONS WERE WRITTEN AGAINST THE IMPLEMENTATION, AND THE
    IMPLEMENTATION WAS THE BUG.

    They matched `slab: "40%"` — the literal shape of a `rates` array typed
    into gst/page.tsx. That array is gone: the page now renders from
    lib/gst-rates.ts, which the calculator, the invoice generator and the quote
    builder already share, so there is no longer a second copy of the slabs to
    go stale. (It HAD gone stale once, for two years, which is why these
    checks exist at all.)

    Removing the array turned the first two checks VACUOUS — `slab: "12%"` is
    absent from a file that contains no `slab:` keys whatsoever, so they passed
    while asserting nothing — and the third red for code that is more correct
    than what it was guarding. A check that cannot fail is the worse of the
    two outcomes, because it is counted.

    Rewritten against the intent: the page must take its slabs from the shared
    table, and the shared table must carry 40% and must not carry the abolished
    12% and 28%. That is checkable, cannot pass vacuously, and now fails if
    either the page reverts to a private copy OR the real rate data goes wrong.
  */
  const page = readPage("gst/page.tsx");
  /* read() is rooted at src/components, so step up one for src/lib. */
  const rateSrc = read(join("..", "lib", "gst-rates.ts"));

  check("gst page: slabs come from the shared table, not a local array",
    /from "@\/lib\/gst-rates"/.test(page) && /GST_RATES\.map/.test(page));
  check("gst page: no private slab array remains",
    !/const rates = \[/.test(page) && !/slab:\s*"/.test(page));

  /* The rate data itself — where the staleness would now have to live. */
  check("gst rates: the 40% demerit slab exists", /\{\s*v:\s*40\b/.test(rateSrc));
  check("gst rates: the abolished 12% slab is gone", !/\{\s*v:\s*12\b/.test(rateSrc));
  check("gst rates: the abolished 28% slab is gone", !/\{\s*v:\s*28\b/.test(rateSrc));
  check("gst rates: 12 and 28 are still named as abolished, so a stale document warns",
    /GST_ABOLISHED/.test(rateSrc) && /\b12:/.test(rateSrc) && /\b28:/.test(rateSrc));

  check("gst page: the as-of date is stated on screen",
    /GST_RATES_AS_OF/.test(page) && /22 September 2025/.test(rateSrc));
}

console.log("");
/* ========================================================================= */
/*  VERIFICATION STAMPS MUST NOT ROT SILENTLY                                */
/* ========================================================================= */
/*
  Every statutory table in this product carries a date saying when a human last
  checked it against the source. That is the right pattern — but a date nobody
  re-reads is a date that ages into a lie, and the TDS table proved it by
  sitting six months out with a confident "Rates current for FY 2025-26" on
  screen.

  So the stamps are now checked by the clock. Eighteen months is chosen
  deliberately: long enough that a table untouched through one Finance Act does
  not cry wolf, short enough that nothing survives two. When this fails the fix
  is to RE-VERIFY against the source and move the date — not to move the date.

  It also bans the "current to <month>" shape outright. That is a validity
  claim with an expiry, and the day it passes the screen starts advertising its
  own staleness. "Last verified <month>" is a fact that only ever ages.
*/
{
  console.log("\n  Verification stamps are still fresh");
  const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const files = [
    "src/components/tds-calc.tsx", "src/components/gst-latefee.tsx",
    "src/components/gst-calc.tsx", "src/lib/tax-slabs.ts", "src/lib/gst-rates.ts",
  ];
  const now = new Date();
  let stamps = 0;
  for (const rel of files) {
    let src;
    try { src = readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"); } catch { continue; }

    /*
      Comments are stripped before this one. The first run of this guard failed
      on gst-latefee.tsx because the comment ABOVE the fix quotes the phrase it
      removed, which is exactly the note a future reader needs. A guard that
      punishes you for explaining the defect you fixed teaches people to delete
      the explanation.
    */
    const live = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check(`${rel}: makes no "current to <month>" validity claim`,
      !/current to\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(live),
      "a claim that expires on a date nobody is scheduled to renew");

    for (const m of src.matchAll(/(?:last verified|verified against[^\n]*?\bon)\s+(?:\d{1,2}\s+)?([A-Za-z]+)\s+(20\d\d)/gi)) {
      const mi = MONTHS.indexOf(m[1].toLowerCase());
      if (mi < 0) continue;
      stamps++;
      const age = (now.getFullYear() - Number(m[2])) * 12 + (now.getMonth() - mi);
      check(`${rel}: "${m[1]} ${m[2]}" is under 18 months old (${age}m)`, age <= 18,
        "re-verify against the source, then move the date — do not just move the date");
    }
  }
  check(`several verification stamps were found and checked (${stamps})`, stamps >= 2);
}

if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
