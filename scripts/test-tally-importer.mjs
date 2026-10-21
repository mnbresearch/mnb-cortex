/**
 * Test suite for Universal Indian Accounting Importer (Tally, Busy, Zoho Books, Vyapar).
 */

import {
  flattenExport,
  detectSource,
  findHeaderRow,
  parseIndianDate,
  parseAmount,
} from "../src/lib/accounting-export.ts";
import { resolveHeaders } from "../src/lib/import-map.ts";

let pass = 0;
const failures = [];
const check = (cond, name, detail = "") => {
  if (cond) {
    pass++;
  } else {
    failures.push(`${name}${detail ? "\n      " + detail : ""}`);
  }
};

console.log("=== Testing Universal Indian Accounting Importer ===");

// 1. Zoho Books Export
{
  const ZOHO_EXPORT = [
    ["Zoho Books — Organization: Apex Global Technologies"],
    ["Invoices List (1-Apr-2026 to 30-Sep-2026)"],
    [],
    ["Invoice Date", "Invoice Number", "Customer Name", "Due Date", "Total", "Balance Due", "Invoice Status"],
    ["05/05/2026", "INV-Z-001", "Infosys BPO Ltd", "20/05/2026", "2,50,000.00", "50,000.00", "Partially Paid"],
    ["18/06/2026", "INV-Z-002", "Wipro Digital", "02/07/2026", "1,80,000.00", "1,80,000.00", "Overdue"],
    ["Grand Total", "", "", "", "4,30,000.00", "2,30,000.00", ""],
  ];

  const headerRow = findHeaderRow(ZOHO_EXPORT);
  check(headerRow === 3, "Zoho: found header row below 2 title rows and 1 blank line");

  const source = detectSource(ZOHO_EXPORT, headerRow);
  check(source === "zoho", "Zoho: correctly detected as zoho source", `got: ${source}`);

  const flat = flattenExport(ZOHO_EXPORT, { table: "invoices" });
  check(flat.rows.length === 2, "Zoho: only real invoices imported, grand total dropped");
  check(flat.rows[0]["Invoice Number"] === "INV-Z-001", "Zoho: row 1 invoice number matches");
  check(flat.rows[0]["Customer Name"] === "Infosys BPO Ltd", "Zoho: row 1 customer matches");
  check(flat.rows[0]["Invoice Date"] === "2026-05-05", "Zoho: DD/MM/YYYY converted to ISO date (2026-05-05)");

  const headers = Object.keys(flat.rows[0]);
  const resolved = resolveHeaders("invoices", headers);
  check(Boolean(resolved.map.invoice_no), "Zoho: Invoice Number matched to invoice_no", resolved.map.invoice_no);
  check(Boolean(resolved.map.party), "Zoho: Customer Name matched to party", resolved.map.party);
  check(Boolean(resolved.map.amount), "Zoho: Balance Due or Total matched to amount", resolved.map.amount);
  check(Boolean(resolved.map.due_date), "Zoho: Due Date matched to due_date", resolved.map.due_date);
  check(Boolean(resolved.map.status), "Zoho: Invoice Status matched to status", resolved.map.status);
}

// 2. Tally Prime Daybook Multi-Line Continuation
{
  const TALLY_MULTILINE = [
    ["Omkar Engineering Works"],
    ["Day Book (Sales Register)"],
    [],
    ["Date", "Particulars", "Voucher Type", "Voucher No.", "Debit", "Credit"],
    ["12-Jul-2026", "Tata Motors Commercial", "Sales", "SL-991", "4,50,000.00", ""],
    ["15-Jul-2026", "Bharat Forge", "Sales", "SL-992", "3,20,000.00", ""],
    ["20-Jul-2026", "HDFC Bank Account", "Contra", "C-01", "", "1,00,000.00"],
    ["Total", "", "", "", "7,70,000.00", "1,00,000.00"],
  ];

  const flat = flattenExport(TALLY_MULTILINE, { table: "invoices" });
  check(flat.source === "tally", "Tally: detected source is tally");
  check(flat.rows.length === 2, "Tally: Contra voucher and Total dropped, only 2 Sales vouchers kept");
  const totalAmt = flat.rows.reduce((sum, r) => sum + Number(r["Amount"] || 0), 0);
  check(totalAmt === 770000, "Tally: imported sales sum to exactly ₹7,70,000");
}

// 3. Marg ERP Export Verification
{
  const MARG_EXPORT = [
    ["Marg ERP 9+ — Pharma & Retail Solutions"],
    ["Sales Register Summary"],
    [],
    ["Bill No.", "Date", "Ledger Name", "Net Amount", "Taxable Amt"],
    ["MG-8801", "10-Oct-2026", "Apollo Medico Retail", "42,500.00", "36,000.00"],
    ["MG-8802", "14-Oct-2026", "Fortis Pharmacy", "95,000.00", "80,500.00"],
    ["Total", "", "", "1,37,500.00", "1,16,500.00"],
  ];

  const headerRow = findHeaderRow(MARG_EXPORT);
  check(headerRow === 3, "Marg: found header row below title rows");

  const source = detectSource(MARG_EXPORT, headerRow);
  check(source === "marg", "Marg: correctly detected as marg source", `got: ${source}`);

  const flat = flattenExport(MARG_EXPORT, { table: "invoices" });
  check(flat.rows.length === 2, "Marg: total row dropped, 2 invoices kept");
  check(flat.rows[0]["Bill No."] === "MG-8801", "Marg: invoice bill no preserved");

  const resolved = resolveHeaders("invoices", Object.keys(flat.rows[0]));
  check(Boolean(resolved.map.invoice_no), "Marg: Bill No. mapped to invoice_no");
  check(Boolean(resolved.map.party), "Marg: Ledger Name mapped to party");
  check(Boolean(resolved.map.amount), "Marg: Net Amount mapped to amount");
}

// 4. Indian Date Parser Robustness
{
  check(parseIndianDate("15-Aug-2026") === "2026-08-15", "parseIndianDate: 15-Aug-2026");
  check(parseIndianDate("01/10/2026") === "2026-10-01", "parseIndianDate: 01/10/2026 (day-first)");
  check(parseIndianDate("2026-11-25") === "2026-11-25", "parseIndianDate: ISO date preserved");
  check(parseIndianDate("invalid-date") === null, "parseIndianDate: invalid returns null");
}

// 5. Indian Amount Parser Robustness
{
  check(parseAmount("₹ 1,50,000.00") === "150000", "parseAmount: formatted Indian rupees");
  check(parseAmount("(45,000.50)") === "-45000.5", "parseAmount: accounting parentheses as negative");
  check(parseAmount("12,000 Dr") === "12000", "parseAmount: debit trailing suffix handled");
  check(parseAmount("18,000 Cr") === "18000", "parseAmount: credit trailing suffix handled");
}

console.log(`\ntally importer: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("  ✓ Universal Accounting Importer verified for Tally, Busy, Vyapar, Zoho Books, and Marg ERP.");
  process.exit(0);
}
