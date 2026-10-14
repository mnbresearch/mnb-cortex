#!/usr/bin/env node
/**
 * Executed guards for the October 2026 statutory audit fixes.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-statutory-fixes.mjs
 *
 * Every check here RUNS the real code rather than pattern-matching it, because
 * each defect below was arithmetic or date logic that looked fine on the page:
 *
 *   TDS-1  194Q taxed the whole purchase once past ₹50L; the law taxes only the
 *          excess. No-PAN 194Q is 5%, not 20%.
 *   TDS-2  194I compared ₹6,00,000 with one payment; it is ₹50,000 a month.
 *   TDS-3  194 dividend threshold ₹5,000 -> ₹10,000 (Finance Act 2025).
 *   TDS-4  "exceeds" means `>`: a payment of exactly the threshold attracts nothing.
 *   TAX-1  87A marginal relief is new-regime only; old regime at ₹5.1L is ₹15,080.
 *   CAL-1  PMT-06 / IFF fall due only after months 1 and 2 of a quarter; QRMP
 *          filers get a quarterly GSTR-1 and GSTR-3B.
 *   CAL-2  TDS deducted in March is due 30 April.
 *   ADV-1  234C counts only instalments whose dates have passed.
 *   CAP-1  The ESOP pool is sized pre-money, so a seed round reads 70/20/10.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(ROOT, rel), "utf8");

let pass = 0, fail = 0;
const check = (label, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`); }
};

const slabs = await import("../src/lib/tax-slabs.ts");
const S = await import("../src/lib/statutory.ts");
const P = await import("../src/lib/statutory-profile.ts");
const AT = await import("../src/lib/advance-tax.ts");

/* ------------------------------------------------------------------ TDS -- */
console.log("\nTDS — computeTds against the sections in tds-calc.tsx");
{
  const tds = src("src/components/tds-calc.tsx");
  /* The section rows are plain object literals; evaluate the array as data. */
  const m = tds.match(/const SECTIONS:\s*Section\[\]\s*=\s*(\[[\s\S]*?\n\]);/);
  check("the SECTIONS table was found", Boolean(m));
  const SECTIONS = m ? Function(`"use strict"; return (${m[1]});`)() : [];
  const sec = (code) => SECTIONS.find((s) => s.code === code);
  const run = (code, amt, pan = true) => slabs.computeTds(sec(code), amt, pan);

  // TDS-1
  check("194Q on ₹60L of purchases is ₹1,000 (0.1% of the ₹10L above ₹50L)", run("194Q", 6_000_000).tds === 1_000,
    `got ${run("194Q", 6_000_000).tds}`);
  check("194Q at exactly ₹50L is nil", run("194Q", 5_000_000).tds === 0);
  check("194Q without PAN is 5% of the excess (₹50,000 on ₹60L)", run("194Q", 6_000_000, false).tds === 50_000,
    `got ${run("194Q", 6_000_000, false).tds} at ${run("194Q", 6_000_000, false).rate}%`);
  // TDS-2
  check("194I threshold is ₹50,000 a month", sec("194I-land")?.threshold === 50_000 && sec("194I-land")?.basis === "month");
  check("194I: ₹50,000 rent for the month attracts nothing", run("194I-land", 50_000).tds === 0);
  check("194I: ₹60,000 rent for the month attracts ₹6,000 at 10%", run("194I-land", 60_000).tds === 6_000);
  check("194I plant: ₹60,000 attracts ₹1,200 at 2%", run("194I-plant", 60_000).tds === 1_200);
  // TDS-3
  check("194 dividend threshold is ₹10,000", sec("194")?.threshold === 10_000);
  check("194: ₹8,000 of dividend attracts nothing (was taxed at the ₹5,000 limit)", run("194", 8_000).tds === 0);
  check("194: ₹12,000 attracts ₹1,200", run("194", 12_000).tds === 1_200);
  // TDS-4
  check("194C: a payment of exactly ₹30,000 attracts nothing (exceeds, not reaches)", run("194C", 30_000).tds === 0);
  check("194C: ₹30,001 attracts 2%", run("194C", 30_001).tds === 600);
  check("194J: exactly ₹50,000 attracts nothing", run("194J", 50_000).tds === 0);
  // 206AA unchanged for everyone else
  check("194J without PAN is 20%", run("194J", 100_000, false).rate === 20);
  check("negative or NaN amounts never produce negative TDS",
    run("194C", -5_000).tds === 0 && run("194C", NaN).tds === 0);
}

/* ------------------------------------------------------------- 87A old -- */
console.log("\nIncome tax — 87A marginal relief is new-regime only");
{
  const old = slabs.computeTax(510_000, "old", { salaried: false });
  check("old regime, ₹5,10,000 taxable: ₹15,080 (₹14,500 + 4% cess), no relief", old.total === 15_080 && !old.marginalRelief,
    `got ${old.total}, relief=${old.marginalRelief}`);
  const nw = slabs.computeTax(1_210_000, "new", { salaried: false });
  check("new regime, ₹12,10,000: relief still caps tax at ₹10,000 (+cess = ₹10,400)", nw.total === 10_400 && nw.marginalRelief,
    `got ${nw.total}`);
  check("old regime at ₹5,00,000 still gets the full rebate (nil)", slabs.computeTax(500_000, "old", { salaried: false }).total === 0);
}

/* ------------------------------------------------------------ calendar -- */
console.log("\nStatutory calendar — quarter-shaped QRMP dates (14 Oct 2026)");
{
  const at = (iso) => new Date(`${iso}T06:30:00Z`);
  const oct14 = at("2026-10-14");
  const list = S.upcomingDeadlines(31, oct14);
  const on = (id) => list.filter((d) => d.id.replace(/-next$/, "") === id).map((d) => S.istISO(d.due));

  check("no PMT-06 on 25 Oct 2026 — that date does not exist", !on("pmt06").includes("2026-10-25"), on("pmt06").join(","));
  check("next PMT-06 from 14 Oct is 25 Nov", S.istISO(S.nextOccurrence("pmt06", oct14)) === "2026-11-25");
  check("no IFF in the month after a quarter; next IFF is 13 Nov", S.istISO(S.nextOccurrence("iff", oct14)) === "2026-11-13");
  check("PMT-06 still falls on 25 Sep (for August)", S.upcomingDeadlines(10, at("2026-09-16")).some((d) => d.id === "pmt06"));
  check("quarterly GSTR-3B is on the calendar for 22 Oct", on("gstr3b-qrmp").includes("2026-10-22"));
  check("...and says it may be the 24th depending on the state", /24th/.test(S.statutoryRule("gstr3b-qrmp")?.what ?? ""));
  check("quarterly GSTR-1 falls on the 13th of Jan/Apr/Jul/Oct only",
    S.istISO(S.nextOccurrence("gstr1-qrmp", oct14)) === "2027-01-13" &&
    S.istISO(S.nextOccurrence("gstr1-qrmp", at("2026-10-01"))) === "2026-10-13");
  check("CMP-08 on 18 Oct", on("cmp08").includes("2026-10-18"));

  const qrmp = { gst: "qrmp", employees: "no", tds: "no", company: "no", audit: "no", gstTds: "no" };
  const { shown } = S.splitByProfile(list, qrmp);
  check("a QRMP filer is SHOWN the quarterly GSTR-3B (it used to have no 3B at all)",
    shown.some((d) => d.id === "gstr3b-qrmp"));
  check("...and is not shown the monthly GSTR-3B", !shown.some((d) => d.id.replace(/-next$/, "") === "gstr3b"));
  check("a monthly filer has the quarterly returns hidden, with a reason",
    P.applicability("gstr3b-qrmp", { ...P.UNKNOWN_PROFILE, gst: "monthly" }) === "excluded" &&
    /monthly/.test(P.excludedBecause("gstr3b-qrmp", { ...P.UNKNOWN_PROFILE, gst: "monthly" }) ?? ""));

  // CAL-2
  const tm = S.statutoryRule("tds-march");
  check("TDS deducted in March is due 30 April", tm?.month === 4 && tm?.day === 30);
  check("the monthly TDS rule says so too", /30 April/.test(S.statutoryRule("tds")?.what ?? ""));

  // ITR-1 (Finance Act 2026)
  const itr = S.statutoryRule("itr");
  check("non-audit business ITR is due 31 August", itr?.month === 8 && itr?.day === 31);
}

/* --------------------------------------------------------- advance tax -- */
console.log("\nAdvance tax — interest only on dates that have passed");
{
  const oct14 = new Date("2026-10-14T06:30:00Z");
  const r = AT.computeAdvanceTax({ tax: 240_000, today: oct14 });
  check("on 14 Oct with nothing paid, 234C so far is ₹4,320 (Jun + Sep)", r.interest234C === 4_320, `got ${r.interest234C}`);
  check("...and the Dec + Mar ₹7,800 is a projection, not a charge", r.projected234C === 7_800, `got ${r.projected234C}`);
  check("rows say which dates have passed", r.rows.map((x) => x.passed).join() === "true,true,false,false");
  check("234B is flagged as a projection mid-year", r.interest234B.projected === true);
  const whole = AT.computeAdvanceTax({ tax: 240_000 });
  check("without a date the whole-year figure is unchanged (₹12,120)", whole.interest234C === 12_120);
  check("15 Jun itself has not passed on 15 Jun",
    AT.computeAdvanceTax({ tax: 240_000, today: new Date("2026-06-15T06:30:00Z") }).rows[0].passed === false);
}

/* ----------------------------------------------------------- cap table -- */
console.log("\nCap table — ESOP pool sized pre-money");
{
  const file = src("src/components/cap-table.tsx");
  const a = file.indexOf("/* @pure-start capTableModel");
  const b = file.indexOf("/* @pure-end */");
  check("capTableModel is marked out for execution", a >= 0 && b > a);
  const dir = join(tmpdir(), "cx-statutory-fixes"); mkdirSync(dir, { recursive: true });
  const f = join(dir, "cap-table-model.ts");
  writeFileSync(f, file.slice(a, b));
  const { capTableModel } = await import(pathToFileURL(f).href);

  const seed = capTableModel(10_000_000, [{ name: "Seed", raise: 20_000_000, preMoney: 80_000_000, esop: 10 }]).last;
  const near = (x, y) => Math.abs(x - y) < 0.01;
  check("seed round with a 10% pre-money pool: founders 70%", near(seed.founderPct, 70), seed.founderPct.toFixed(2));
  check("...investor 20% (raise / post-money — the pool does not dilute them)", near(seed.investorPct, 20), seed.investorPct.toFixed(2));
  check("...pool 10%", near(seed.esopPct, 10), seed.esopPct.toFixed(2));

  const two = capTableModel(10_000_000, [
    { name: "Seed", raise: 20_000_000, preMoney: 80_000_000, esop: 10 },
    { name: "A", raise: 50_000_000, preMoney: 200_000_000, esop: 12 },
  ]);
  const A = two.last;
  check("Series A investor gets raise / post-money = 20%", near(A.investorPct - (two.investors[0].shares / two.totalShares) * 100, 20));
  check("...the pool is topped up to 12%", near(A.esopPct, 12));
  check("...and everything sums to 100%", near(A.founderPct + A.investorPct + A.esopPct, 100));
  const zero = capTableModel(10_000_000, [{ name: "x", raise: 1_000, preMoney: 0, esop: 0 }]).last;
  check("a zero pre-money stays finite", Number.isFinite(zero.founderPct) && Number.isFinite(zero.investorPct));
  const over = capTableModel(10_000_000, [{ name: "x", raise: 90, preMoney: 10, esop: 20 }]).last;
  check("investor + pool ≥ 100% is flagged, not divided by zero", over.poolCapped === true && Number.isFinite(over.founderPct));
}

console.log(`\nstatutory fixes: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
