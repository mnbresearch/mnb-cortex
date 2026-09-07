/*
  THE IMPORTER, EXECUTED — not read.

  WHY THIS EXISTS

  Importing a file is the first thing a paying customer does and the single
  riskiest path in the product: everything downstream (receivables, the MSME
  window, revenue, the collections agent) is computed from whatever these rows
  turn into. Four separate bugs have been found in it, all by reading the code:

    - Headers were read verbatim, so a file headed "Invoice No" / "Party" /
      "Amount" matched nothing, inserted rows containing only org_id, and
      reported "Imported N rows".
    - Orders imported without a status contributed ZERO revenue, because
      metrics.ts counts only status === "won" — giving "Orders 500, Revenue ₹0".
    - "Paid" or "PAID" from a Tally export failed the case-sensitive
      `status <> 'paid'` test used by every read, so a settled invoice looked
      unpaid — and would have been CHASED by the collections agent.
    - The URL/Google-Sheets importer had none of those three fixes.

  Reading found them; reading also let each of them live for a while. This runs
  the REAL functions — resolveHeaders, applyMapping and mapImportedRow, imported
  from src/lib/import-map.ts — over files shaped like the exports Indian SMEs
  actually produce. Node 22 strips the types, so this is the shipping code, not
  a reimplementation of it.

  What it cannot do: prove the database write, the RLS policy or the UI. Those
  need a browser and a real session. What it does prove is that a real file
  turns into the right rows.
*/
import { resolveHeaders, applyMapping, mapImportedRow, IMPORT_COLS } from "../src/lib/import-map.ts";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); }
}
function eq(name, got, want) {
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

/** The whole pipeline, exactly as importRows and importFromUrl now run it. */
function importFile(table, rows) {
  const spec = IMPORT_COLS[table];
  const headers = Object.keys(rows[0] || {});
  const match = resolveHeaders(table, headers);
  if (match.matched === 0) return { refused: true, match, mapped: [] };
  return {
    refused: false,
    match,
    mapped: rows.map((r) => mapImportedRow(table, spec, "ORG", applyMapping(r, match))),
  };
}

/* =======================================================================
   1. TALLY — the export most of these customers actually have.
   Tally writes title-case headers with spaces and "Paid" capitalised.
   ======================================================================= */
{
  const tally = [
    { "Invoice No": "INV-001", "Party Name": "Sharma Traders", "Amount": "1,20,000.00", "Due Date": "2026-08-01", "Status": "Paid", "Type": "Receivable" },
    { "Invoice No": "INV-002", "Party Name": "Verma & Co", "Amount": "85,500.50", "Due Date": "2026-08-15", "Status": "Pending", "Type": "Receivable" },
    { "Invoice No": "PUR-009", "Party Name": "Steel Supply Ltd", "Amount": "2,40,000", "Due Date": "2026-07-20", "Status": "Pending", "Type": "Payable" },
  ];
  const r = importFile("invoices", tally);

  check("Tally: the file is accepted, not refused", !r.refused,
    `resolveHeaders matched ${r.match.matched}/${r.match.total} columns`);

  eq("Tally: the party name survives", r.mapped[0]?.party, "Sharma Traders");

  /*
    Indian digit grouping. "1,20,000.00" is twelve lakh formatted the Indian
    way; a naive parseFloat stops at the first comma and yields 1.
  */
  eq("Tally: ₹1,20,000.00 parses as 120000, not 1", r.mapped[0]?.amount, 120000);
  eq("Tally: paise are kept", r.mapped[1]?.amount, 85500.5);

  /*
    THE ONE THAT WOULD HAVE CHASED A PAYING CUSTOMER'S CUSTOMER.
    Every read tests `status <> 'paid'` case-sensitively.
  */
  eq('Tally: "Paid" is folded to "paid" so a settled bill is not chased', r.mapped[0]?.status, "paid");
  eq('Tally: "Receivable" is folded to "receivable"', r.mapped[0]?.type, "receivable");
  eq('Tally: "Payable" survives as payable (it drives the MSME 45-day window)', r.mapped[2]?.type, "payable");

  // No blank rows: every row carries an org and a party.
  check("Tally: no row is blank", r.mapped.every((m) => m.org_id && m.party && m.amount > 0));
}

/* =======================================================================
   2. VYAPAR / a shop's own Excel — different words for the same things.
   ======================================================================= */
{
  const vyapar = [
    { "Bill Number": "B-77", "Customer": "Anand Electricals", "Total Amount": "45000", "Payment Status": "unpaid", "Due On": "2026-09-01" },
  ];
  const r = importFile("invoices", vyapar);
  check("Vyapar: accepted", !r.refused, `matched ${r.match.matched}/${r.match.total}`);
  eq("Vyapar: the customer becomes the party", r.mapped[0]?.party, "Anand Electricals");
  eq("Vyapar: the amount lands", r.mapped[0]?.amount, 45000);
  eq("Vyapar: an unpaid bill stays unpaid", r.mapped[0]?.status, "unpaid");
}

/* =======================================================================
   3. SALES ORDERS — the zero-revenue trap.
   ======================================================================= */
{
  const orders = [
    { "Order No": "SO-1", "Customer Name": "Gupta Stores", "Amount": "50000" },
    { "Order No": "SO-2", "Customer Name": "Rao Retail", "Amount": "75000", "Status": "won" },
  ];
  const r = importFile("sales_orders", orders);
  check("Orders: accepted", !r.refused, `matched ${r.match.matched}/${r.match.total}`);
  /*
    metrics.ts counts revenue only where status === "won". Without this default
    an import of 500 orders showed "Orders 500 / Revenue ₹0" and nothing on the
    screen explained the contradiction.
  */
  eq('Orders: a missing status defaults to "won" so revenue is not zero', r.mapped[0]?.status, "won");
  eq("Orders: an explicit status is respected", r.mapped[1]?.status, "won");
  eq("Orders: the customer name maps", r.mapped[0]?.customer_name, "Gupta Stores");
}

/* =======================================================================
   4. THE FILE THAT MUST BE REFUSED.
   Blank rows reported as success is the failure that looks like success.
   ======================================================================= */
{
  const nonsense = [{ "Foo": "1", "Bar": "2", "Baz": "3" }];
  const r = importFile("invoices", nonsense);
  check("Nonsense headers are REFUSED, not imported as blanks", r.refused,
    "an unrecognised file must import nothing rather than N empty rows");
}

/* =======================================================================
   5. MESSY REALITY — currency symbols, whitespace, empty cells, junk.
   ======================================================================= */
{
  const messy = [
    { "  Invoice No  ": " INV-9 ", "Party": "  Kumar Bros  ", "Amount": "₹ 12,500 ", "Status": "  PAID  ", "Type": "RECEIVABLE" },
    { "  Invoice No  ": "INV-10", "Party": "Empty Amount Co", "Amount": "", "Status": "pending", "Type": "receivable" },
  ];
  const r = importFile("invoices", messy);
  check("Messy: accepted despite padded headers", !r.refused, `matched ${r.match.matched}/${r.match.total}`);
  eq("Messy: a ₹ symbol and spaces do not break the amount", r.mapped[0]?.amount, 12500);
  eq('Messy: "  PAID  " folds to "paid"', r.mapped[0]?.status, "paid");
  eq('Messy: "RECEIVABLE" folds to "receivable"', r.mapped[0]?.type, "receivable");
  /*
    An empty cell must be ABSENT, not zero. Writing 0 would invent a ₹0 invoice
    and drag the receivables total down with a number nobody entered.
  */
  check("Messy: an empty amount is omitted rather than written as 0",
    r.mapped[1] && !("amount" in r.mapped[1]),
    `amount was ${JSON.stringify(r.mapped[1]?.amount)}`);
}

/* =======================================================================
   6. AN UNKNOWN TYPE MUST NOT BECOME A PAYABLE.
   type drives the MSME 43B(h) exposure, which is a tax figure.
   ======================================================================= */
{
  const odd = [{ "Invoice No": "X-1", "Party": "Someone", "Amount": "1000", "Type": "sales invoice" }];
  const r = importFile("invoices", odd);
  eq("An unrecognised type falls back to receivable, never payable", r.mapped[0]?.type, "receivable");
}

/* =======================================================================
   7. INVENTORY AND EMPLOYEES — the other two importable shapes.
   ======================================================================= */
{
  const stock = [{ "SKU": "RM-1", "Item Name": "Copper wire", "Quantity": "250", "Reorder Level": "100", "Unit Cost": "1,250.75" }];
  const r = importFile("inventory_items", stock);
  check("Inventory: accepted", !r.refused, `matched ${r.match.matched}/${r.match.total}`);
  eq("Inventory: quantity maps to on_hand", r.mapped[0]?.on_hand, 250);
  eq("Inventory: unit cost keeps its paise", r.mapped[0]?.unit_cost, 1250.75);

  const staff = [{ "Employee Name": "Priya Nair", "Department": "Sales", "Monthly CTC": "85,000" }];
  const r2 = importFile("employees", staff);
  check("Employees: accepted", !r2.refused, `matched ${r2.match.matched}/${r2.match.total}`);
  eq("Employees: the name maps", r2.mapped[0]?.name, "Priya Nair");
  eq("Employees: CTC parses with Indian grouping", r2.mapped[0]?.monthly_ctc, 85000);
}

/* =======================================================================
   8. NO ROW MAY EVER LEAVE WITHOUT AN ORG.
   A row without org_id is either rejected by the database or, worse, visible
   to the wrong tenant.
   ======================================================================= */
{
  const r = importFile("invoices", [{ "Invoice No": "T-1", "Party": "X", "Amount": "1" }]);
  check("every mapped row carries its org_id", r.mapped.every((m) => m.org_id === "ORG"));
}

/* ------------------------------------------------------------------- report */
console.log(`\nimporter: ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log("  Real Tally / Vyapar / Excel shapes run through the shipping importer produce correct rows.");
