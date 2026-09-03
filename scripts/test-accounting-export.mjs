/**
 * Reading the files Tally, Vyapar and Busy actually produce.
 *
 * Matching header NAMES (lib/import-map.ts) is necessary and not sufficient,
 * because these tools do not emit a clean rectangle:
 *
 *   - title rows above the header, so row 0 is the company name
 *   - a TOTAL row at the bottom that is not a transaction
 *   - value split across Debit and Credit, neither of which alone is "amount"
 *   - the party written once per voucher and blank on continuation lines
 *   - dates as `1-Apr-2026`
 *
 * The worst of these is the total row. Import it as a transaction and the
 * customer's revenue is roughly double the truth, the import reports success,
 * and every downstream number is wrong in a way that looks plausible. So that
 * case is asserted directly, by summing the imported rows and comparing against
 * the stated total.
 *
 * The date case is the second worst: read `01/04/2026` as 4 January and a
 * quarter of the year lands in the wrong month, which nobody notices until a
 * comparison looks strange.
 */

import { readFileSync } from "node:fs";
import ts from "typescript";

let pass = 0;
const failures = [];
const ok = () => pass++;
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok() : bad(n, d));

const src = readFileSync("src/lib/accounting-export.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports_ = {};
new Function("exports", "require", js)(exports_, () => ({}));
const { flattenExport, findHeaderRow, detectSource, parseIndianDate, parseAmount } = exports_;

check(typeof flattenExport === "function", "parse: loaded the module");

/* ------------------------------------------------------- Tally Day Book */

const TALLY = [
  ["Sharma Steel Pvt Ltd"],
  ["Day Book"],
  ["1-Apr-2026 to 30-Apr-2026"],
  [],
  ["Date", "Particulars", "Voucher Type", "Voucher No.", "Debit", "Credit"],
  ["1-Apr-2026", "Patel Plastics", "Sales", "S-001", "1,20,000.00", ""],
  ["", "", "", "", "", ""],
  ["3-Apr-2026", "Gupta Traders", "Sales", "S-002", "85,000.00", ""],
  ["7-Apr-2026", "Mehta Industries", "Receipt", "R-010", "", "45,000.00"],
  ["Grand Total", "", "", "", "2,05,000.00", "45,000.00"],
];

{
  const r = flattenExport(TALLY);
  check(r.source === "tally", "Tally: detected", `got ${r.source}`);
  check(r.headerRow === 4, "Tally: found the header below three title rows", `headerRow=${r.headerRow}`);
  check(r.skippedTitles.length === 3, "Tally: reported the skipped titles", JSON.stringify(r.skippedTitles));

  // THE ONE THAT DOUBLES REVENUE.
  check(r.rows.length === 3, "Tally: the Grand Total row is NOT imported as a transaction",
    `${r.rows.length} rows: ${JSON.stringify(r.rows.map((x) => x["Particulars"]))}`);
  const sum = r.rows.reduce((n, x) => n + Number(x["Amount"] || 0), 0);
  check(sum === 250000, "Tally: imported rows sum to the real total, not double it", `sum = ${sum}`);

  // Debit/Credit collapsed.
  check(r.rows[0]["Amount"] === "120000", "Tally: Debit becomes Amount", r.rows[0]["Amount"]);
  check(r.rows[2]["Amount"] === "45000", "Tally: a Credit-only row still gets an Amount",
    `got ${r.rows[2]["Amount"]} — a Debit-only reader would zero this row`);

  check(r.rows[0]["Date"] === "2026-04-01", "Tally: 1-Apr-2026 becomes ISO", r.rows[0]["Date"]);
  check(r.rows[1]["Particulars"] === "Gupta Traders", "Tally: rows line up after the blank line is dropped");
}

/* ---------------------------------------------------------- Vyapar */

const VYAPAR = [
  ["Invoice Number", "Party Name", "Invoice Date", "Total Amount", "Payment Status"],
  ["INV-101", "Kirana Junction", "12/04/2026", "₹45,000", "Unpaid"],
  ["INV-102", "Metro Stores", "15/04/2026", "₹1,10,500", "Paid"],
  ["Total", "", "", "₹1,55,500", ""],
];
{
  const r = flattenExport(VYAPAR);
  check(r.source === "vyapar", "Vyapar: detected", `got ${r.source}`);
  check(r.headerRow === 0, "Vyapar: header is the first row");
  check(r.rows.length === 2, "Vyapar: the Total row is dropped", `${r.rows.length}`);
  check(r.rows[0]["Invoice Date"] === "2026-04-12",
    "Vyapar: 12/04/2026 is read DAY-first, as 12 April",
    `got ${r.rows[0]["Invoice Date"]} — month-first would put a quarter of the year in the wrong month`);
}

/* ------------------------------------------- a plain sheet must still work */

const PLAIN = [
  ["Order No", "Customer", "Amount"],
  ["SO-1", "Sharma Traders", "12500"],
  ["SO-2", "Patel & Co", "8000"],
];
{
  const r = flattenExport(PLAIN);
  check(r.source === "generic", "a plain sheet is not mistaken for an accounting export", r.source);
  check(r.rows.length === 2, "a plain sheet keeps every row");
  check(r.rows[0]["Order No"] === "SO-1", "a plain sheet is passed through unchanged");
}

/* ------------------------------- a real customer whose NAME contains "Total" */

const TRICKY = [
  ["Order No", "Customer", "Amount", "Date"],
  ["SO-1", "Total Solutions Pvt Ltd", "50000", "2026-04-01"],
  ["SO-2", "Anand Auto", "25000", "2026-04-02"],
  ["Total", "", "75000", ""],
];
{
  const r = flattenExport(TRICKY);
  check(r.rows.length === 2, "a customer called 'Total Solutions' is NOT dropped as a total row",
    `${r.rows.length} rows: ${JSON.stringify(r.rows.map((x) => x["Customer"]))}`);
  check(r.rows.some((x) => x["Customer"] === "Total Solutions Pvt Ltd"),
    "…and is still present by name");
  check(r.droppedTotals === 1, "…while the real total row IS dropped", `dropped ${r.droppedTotals}`);
}

/* ----------------------------------------------------------- primitives */

check(parseIndianDate("1-Apr-2026") === "2026-04-01", "date: 1-Apr-2026");
check(parseIndianDate("01/04/2026") === "2026-04-01", "date: 01/04/2026 is day-first");
check(parseIndianDate("2026-04-01") === "2026-04-01", "date: ISO passes through");
check(parseIndianDate("15-Dec-24") === "2024-12-15", "date: two-digit year");
check(parseIndianDate("rubbish") === null, "date: unparseable returns null, never a wrong date");

check(parseAmount("₹1,20,000.00") === "120000", "amount: strips ₹ and Indian grouping", parseAmount("₹1,20,000.00"));
check(parseAmount("(5,000)") === "-5000", "amount: brackets mean negative", parseAmount("(5,000)"));
check(parseAmount("") === "", "amount: empty stays empty");
check(parseAmount("N/A") === "", "amount: non-numeric returns empty rather than 0",
  `got "${parseAmount("N/A")}" — returning 0 would invent a transaction worth nothing`);

check(findHeaderRow([[ "Acme" ], [ "Day Book" ], [ "Date", "Particulars", "Debit" ]]) === 2,
  "header detection skips title rows");
check(findHeaderRow([["Date", "Party", "Amount"]]) === 0, "header detection finds row 0 when it is the header");

console.log(`\naccounting export: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  Tally/Vyapar shapes flattened; total rows dropped without eating a customer named Total.");
