#!/usr/bin/env node
/**
 * Income-tax slab tests.  Run: npm run test:income-tax
 *
 * WHY THIS SUITE EXISTS
 *
 * Two calculators computed income tax from their own hardcoded ladders —
 * `tax-estimator.tsx` from a slab array, `payroll-calc.tsx` from an if/else
 * chain of pre-computed cumulative amounts. Both carried FY 2024-25 numbers,
 * they disagreed with each other, and neither showed a vintage on screen.
 * Against FY 2026-27 they were wrong about the basic exemption (₹3L vs ₹4L),
 * the standard deduction (₹50,000 vs ₹75,000), the 87A rebate (₹7L vs ₹12L),
 * the whole shape of the ladder, and they applied neither surcharge nor
 * marginal relief at all.
 *
 * `/tax` is subtitled "New vs old regime — see which saves you more", so its
 * output picks a regime for someone's year. `payroll-calc` prints a bold
 * "Monthly take-home" that an owner reads out when making an offer. These are
 * not display bugs.
 *
 * HOW THIS DIFFERS FROM test-statutory.mjs
 *
 * That suite reads component source with regexes, because the values it pins
 * are embedded in JSX. This one imports `src/lib/tax-slabs.ts` and RUNS it
 * (Node 22 strips the type annotations natively), so it checks arithmetic and
 * not just that certain digits appear in a file. A regex would have happily
 * passed a ladder with the right constants wired up in the wrong order.
 *
 * Every expected figure below is hand-computed in the comment beside it, so a
 * failure tells you which step of the computation moved.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = await import(join(ROOT, "src", "lib", "tax-slabs.ts"));

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};
const eq = (label, got, want) => {
  if (got === want) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}\n          got ${got}, want ${want}`); }
};

/* ========================================================================= */
console.log("\nCONSTANTS — FY 2026-27, pinned so a change is deliberate");
/* ========================================================================= */
{
  eq("new-regime ladder", JSON.stringify(T.NEW_SLABS.map((s) => s[0])),
     JSON.stringify([400000, 800000, 1200000, 1600000, 2000000, 2400000, null]).replace("null", "null"));
  /* JSON.stringify turns Infinity into null, which is fine for comparison. */
  eq("new-regime rates", JSON.stringify(T.NEW_SLABS.map((s) => s[1])),
     JSON.stringify([0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30]));
  eq("old-regime ladder", JSON.stringify(T.OLD_SLABS.map((s) => s[0])),
     JSON.stringify([250000, 500000, 1000000, null]).replace("null", "null"));
  eq("old-regime rates", JSON.stringify(T.OLD_SLABS.map((s) => s[1])),
     JSON.stringify([0, 0.05, 0.20, 0.30]));

  eq("standard deduction, new regime", T.STD_DEDUCTION_NEW, 75000);   // was 50,000
  eq("standard deduction, old regime", T.STD_DEDUCTION_OLD, 50000);
  eq("87A threshold, new regime", T.REBATE_NEW.upTo, 1200000);        // was 7,00,000
  eq("87A cap, new regime", T.REBATE_NEW.max, 60000);
  eq("87A threshold, old regime", T.REBATE_OLD.upTo, 500000);
  eq("87A cap, old regime", T.REBATE_OLD.max, 12500);
  eq("cess", T.CESS, 0.04);

  console.log("\n  The vintage must exist and be current");
  check("RATES_AS_OF names FY 2026-27", /2026-27/.test(T.RATES_AS_OF));
}

/* ========================================================================= */
console.log("\nNEW REGIME — the headline cases");
/* ========================================================================= */
{
  const t = (income, opts) => T.computeTax(income, "new", opts).total;

  /* ₹12,75,000 salary − ₹75,000 std = ₹12,00,000 taxable.
     Slab: 4-8L @5% = 20,000; 8-12L @10% = 40,000 → 60,000.
     87A caps at 60,000 and taxable is exactly at the threshold → nil.
     This is the "zero tax up to ₹12.75 lakh" figure everyone quotes; if this
     one is wrong the whole file is wrong. */
  eq("₹12,75,000 salary pays nil", t(1275000, { salaried: true }), 0);

  /* One rupee of taxable income more must NOT produce a 60,000 cliff. */
  check("₹12,75,001 does not fall off a cliff", t(1275001, { salaried: true }) <= 100);

  /* ₹15L − 75,000 = 14,25,000. 20,000 + 40,000 + 225,000@15% = 33,750
     → 93,750 + 4% cess 3,750 = 97,500. */
  eq("₹15,00,000 salary", t(1500000, { salaried: true }), 97500);

  /* ₹25L − 75,000 = 24,25,000.
     20,000 + 40,000 + 60,000 + 80,000 + 100,000 = 300,000 to ₹24L,
     then 25,000 @30% = 7,500 → 307,500 + cess 12,300 = 319,800. */
  eq("₹25,00,000 salary", t(2500000, { salaried: true }), 319800);

  /* Non-salaried gets no standard deduction: ₹12,00,000 taxable outright,
     which still lands exactly on the rebate threshold → nil. */
  eq("₹12,00,000 non-salaried pays nil", t(1200000, { salaried: false }), 0);

  /* ...and ₹12,75,000 non-salaried does NOT, because there is no ₹75,000 to
     deduct. Catches a std-deduction applied to the wrong population. */
  check("₹12,75,000 non-salaried pays something", t(1275000, { salaried: false }) > 0);

  console.log("\n  The new regime allows no deductions");
  eq("80C is ignored under the new regime",
     t(1500000, { salaried: true, deductions: 150000 }), 97500);
}

/* ========================================================================= */
console.log("\nMARGINAL RELIEF — the 87A cliff");
/* ========================================================================= */
{
  /* Taxable ₹12,10,000: slab tax 20,000 + 40,000 + 10,000@15% = 61,500.
     Without relief a ₹10,000 raise appears to cost ₹61,500. Relief caps the
     tax at the ₹10,000 excess; cess 400 → ₹10,400. */
  const r = T.computeTax(1210000 + 75000, "new", { salaried: true });
  eq("₹12,85,000 salary → tax capped at the excess", r.total, 10400);
  check("...and the flag is set so the UI can explain it", r.marginalRelief === true);

  /* Relief must switch OFF once the tax is genuinely below the excess again. */
  const far = T.computeTax(1600000, "new", { salaried: true });
  check("relief does not apply well above the threshold", far.marginalRelief === false);

  /*
    NO CLIFF, across the whole danger zone.

    The property to assert is that the marginal rate stays sane — an extra
    ₹1,000 of income must never cost anything remotely like ₹1,000 of tax.
    On the old code it cost ₹61,500 at a stroke.

    Note the tolerance is 105%, not 100%. Marginal relief caps the tax BEFORE
    cess, and the 4% cess then applies on top, so the statute itself leaves a
    wrinkle worth 4% of each step in the relieved band. That is the law, not a
    defect, and tightening this to 100% would mean "fixing" the code away from
    it. Anything above 105% is a genuine cliff.
  */
  const worstRate = (from, to, step) => {
    let worst = { rate: 0, at: null };
    for (let inc = from; inc <= to; inc += step) {
      const a = T.computeTax(inc, "new", { salaried: true }).total;
      const b = T.computeTax(inc + step, "new", { salaried: true }).total;
      const rate = (b - a) / step;
      if (rate > worst.rate) worst = { rate, at: inc };
    }
    return worst;
  };

  const w = worstRate(1_250_000, 1_350_000, 1000);
  check(`no 87A cliff — worst marginal rate ${(w.rate * 100).toFixed(1)}% at ₹${w.at?.toLocaleString("en-IN")}`,
        w.rate <= 1.05);
}

/* ========================================================================= */
console.log("\nSURCHARGE — neither calculator applied it at all");
/* ========================================================================= */
{
  /* ₹60L − 75,000 = 59,25,000 taxable.
     300,000 to ₹24L + 35,25,000 @30% = 1,057,500 → base 1,357,500.
     10% surcharge = 135,750. cess 4% of 1,493,250 = 59,730 → 1,552,980. */
  eq("₹60,00,000 salary carries 10% surcharge",
     T.computeTax(6000000, "new", { salaried: true }).total, 1552980);

  check("below ₹50 lakh there is no surcharge",
     T.computeTax(4000000, "new", { salaried: true }).surcharge === 0);

  console.log("\n  Surcharge marginal relief — the ₹50 lakh / ₹1cr / ₹2cr cliffs");
  /*
    Each threshold switches a surcharge band on across the WHOLE tax bill, so
    without relief one rupee of income costs over a lakh. Same 105% tolerance
    and the same reason as the 87A cliff above: relief caps tax before cess.

    Without the relief in `withSurcharge`, the marginal rate at ₹50L reaches
    roughly 2,700% — so this is not a test that passes by accident.
  */
  for (const cliff of [5_000_000, 10_000_000, 20_000_000]) {
    let worst = { rate: 0, at: null };
    for (let d = -20_000; d <= 400_000; d += 5000) {
      const inc = cliff + T.STD_DEDUCTION_NEW + d;
      const a = T.computeTax(inc, "new", { salaried: true }).total;
      const b = T.computeTax(inc + 5000, "new", { salaried: true }).total;
      const rate = (b - a) / 5000;
      if (rate > worst.rate) worst = { rate, at: inc };
    }
    check(`no cliff at ₹${cliff / 100000} lakh — worst marginal rate ${(worst.rate * 100).toFixed(1)}%`,
          worst.rate <= 1.05);
  }

  console.log("\n  The old regime keeps its 37% band, the new one caps at 25%");
  const hiNew = T.computeTax(80000000, "new", { salaried: true });
  const hiOld = T.computeTax(80000000, "old", { salaried: true });
  check("old regime taxes ₹8 crore more heavily than new", hiOld.total > hiNew.total);
}

/* ========================================================================= */
console.log("\nOLD REGIME");
/* ========================================================================= */
{
  /* ₹10L − 50,000 std − 150,000 80C = 800,000 taxable.
     2.5-5L @5% = 12,500; 5-10L @20% = 60,000 → 72,500 + cess 2,900 = 75,400. */
  eq("₹10,00,000 with full 80C",
     T.computeTax(1000000, "old", { salaried: true, deductions: 150000 }).total, 75400);

  /* Taxable ₹5,00,000 exactly → 12,500 slab tax, fully rebated. */
  eq("taxable ₹5,00,000 pays nil", T.computeTax(550000, "old", { salaried: true }).total, 0);

  check("deductions DO reduce old-regime tax",
     T.computeTax(1000000, "old", { salaried: true, deductions: 150000 }).total <
     T.computeTax(1000000, "old", { salaried: true }).total);
}

/* ========================================================================= */
console.log("\nEDGE CASES");
/* ========================================================================= */
{
  eq("zero income pays nothing", T.computeTax(0, "new").total, 0);
  eq("income below the standard deduction does not go negative",
     T.computeTax(40000, "new", { salaried: true }).taxable, 0);
  check("negative deductions cannot be used to inflate taxable income",
     T.computeTax(1000000, "old", { salaried: true, deductions: -500000 }).taxable === 950000);
  check("tax is never negative", T.computeTax(100, "new", { salaried: true }).total >= 0);
}

/* ========================================================================= */
console.log("\nTHE COMPONENTS MUST USE THE SHARED TABLE, NOT THEIR OWN");
/* ========================================================================= */
{
  /*
    Comments are stripped before matching.

    These files now carry long comments explaining what was removed and why —
    including the literal phrase "assume 80C fully used". A test looking for
    the absence of that phrase matched my own explanation of its absence and
    failed. The same trap caught test-ai-profiles earlier in this codebase, so
    strip once, here, rather than writing regexes that dodge prose.
  */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const src = (f) => strip(readFileSync(join(ROOT, "src", "components", f), "utf8"));

  for (const f of ["tax-estimator.tsx", "payroll-calc.tsx"]) {
    const s = src(f);
    check(`${f} imports the shared table`, /from "@\/lib\/tax-slabs"/.test(s));
    check(`${f} shows the vintage on screen`, /\{RATES_AS_OF\}/.test(s));

    /* The specific stale constants that were in these files. If any reappears,
       someone has re-hardcoded a ladder next to the shared one. */
    check(`${f} no longer hardcodes the ₹3,00,000 exemption`, !/300000,\s*0\]/.test(s));
    check(`${f} no longer hardcodes a ₹7,00,000 rebate`, !/700000/.test(s));
    check(`${f} no longer hardcodes a ₹50,000 standard deduction`, !/std\s*=\s*(salaried\s*\?\s*)?50000/.test(s));
    check(`${f} declares no slab ladder of its own`, !/NEW_SLABS\s*:\s*\[number/.test(s));
  }

  console.log("\n  The silent assumption is gone");
  const p = src("payroll-calc.tsx");
  check("payroll no longer assumes 80C is fully used", !/assume 80C fully used/.test(p));
  check("...and asks for it instead", /other80c/.test(p));
  check("professional tax is modelled, not just disclaimed", /profTax/.test(p));
}

/* ========================================================================= */
console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
