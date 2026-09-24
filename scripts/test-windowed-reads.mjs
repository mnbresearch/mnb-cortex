/**
 * Two places where a BOUND was mistaken for an ANSWER.
 *
 * ============================================================================
 * THE SHARED MISTAKE
 * ============================================================================
 *
 * Both defects come from reading N rows and then reporting on a period or a
 * population that N rows does not cover.
 *
 *   /usage   drew a chart headed "Usage — last 14 days" from
 *            `getLedger(orgId, 60)` — the sixty most recent ledger rows,
 *            covering whatever span those happened to be. On a workspace that
 *            spends briskly, sixty rows is two or three days, and the chart
 *            then drew days 4 to 14 as bars of height zero. That is not a gap
 *            in the data on screen; it is an assertion that the business spent
 *            nothing on those days. The variable feeding the stat card was
 *            called `spent30`. On a billing page, understating a customer's
 *            own consumption is the worst direction to be wrong in.
 *
 *   /data    ran its search box over the fifteen rows of the CURRENT PAGE.
 *            A record on page 4 could not be found from page 1, so searching
 *            told an owner a record did not exist when it did; the footer
 *            printed the unfiltered row count over a filtered list; and "page
 *            2 of a search" meant "matches among rows 16–30 of the unfiltered
 *            table", which is not a page of anything.
 *
 * The fix in both cases is to bound by the thing being reported — a window of
 * time, a population of matches — and to DISCLOSE the safety cap rather than
 * letting a truncated total present itself as complete. This repo has already
 * had to remove silent 1000-row ceilings once.
 */

import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(`${n}${d ? "\n      " + d : ""}`));
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ======================================================================== */
/* 1. /usage reads a WINDOW, not a row count                                */
/* ======================================================================== */

const credits = strip(src("src/lib/credits.ts"));
check(/export async function getLedgerSince/.test(credits),
  "a date-bounded ledger read exists");

/*
  SCOPED TO THE FUNCTION BODY, not the file.

  My first version asked whether `.gte("created_at", since)` appeared anywhere
  in credits.ts. It does appear elsewhere, so deleting it from getLedgerSince
  still passed — the same "a count can be satisfied by the wrong lines"
  mistake the quote tenancy guard made earlier in this tranche. A whole-file
  match is not evidence about one function.
*/
const since0 = credits.indexOf("export async function getLedgerSince");
const sinceFn = credits.slice(since0, credits.indexOf("\n}", since0));
check(sinceFn.length > 200, "found the getLedgerSince body", `saw ${sinceFn.length} chars`);
check(/\.gte\("created_at",\s*since\)/.test(sinceFn),
  "…and it really is bounded by date",
  "A function named 'since' that bounds by row count would be worse than the bug.");
check(/truncated:\s*rows\.length >= cap/.test(sinceFn),
  "…and reports when the safety cap bound",
  "Without this, a truncated total presents itself as a complete one.");

const usage = strip(src("src/app/(app)/usage/page.tsx"));
check(/getLedgerSince\(/.test(usage), "/usage uses the windowed read");
check(!/spent30/.test(usage),
  "/usage no longer has a `spent30` computed from 60 rows",
  "The name asserted thirty days; the data was sixty rows of unknown span.");
check(/WINDOW_DAYS/.test(usage) && /Spent \(\{WINDOW_DAYS\} days\)/.test(usage),
  "/usage names the window it measured",
  "\"Spent (recent)\" meant \"however long the last 60 rows covered\".");
check(/window_\.truncated/.test(usage),
  "/usage says when the figure is a floor rather than a total");
/* The chart must be fed by the windowed read, not the row-capped one — the
   whole point is that every day in the chart is covered. */
check(/for \(const e of window_\.rows\)/.test(usage),
  "the 14-day chart is built from the windowed rows");

/* ======================================================================== */
/* 2. /data searches the table, not the page                                */
/* ======================================================================== */

const data = strip(src("src/lib/data.ts"));
const fn = data.slice(data.indexOf("export async function getTableRows"), data.indexOf("export { EXPLORE_TABLES }"));
check(fn.length > 400, "found getTableRows", `saw ${fn.length} chars`);

check(/if \(!term\)/.test(fn),
  "the unsearched path is separate",
  "Paging without a search should still ask Postgres for exactly 15 rows.");

/*
  The precise defect: a .range() page fetch whose result is then filtered.

  Asserted PER BRANCH, not over the whole function. My first version searched
  for `.range(` followed within 400 characters by `.filter(` anywhere in the
  body — and it fired on the correct implementation, because the unsearched
  branch legitimately ranges and the searched branch legitimately filters, and
  the two sit near each other. A proximity match across a branch boundary is
  not evidence of anything.
*/
const splitAt = fn.indexOf("const { data } = await sb.from(table)\n    .select(\"*\").eq(\"org_id\", orgId)");
check(splitAt > 0, "found the boundary between the two read paths");
const unsearched = fn.slice(0, splitAt > 0 ? splitAt : fn.length);
const searched = splitAt > 0 ? fn.slice(splitAt) : "";

/*
  ROWS, not column names. `Object.keys(sample).filter(...)` drops `org_id` and
  `id` from the header list and is present in both branches — my first version
  of this check flagged it, which would have been a guard that fails on
  correct code. What must never happen is a fetched PAGE of rows being
  narrowed afterwards.
*/
const dropsRows = (s) => /\brows\s*=\s*[\s\S]{0,40}\.filter\(|\bdata[\s\S]{0,30}\)\.filter\(/.test(s);
check(!dropsRows(unsearched),
  "the UNSEARCHED path never drops rows after fetching them",
  "It asks Postgres for exactly the fifteen rows it needs.");
check(!/\.range\(/.test(searched),
  "the SEARCHED path never asks Postgres for a single page",
  "Ranging to page N and then filtering is a search box that searches only " +
  "what is already on screen — a record on page 4 is invisible from page 1.");
check(/\.range\(/.test(unsearched), "…but the unsearched path does still range");
check(/scanned\.filter\(/.test(searched),
  "…and the searched path filters the whole scanned set");
check(/matches\.slice\(from, from \+ per\)/.test(fn),
  "when searching, the MATCHES are paged",
  "Otherwise page 2 means 'matches among rows 16-30 of the unfiltered table'.");
check(/total:\s*matches\.length/.test(fn),
  "…and the count reported is the count of matches",
  "It used to print the unfiltered table count above a filtered list.");
check(/searchTruncated:\s*scanned\.length >= SEARCH_SCAN_CAP/.test(fn),
  "…and the scan cap is reported when it binds");
check(/const sample = rows\[0\] \|\| matches\[0\] \|\| scanned\[0\]/.test(fn),
  "columns survive a page with no rows on it",
  "Taking headers from rows[0] alone renders a headerless table when every " +
  "match lands on a later page.");

const dataPage = strip(src("src/app/(app)/data/page.tsx"));
check(/match\$\{total === 1 \? "" : "es"\}|matches/.test(dataPage),
  "/data labels the number as matches while searching");
check(/searchTruncated/.test(dataPage),
  "/data discloses the search ceiling",
  "An undisclosed ceiling on a search is a claim that nothing else matched.");

/* ======================================================================== */
/* 3. THE PAGING ARITHMETIC, EXECUTED                                       */
/* ======================================================================== */

/*
  Re-implemented here from the same slice expression, so the off-by-one that
  would silently drop or duplicate a row on every page boundary is caught by
  arithmetic rather than by a regex agreeing with itself.
*/
const per = 15;
const pageOf = (arr, page) => arr.slice(page * per, page * per + per);
const universe = Array.from({ length: 37 }, (_, i) => i);

check(pageOf(universe, 0).length === 15, "page 0 holds 15 of 37");
check(pageOf(universe, 1).length === 15, "page 1 holds 15 of 37");
check(pageOf(universe, 2).length === 7, "page 2 holds the remaining 7");
check(pageOf(universe, 3).length === 0, "page 3 is empty, not an error");
check(pageOf(universe, 0)[14] === 14 && pageOf(universe, 1)[0] === 15,
  "the page boundary neither drops nor repeats a row");
/* The pager in /data shows Next while (page+1)*per < total. */
const pages = (total) => Math.max(1, Math.ceil(total / per));
check(pages(37) === 3, "37 matches is 3 pages");
check(pages(15) === 1, "exactly 15 matches is 1 page");
check(pages(0) === 1, "zero matches still renders one (empty) page, not zero");

/* ======================================================================== */

console.log(`\nwindowed reads: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n  - " + failures.join("\n  - ") + "\n");
  process.exit(1);
}
