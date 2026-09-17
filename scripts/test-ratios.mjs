/**
 * "Unknown" must never render as good news.
 *
 * Four defects found in an external review, all the same mistake wearing
 * different clothes: a value the product does not have, or cannot meaningfully
 * compute, being passed to something that grades, colours or reassures.
 *
 *   /ratios   negative equity produced debt/equity −12.00 in green next to
 *             "≤1 conservative", and ROE +100% in green next to "≥15% strong".
 *   /forecast an empty workspace produced a green "Cash-positive" runway.
 *   /forecast and /risks: pressing Generate with the optional focus box empty
 *             returned early and silently, leaving a stale result on screen.
 *   /gst      told users valid historical invoices "need reissuing".
 *
 * The first is executable against the real module. The rest are structural, so
 * they are asserted against source — weaker, but enough to catch a revert.
 */

import { readFileSync } from "node:fs";
import { computeRatios, ratioRows, grade } from "../src/lib/ratios.ts";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

const base = {
  currentAssets: 18900000, currentLiabilities: 9000000, inventory: 5200000,
  debt: 12000000, equity: 26000000, ebit: 6600000, interest: 1400000,
  revenue: 51000000, totalAssets: 42000000, netProfit: 5100000,
};
const rowFor = (inputs, key) => ratioRows(computeRatios(inputs)).find((r) => r.key === key);

/* ============================ the reported case, exactly as reported ===== */
/*
  Debt ₹1.2 Cr, equity −₹10 L, net profit −₹10 L. Before the fix this rendered
  debt/equity −12.00 and ROE 100%, both green.
*/
{
  const insolvent = { ...base, debt: 12000000, equity: -1000000, netProfit: -1000000 };
  const r = computeRatios(insolvent);

  check(r.equityOk === false, "negative equity is flagged, not absorbed");
  check(r.de === null, "debt/equity is not computed on negative equity", `got ${r.de}`);
  check(r.roe === null, "ROE is not computed on negative equity", `got ${r.roe}`);

  const de = rowFor(insolvent, "de");
  const roe = rowFor(insolvent, "roe");
  check(de.grade === "na", `debt/equity is ungraded, not "good" (was green at −12.00)`, `got ${de.grade}`);
  check(roe.grade === "na", `ROE is ungraded, not "good" (was green at +100%)`, `got ${roe.grade}`);
  check(de.val === "—" && roe.val === "—", "both read as unknown rather than a number");
  check(!de.val.includes("-12") && !roe.val.includes("100"),
    "neither of the two originally-reported numbers can appear");

  /* The specific arithmetic trap: two negatives cancelling into a strong-looking
     positive. If anyone reintroduces a plain division this fails loudly. */
  const naiveRoe = (insolvent.netProfit / insolvent.equity) * 100;
  check(naiveRoe === 100, "…and the naive formula really would have said +100%",
    `sanity check of the bug itself: got ${naiveRoe}`);

  /* Ratios that do not depend on equity must still work — the guard should be
     surgical, not a blanket refusal to show anything. */
  check(rowFor(insolvent, "current").grade !== "na", "liquidity is still graded");
  check(rowFor(insolvent, "netMargin").grade === "bad", "a negative net margin still grades bad");
}

/* Zero equity is the same class and was also green (0/0 → 0 → "conservative"). */
{
  const r = computeRatios({ ...base, equity: 0 });
  check(r.de === null && r.roe === null, "zero equity is ungraded too");
}

/* ============================ missing inputs are not measurements ======== */
{
  const empty = {
    currentAssets: 0, currentLiabilities: 0, inventory: 0, debt: 0, equity: 0,
    ebit: 0, interest: 0, revenue: 0, totalAssets: 0, netProfit: 0,
  };
  const rows = ratioRows(computeRatios(empty));
  check(rows.every((r) => r.grade === "na"),
    "an entirely empty form grades nothing at all",
    `graded: ${rows.filter((r) => r.grade !== "na").map((r) => `${r.key}=${r.grade}`).join(", ")}`);
  check(rows.every((r) => r.val === "—"), "and shows no numbers it does not have");
  check(rows.every((r) => r.hint && r.hint.length > 3),
    "every unknown says what is missing, so “—” is never unexplained");

  /* No interest expense is not "0x coverage, dangerous" — it is no debt cost. */
  check(rowFor({ ...base, interest: 0 }, "coverage").grade === "na",
    "no interest expense is not graded as terrible interest coverage");
}

/* ============================ the healthy path is untouched ============== */
{
  const rows = ratioRows(computeRatios(base));
  check(rows.every((r) => r.grade !== "na"), "the default healthy figures all still compute");
  check(rowFor(base, "de").grade === "good", "0.46 debt/equity still grades good");
  check(rowFor(base, "roe").grade === "good", "19.6% ROE still grades good");
  check(rowFor(base, "current").val === "2.10", "current ratio still formats to 2 dp");
}

/* ==================== the identity that catches a factor of 100 ========== */
/*
  ROA = net profit / assets, and that is identically (net profit / revenue) ×
  (revenue / assets) — net margin × asset turnover. It is arithmetic, not a
  convention, so it holds for every input and makes a unit error impossible to
  miss.

  THIS IS THE TEST THAT SHOULD HAVE EXISTED. The previous suite asserted ROA's
  grade and never its value, so when a refactor dropped the ×100 and turned a
  12.1% return into "0.1%", all 46 assertions still passed: 0.121 grades "bad"
  exactly as −2% does. The number reached production and was found by a reader
  noticing that net margin 10.0% beside asset turnover 1.2× cannot produce
  ROA 0.1%. Checking grades is not checking arithmetic.
*/
{
  const r = computeRatios(base);
  const identity = (r.netMargin / 100) * r.assetTurn * 100;
  check(Math.abs(r.roa - identity) < 0.01,
    "ROA equals net margin × asset turnover, as it must by definition",
    `roa=${r.roa} but margin×turnover=${identity.toFixed(3)} — a mismatch here is a unit error`);

  /* Pinned in absolute terms too, so the identity cannot be satisfied by two
     numbers that are both wrong by the same factor. */
  check(Math.abs(r.roa - 12.142857142857142) < 0.0001,
    "ROA on the default figures is 12.1%, not 0.1%",
    `₹51 L profit on ₹4.2 Cr of assets — got ${r.roa}`);
  check(rowFor(base, "roa").val === "12.1%", "…and renders as 12.1%", rowFor(base, "roa").val);
  check(rowFor(base, "roa").grade === "good",
    "a 12.1% return grades good, where 0.1% graded bad",
    `got ${rowFor(base, "roa").grade}`);

  /* Every percentage ratio must be on the same scale. */
  for (const k of ["netMargin", "roe", "roa"]) {
    const v = computeRatios(base)[k];
    check(v > 1, `${k} is expressed in percent, not as a decimal fraction`, `got ${v}`);
  }

  /* The identity holds for a loss-making business too. */
  const loss = { ...base, netProfit: -2100000 };
  const lr = computeRatios(loss);
  check(Math.abs(lr.roa - (lr.netMargin / 100) * lr.assetTurn * 100) < 0.01,
    "…and still holds when the business is loss-making");
  check(lr.roa < 0, "a loss produces a negative ROA", `got ${lr.roa}`);
}

/* ============================ grade() itself ============================= */
{
  check(grade(null, () => true, () => true) === "na", "null can never be graded good");
  check(grade(5, (n) => n >= 3, () => true) === "good", "good wins when it applies");
  check(grade(2, (n) => n >= 3, (n) => n >= 1.5) === "warn", "warn is the middle band");
  check(grade(1, (n) => n >= 3, (n) => n >= 1.5) === "bad", "bad is the floor");
}

/* ============================ the component uses the module ============== */
{
  const c = src("src/components/financial-ratios.tsx");
  check(/computeRatios|ratioRows/.test(c), "the ratios component renders from the shared module");
  check(!/\(a: number, b: number\) => b \? a \/ b : 0/.test(c),
    "the zero-fallback divider is gone from the component");
  check(/equityOk/.test(c), "negative equity is surfaced in the UI, not just handled");
}

/* ============================ forecast: unknown ≠ cash-positive ========== */
{
  const c = src("src/components/scenario-planner.tsx");
  check(/runwayMonths: number \| null/.test(c),
    "runway can be unknown, not only finite-or-Infinity");
  check(/!real \? null/.test(c),
    "no baseline yields an unknown runway rather than a cash-positive one");
  check(/cashKnown/.test(c),
    "an unknown cash balance is distinguished from a zero one");
  check(/m\.runwayMonths === null \? "—"/.test(c),
    "and the card renders it as unknown");
  /* The exact regression: Infinity must no longer be reachable with no data. */
  check(!/runwayMonths = profit >= 0 \? Infinity/.test(c),
    "profit>=0 alone can no longer mean cash-positive");
}

/* ============================ no silent early return ===================== */
{
  const c = src("src/components/ai-panel.tsx");
  check(!/if \(mode !== "pulse" && !input\.trim\(\)\) return;/.test(c),
    "the silent early return is gone");
  check(/inputOptional/.test(c), "panels can declare that their input is genuinely optional");
  check(/setNeedsInput\(true\)/.test(c) && /role="alert"/.test(c),
    "a required-but-empty field now says so, out loud");

  /* Every panel whose placeholder promises "Optional" must actually accept
     empty input — that mismatch is what made the failure so confusing. */
  /*
    Where the panel is rendered, per route. /brief moved its AIPanel into
    components/brief-panel.tsx when the page gained real empty and generated
    states, so checking the page file alone reported a regression that was not
    one — the prop had moved, not gone. The map keeps the assertion pointed at
    whichever file actually renders the panel.
  */
  const optional = {
    forecast: "src/app/(app)/forecast/page.tsx",
    costs: "src/app/(app)/costs/page.tsx",
    "pricing-optimizer": "src/app/(app)/pricing-optimizer/page.tsx",
    benchmarks: "src/app/(app)/benchmarks/page.tsx",
    risks: "src/app/(app)/risks/page.tsx",
    boardroom: "src/app/(app)/boardroom/page.tsx",
    investor: "src/app/(app)/investor/page.tsx",
    "action-center": "src/app/(app)/action-center/page.tsx",
    brief: "src/components/brief-panel.tsx",
  };
  for (const [page, file] of Object.entries(optional)) {
    const p = src(file);
    check(/<AIPanel[\s\S]{0,200}inputOptional/.test(p), `/${page} accepts an empty focus`,
      `looked in ${file}`);
  }
}

/* ============================ GST: no bogus reissue instruction ========== */
{
  const c = src("src/app/(app)/gst/page.tsx");
  check(!/they need reissuing/.test(c),
    "the blanket 'reissue your old invoices' instruction is gone");
  check(/time of supply/i.test(c),
    "and the page explains that the rate follows the time of supply");
  check(/do not need reissuing|remain valid/i.test(c),
    "historical invoices are explicitly described as still valid");
}

console.log(`\nratios & unknowns: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  Unknown reads as unknown; nothing ungradeable is shown as good news.");
