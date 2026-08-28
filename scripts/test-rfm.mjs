#!/usr/bin/env node
/**
 * RFM segmentation tests.  Run: npm run test:rfm
 *
 * WHY THIS SUITE EXISTS
 *
 * The old scoring assigned F and M from fixed universal thresholds (F=4 needed
 * 8 orders/yr, M=4 needed ₹5,00,000/yr) and BOTH "Champion" and "Loyal"
 * required f >= 4. So for any business whose customers order fewer than eight
 * times a year, those two branches were unreachable — not unlikely, impossible.
 *
 * That was live. The sample manufacturer showed six customers, every one of
 * them recent and high-revenue, and all six were labelled "Needs attention"
 * with nothing separating the best from the worst. The module's whole job is to
 * tell you who to reward and who to chase, and it could not do either.
 *
 * The mirror case is just as bad and is most Indian retail: a shop whose
 * customers spend ₹40,000 a year scores m = 1 across the entire book.
 *
 * The tests below pin BOTH failure modes, and assert the fix did not simply
 * relabel everyone as a Champion — varied books must still spread.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "cortex-rfm-"));
try {
  execFileSync(join(ROOT, "node_modules", ".bin", "tsc"), [
    "src/lib/rfm.ts", "--outDir", out,
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler",
  ], { cwd: ROOT, stdio: "inherit" });
} catch { console.error("Could not compile src/lib/rfm.ts"); process.exit(1); }
const { scoreBook, segmentOf, relativeScore, fScore, mScore } = await import(join(out, "rfm.js"));

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};
const segs = (rows) => scoreBook(rows).map((c) => c.segment);
const byName = (rows) => Object.fromEntries(scoreBook(rows).map((c) => [c.name, c.segment]));

/* ========================================================================= */
console.log("\nTHE BUG: a B2B book that orders 6x a year");
/* ========================================================================= */
{
  // Exactly the sample manufacturer, as it rendered in production.
  const book = [
    { id: "1", name: "Pioneer Exports",   recency: 6,  frequency: 6, monetary: 3450000 },
    { id: "2", name: "Apex Traders",      recency: 7,  frequency: 6, monetary: 2940000 },
    { id: "3", name: "M/s Metro Mart",    recency: 11, frequency: 6, monetary: 2940000 },
    { id: "4", name: "Nova Distributors", recency: 3,  frequency: 6, monetary: 2940000 },
    { id: "5", name: "Sunrise Retail",    recency: 2,  frequency: 6, monetary: 2685000 },
    { id: "6", name: "Gulf Imports",      recency: 16, frequency: 6, monetary: 2430000 },
  ];

  // The old rule, reproduced, to prove this test is pinning a REAL regression.
  const oldSegment = (r, f, m) =>
    r >= 4 && f >= 4 && m >= 4 ? "Champion"
    : f >= 4 && m >= 3 ? "Loyal"
    : r <= 2 && (f >= 3 || m >= 4) ? "At risk"
    : r <= 2 && f <= 2 ? "Lost"
    : r >= 4 && f <= 2 ? "New / promising"
    : "Needs attention";
  const oldAll = book.map((c) => oldSegment(
    c.recency <= 15 ? 5 : c.recency <= 30 ? 4 : 3, fScore(c.frequency), mScore(c.monetary)));
  check("OLD rule really did dump every one of them in 'Needs attention'",
    oldAll.every((s) => s === "Needs attention"));
  check("...and could not produce a Champion for this book at all",
    !oldAll.includes("Champion"));

  const now = segs(book);
  check("recent, high-revenue, repeat buyers are no longer 'Needs attention'",
    !now.includes("Needs attention"));
  check("the book now has Champions", now.includes("Champion"));
  const m = byName(book);
  check("Nova Distributors (ordered 3 days ago, ₹29.4L) is a Champion", m["Nova Distributors"] === "Champion");
  check("Sunrise Retail (ordered 2 days ago) is a Champion", m["Sunrise Retail"] === "Champion");
}

/* ========================================================================= */
console.log("\nTHE MIRROR CASE: a kirana whose customers spend ₹40k a year");
/* ========================================================================= */
{
  const book = [
    { id: "1", name: "Best",   recency: 4,  frequency: 30, monetary: 62000 },
    { id: "2", name: "Good",   recency: 9,  frequency: 22, monetary: 48000 },
    { id: "3", name: "Fair",   recency: 40, frequency: 12, monetary: 31000 },
    { id: "4", name: "Fading", recency: 120, frequency: 6, monetary: 18000 },
    { id: "5", name: "Gone",   recency: 300, frequency: 2, monetary: 4000 },
  ];
  const oldM = book.map((c) => mScore(c.monetary));
  check("OLD monetary scoring flattened this whole book to the bottom bands",
    oldM.every((m) => m <= 2));

  const m = byName(book);
  check("the shop's best customer is a Champion, not 'New / promising'", m["Best"] === "Champion");
  check("the lapsed one is still Lost", m["Gone"] === "Lost");
  check("the book spreads across more than two segments",
    new Set(Object.values(m)).size >= 3);
}

/* ========================================================================= */
console.log("\nThe fix must not just relabel everybody a Champion");
/* ========================================================================= */
{
  // The original example customers, which were always varied.
  const book = [
    { id: "c1", name: "A",      recency: 12,  frequency: 14, monetary: 1800000 },
    { id: "c2", name: "Nova",   recency: 45,  frequency: 9,  monetary: 950000 },
    { id: "c3", name: "C",      recency: 90,  frequency: 3,  monetary: 320000 },
    { id: "c4", name: "Zenith", recency: 20,  frequency: 11, monetary: 1200000 },
    { id: "c5", name: "B",      recency: 150, frequency: 2,  monetary: 120000 },
  ];
  const m = byName(book);
  check("the strong recent buyer is a Champion", m["A"] === "Champion");
  check("the valuable but quiet one is Loyal, not Champion", m["Nova"] === "Loyal");
  check("the long-silent low-value one is Lost", m["B"] === "Lost");
  check("a varied book spreads across at least three segments",
    new Set(Object.values(m)).size >= 3);
  check("not everyone is a Champion",
    Object.values(m).filter((s) => s === "Champion").length < book.length);
}

/* ========================================================================= */
console.log("\nIdentical customers must never land in different segments");
/* ========================================================================= */
{
  const book = [
    { id: "1", name: "Twin A", recency: 10, frequency: 5, monetary: 500000 },
    { id: "2", name: "Twin B", recency: 10, frequency: 5, monetary: 500000 },
    { id: "3", name: "Twin C", recency: 10, frequency: 5, monetary: 500000 },
    { id: "4", name: "Other",  recency: 80, frequency: 1, monetary: 20000 },
  ];
  const m = byName(book);
  check("ties score identically", m["Twin A"] === m["Twin B"] && m["Twin B"] === m["Twin C"]);
  check("...and the outlier still separates", m["Other"] !== m["Twin A"]);
}

/* ========================================================================= */
console.log("\nRelative scoring: guards and edges");
/* ========================================================================= */
check("a book too small to rank falls back to absolute (returns 1)",
  relativeScore([5, 5, 5], 5, true) === 1);
check("the top of a big book ranks 5", relativeScore([1, 2, 3, 4, 5], 5, true) === 5);
check("the bottom of a big book ranks 1", relativeScore([1, 2, 3, 4, 5], 1, true) === 1);
check("lower-is-better inverts correctly", relativeScore([1, 2, 3, 4, 5], 1, false) === 5);
check("scores never leave 1..5", [1, 2, 3, 4, 5, 6, 7, 8].every((v) => {
  const s = relativeScore([1, 2, 3, 4, 5, 6, 7, 8], v, true); return s >= 1 && s <= 5;
}));

console.log("\nSegment boundaries");
check("recent + valuable = Champion", segmentOf(5, 5) === "Champion");
check("valuable but quiet = Loyal", segmentOf(3, 4) === "Loyal");
check("silent but was worth something = At risk", segmentOf(2, 3) === "At risk");
check("silent and low value = Lost", segmentOf(1, 1) === "Lost");
check("recent but unproven = New / promising", segmentOf(5, 1) === "New / promising");
check("the middle still has a home", segmentOf(3, 3) === "Needs attention");

console.log("\nDegenerate input must not throw");
{
  const empty = scoreBook([]);
  check("an empty book returns an empty result", Array.isArray(empty) && empty.length === 0);
  const one = scoreBook([{ id: "1", name: "Only", recency: 5, frequency: 5, monetary: 500000 }]);
  check("a single customer still scores", one.length === 1 && one[0].r >= 1 && one[0].r <= 5);
  const zeros = scoreBook([{ id: "1", name: "Zero", recency: 0, frequency: 0, monetary: 0 }]);
  check("all-zero input does not produce NaN",
    Number.isFinite(zeros[0].r) && Number.isFinite(zeros[0].value));
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
