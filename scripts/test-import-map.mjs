/**
 * Header matching, against the files customers actually have.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS.
 *
 * Onboarding makes "Import my own data" the primary action. It landed on an
 * importer that read `r["customer_name"]` verbatim, so a file headed
 * `Order No, Customer, Amount` matched nothing, inserted blank rows, and
 * reported success. Nobody exports a column called `customer_name` — not Tally,
 * not Vyapar, not Busy, and certainly not a shop's own spreadsheet. So the
 * product's front door failed silently for essentially every real user, and the
 * fair conclusion from the owner's side was that Cortex did not work.
 *
 * The fixtures below are shaped like the real exports rather than invented to
 * pass. Two properties are asserted throughout:
 *
 *   1. the right SOURCE column feeds the right TARGET column — not merely that
 *      "something matched", which a sloppy fuzzy matcher achieves by accident
 *   2. one source header is never claimed by two targets, because a sheet with
 *      a single `Name` column filling both customer and product looks like a
 *      successful import and is nonsense
 */

import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
const ok = () => pass++;
const bad = (n, d) => failures.push(`${n}\n      ${d}`);
const check = (c, n, d = "") => (c ? ok() : bad(n, d));

/*
  Load the real shipping module by running it through TypeScript's OWN compiler.

  The first version of this stripped types with regexes and broke on the first
  generic it met. Hand-rolled transpiling is exactly the kind of thing that
  fails in a way that looks like the code under test is broken — so use the
  compiler that is already a dependency of this repo.
*/
import ts from "typescript";

const src = readFileSync("src/lib/import-map.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

let mod;
try {
  const exports = {};
  new Function("exports", "require", js)(exports, () => ({}));
  mod = exports;
} catch (e) {
  console.log(`\nimport map: could not load the module — ${e.message}`);
  process.exit(1);
}
const { normalizeHeader, resolveHeaders, applyMapping, COLUMN_ALIASES } = mod;

/* ---- the load must be real, or everything below passes for nothing ------- */
check(typeof resolveHeaders === "function", "parse: loaded resolveHeaders");
check(Object.keys(COLUMN_ALIASES).length >= 6,
  "parse: loaded the alias table", `only ${Object.keys(COLUMN_ALIASES || {}).length} tables`);
check(normalizeHeader("Order No.") === "orderno", "normalize: 'Order No.' -> orderno",
  `got ${normalizeHeader("Order No.")}`);
check(normalizeHeader("CUSTOMER-NAME") === "customername", "normalize: strips case and punctuation");

/* ---------------------------------------------------- real-world fixtures */

const CASES = [
  {
    name: "a shop's own Excel",
    table: "sales_orders",
    headers: ["Order No", "Customer", "City", "Item", "Amount", "Status"],
    expect: { order_no: "Order No", customer_name: "Customer", region: "City", product: "Item", amount: "Amount", status: "Status" },
  },
  {
    name: "Tally sales register",
    table: "sales_orders",
    headers: ["Voucher No.", "Particulars", "Item Name", "Debit"],
    expect: { order_no: "Voucher No.", customer_name: "Particulars", product: "Item Name", amount: "Debit" },
  },
  {
    name: "Vyapar invoice export",
    table: "invoices",
    headers: ["Invoice Number", "Party Name", "Total Amount", "Due Date", "Payment Status"],
    expect: { invoice_no: "Invoice Number", party: "Party Name", amount: "Total Amount", due_date: "Due Date", status: "Payment Status" },
  },
  {
    name: "stock summary",
    table: "inventory_items",
    headers: ["Item Code", "Item Name", "Stock Group", "Closing Stock", "Reorder Level", "Purchase Rate", "Supplier"],
    expect: { sku: "Item Code", name: "Item Name", category: "Stock Group", on_hand: "Closing Stock", reorder_level: "Reorder Level", unit_cost: "Purchase Rate", supplier: "Supplier" },
  },
  {
    name: "payroll sheet",
    table: "employees",
    headers: ["Employee Name", "Dept", "Designation", "Monthly Salary", "Rating"],
    expect: { name: "Employee Name", department: "Dept", role: "Designation", monthly_ctc: "Monthly Salary", performance: "Rating" },
  },
  {
    name: "already-correct file (must still match exactly)",
    table: "sales_orders",
    headers: ["order_no", "customer_name", "region", "product", "amount", "status"],
    expect: { order_no: "order_no", customer_name: "customer_name", region: "region", product: "product", amount: "amount", status: "status" },
  },
  {
    name: "messy spacing and case",
    table: "customers",
    headers: [" CUSTOMER NAME ", "Company Name", "E-Mail", "Mobile No", "Status", "Lifetime Value"],
    expect: { name: " CUSTOMER NAME ", company: "Company Name", email: "E-Mail", phone: "Mobile No", status: "Status", value: "Lifetime Value" },
  },
];

for (const c of CASES) {
  const m = resolveHeaders(c.table, c.headers);
  for (const [col, wanted] of Object.entries(c.expect)) {
    check(m.map[col] === wanted, `${c.name}: ${col} <- "${wanted}"`,
      `got "${m.map[col] ?? "(nothing)"}"`);
  }
  // No header may serve two columns.
  const used = Object.values(m.map);
  check(new Set(used).size === used.length, `${c.name}: no header claimed twice`,
    `duplicates in ${JSON.stringify(used)}`);
}

/* ------------------------------------------------------- the failure cases */

// Nothing recognisable must NOT quietly "match" something.
const junk = resolveHeaders("sales_orders", ["foo", "bar", "baz", "qux"]);
check(junk.matched === 0, "junk headers match nothing",
  `matched ${junk.matched}: ${JSON.stringify(junk.map)}`);
check(junk.missing.length === junk.total, "junk headers report every column missing");

// A partial file reports precisely what is missing, so the UI can say so.
const partial = resolveHeaders("sales_orders", ["Order No", "Customer"]);
check(partial.matched === 2, "partial file matches exactly the two present columns",
  `matched ${partial.matched}`);
check(partial.missing.includes("amount"), "partial file reports amount as missing");
check(partial.unused.length === 0, "partial file has no unused headers");

// Extra columns we do not care about are reported as unused, not forced in.
const extra = resolveHeaders("sales_orders", ["Order No", "Customer", "Amount", "Salesman Notes", "Internal Ref"]);
check(extra.unused.length === 2, "unrecognised extra columns are reported as unused",
  `unused = ${JSON.stringify(extra.unused)}`);

/* ------------------------------------------------------------ applyMapping */

const m = resolveHeaders("sales_orders", ["Order No", "Customer", "Amount"]);
const rowOut = applyMapping({ "Order No": "SO-1", "Customer": "Sharma Traders", "Amount": "12,500" }, m);
check(rowOut.order_no === "SO-1", "applyMapping: pulls order_no", JSON.stringify(rowOut));
check(rowOut.customer_name === "Sharma Traders", "applyMapping: pulls customer_name", JSON.stringify(rowOut));
check(rowOut.amount === "12,500", "applyMapping: pulls amount verbatim for the caller to parse");
check(applyMapping({ "Order No": "", "Customer": "X", "Amount": "1" }, m).order_no === undefined,
  "applyMapping: an empty cell is omitted, not written as an empty string");

console.log(`\nimport map: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log(`  ${CASES.length} real-world export shapes mapped correctly; junk still matches nothing.`);
