/*
  DATASET DETECTION — does the importer know an invoice register when it sees one?

  Run with:  npm run test:import-detect

  The bug being guarded against: the dataset dropdown defaults to "Sales orders",
  so an owner who exported their invoices, uploaded them, and pressed Import
  without touching the dropdown had their invoices written into sales_orders. All
  the headers matched, so it reported success and ticked the setup step off — and
  no receivables warning could ever appear, which is the entire thing the product
  is sold on.

  The headers below are the real ones. Tally writes "Party's Name" and
  "Voucher No.", Vyapar writes "Invoice Number" and "Customer Name", Zoho writes
  "Invoice Date" / "Due Date", and a shop's own Excel writes whatever it likes.
  A detector that only works on our own column names is a detector that works on
  the one file nobody has.

  Executes the real module.
*/

import { detectDataset, mismatchWarning, datasetLabel } from "../src/lib/import-detect.ts";

let pass = 0;
const fails = [];
function check(cond, name, detail = "") {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** The datasets the import screen actually offers. */
const OFFERED = ["sales_orders", "invoices", "inventory_items", "employees", "leads", "customers", "production_runs"];

const guess = (headers) => detectDataset(headers, OFFERED);

/* ================================================= invoices, the critical one */
{
  const cases = [
    ["our own columns", ["invoice_no", "party", "amount", "due_date", "status", "type"]],
    ["Vyapar", ["Invoice Number", "Customer Name", "Total Amount", "Due Date", "Status"]],
    ["Tally voucher register", ["Voucher No.", "Party's Name", "Amount", "Due Date"]],
    ["Zoho-ish", ["Invoice ID", "Customer", "Invoice Date", "Due Date", "Total", "Status"]],
    ["a shop's own Excel", ["Bill No", "Party", "Amt", "Due Date"]],
    ["minimal — number and due date only", ["Invoice No", "Due Date"]],
  ];
  for (const [name, headers] of cases) {
    const g = guess(headers);
    check(g !== null, `invoices/${name}: something detected`);
    check(g && g.table === "invoices", `invoices/${name}: detected as invoices`, g ? g.table : "null");
    check(g && g.confident, `invoices/${name}: confident enough to act on`, g ? `signals=${g.signals}` : "null");
  }
}

/* An invoice file must NEVER be left as sales_orders — the original bug. */
{
  const g = guess(["Invoice Number", "Customer Name", "Total Amount", "Due Date", "Status"]);
  check(g.table !== "sales_orders", "an invoice register is never mistaken for sales orders", g.table);

  const w = mismatchWarning("sales_orders", g);
  check(typeof w === "string" && w.length > 0, "a warning is produced when the user leaves the default");
  check(/Receivables/i.test(w), "the warning names Receivables — the consequence, not the mismatch", String(w));
  check(/switch/i.test(w), "the warning says what to do about it", String(w));
}

/* ================================================================ sales orders */
{
  const cases = [
    ["our own columns", ["order_no", "customer_name", "region", "product", "amount", "status"]],
    ["a sales register", ["Order No", "Customer", "Region", "Product", "Amount"]],
    ["order number and region only", ["Order Number", "Region"]],
  ];
  for (const [name, headers] of cases) {
    const g = guess(headers);
    check(g && g.table === "sales_orders", `sales_orders/${name}: detected`, g ? g.table : "null");
  }
}

/* ================================================================== inventory */
{
  for (const [name, headers] of [
    ["our own columns", ["sku", "name", "category", "on_hand", "reorder_level", "unit_cost", "supplier"]],
    ["a stock list", ["SKU", "Item Name", "Qty On Hand", "Reorder Level", "Unit Cost"]],
    ["Busy-ish", ["Item Code", "Description", "Closing Stock", "Rate"]],
  ]) {
    const g = guess(headers);
    check(g && g.table === "inventory_items", `inventory/${name}: detected`, g ? g.table : "null");
  }
}

/* ================================================================== employees */
{
  for (const [name, headers] of [
    ["our own columns", ["name", "department", "role", "monthly_ctc", "performance"]],
    ["a payroll sheet", ["Employee Name", "Department", "Designation", "Monthly CTC"]],
  ]) {
    const g = guess(headers);
    check(g && g.table === "employees", `employees/${name}: detected`, g ? g.table : "null");
  }
}

/* ============================================================ production runs */
{
  const g = guess(["Machine", "Shift", "Run Date", "Planned Qty", "Actual Qty", "Reject Qty"]);
  check(g && g.table === "production_runs", "production runs detected", g ? g.table : "null");
}

/* ===================================== IT MUST REFUSE TO GUESS WHEN UNSURE */
{
  /*
    leads and customers are both name/email/phone. There is no honest way to
    tell them apart from headers, and a confident wrong switch moves the
    owner's data somewhere they did not ask for.
  */
  const g = guess(["Name", "Email", "Phone"]);
  check(g === null || !g.confident, "name/email/phone is NOT confidently classified", g ? `${g.table} confident=${g.confident}` : "null");

  const w = mismatchWarning("leads", g);
  check(w === null, "no warning is shown when the guess is not confident");
}

{
  /* A single generic column is not evidence of anything. */
  const g = guess(["Name"]);
  check(g === null || !g.confident, "a lone 'Name' column is not confident", g ? `${g.table}` : "null");
}

{
  /*
    A COMBINED REGISTER — the case the margin rule exists for.

    Plenty of SMEs keep one sheet with both an order number and an invoice
    number on every line. Both datasets then find a signature column and score
    within a rounding error of each other (14 vs 13.86). Picking one would be a
    coin toss that silently moves the owner's data, so it must not be confident.
  */
  const g = guess(["Order No", "Invoice No", "Party", "Amount"]);
  check(g !== null, "combined register: a guess is still returned for display");
  check(g && g.signals >= 1, "combined register: signature columns ARE found", g ? `signals=${g.signals}` : "null");
  check(g && !g.confident, "combined register: two close scores are never confident", g ? `${g.table} score margin too small` : "null");
  check(mismatchWarning("sales_orders", g) === null, "combined register: no switch is proposed");
  check(mismatchWarning("invoices", g) === null, "combined register: no switch either way");
}

{
  /*
    Generic columns only. `signals` must report 0 — the field the confidence
    rule reads — and the guess must not be actionable.
  */
  const g = guess(["Customer Name", "Amount"]);
  check(g && g.signals === 0, "generic columns report zero signature signals", g ? `signals=${g.signals}` : "null");
  check(g && !g.confident, "generic columns are not confident", g ? g.table : "null");
}

{
  /*
    Junk headers must never CONFIDENTLY classify.

    "bar" substring-matches `barcode`, which resolveHeaders maps to `sku` — a
    signature column for inventory. So this file genuinely does score one
    signal, and the original margin rule made it confident enough to switch the
    owner's dataset to Inventory items on the strength of a column called "bar".
    A non-confident guess is fine; acting on it is not.
  */
  const g = guess(["foo", "bar", "baz", "qux"]);
  check(g === null || !g.confident, "junk headers are never confident", g ? `${g.table} matched=${g.matched}` : "null");
  check(mismatchWarning("sales_orders", g) === null, "junk headers never trigger a dataset switch");
}

/* One accidental column match is not a file. Two is the floor. */
{
  const g = guess(["Due Date"]);
  check(g === null || !g.confident, "a single matched column is never confident", g ? `matched=${g.matched}` : "null");
}

/* ======================================================= no warning when right */
{
  const g = guess(["Invoice Number", "Party", "Amount", "Due Date"]);
  check(mismatchWarning("invoices", g) === null, "no warning when the chosen dataset already matches");
}

/* ============================================================ degenerate input */
{
  check(detectDataset([]) === null, "empty headers: null");
  check(detectDataset(null) === null, "null headers: null");
  check(detectDataset(["", "  ", ""]) === null, "blank headers: null");
  check(detectDataset(["Invoice No", "Due Date"], []) !== null, "empty candidate list falls back to all datasets");
  check(detectDataset(["Invoice No", "Due Date"], ["nonexistent_table"]) === null, "unknown candidates are dropped");
  check(mismatchWarning("invoices", null) === null, "null guess produces no warning");
}

/* The guess must only ever name a dataset the caller offered — otherwise the UI
   would switch to something the dropdown cannot select. */
{
  const g = detectDataset(["Invoice No", "Party", "Due Date", "Amount"], ["sales_orders", "employees"]);
  check(g === null || ["sales_orders", "employees"].includes(g.table),
    "never returns a table outside the offered candidates", g ? g.table : "null");
}

/* ===================================================================== labels */
{
  check(datasetLabel("invoices") === "Invoices", "label for invoices");
  check(datasetLabel("inventory_items") === "Inventory items", "label for inventory_items");
  check(datasetLabel("unknown_thing") === "unknown_thing", "unknown table falls back to its key");
}

console.log(`\nimport detection: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log("  FAIL " + f);
  process.exit(1);
}
