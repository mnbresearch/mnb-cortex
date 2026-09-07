/**
 * Matching a customer's spreadsheet headers to Cortex's columns.
 *
 * THE PROBLEM THIS SOLVES.
 *
 * `importRows` read `r[c]` for each expected column, verbatim. The import
 * screen listed the names it wanted — "order_no, customer_name, region,
 * product, amount, status" — and anything else was ignored. Silently. A file
 * headed `Order No`, `Customer`, `Amount` produced rows where every field was
 * undefined, so the importer inserted blank records and reported success.
 *
 * That is the activation cliff. Onboarding correctly makes "Import my own data"
 * the primary action, and it landed on a screen that failed for essentially
 * every real export — Tally, Vyapar, Busy, or a shop's own Excel, none of which
 * name a column `customer_name`. The owner's reasonable conclusion was that the
 * product did not work.
 *
 * `lib/sync/index.ts` already had the fix, a `pick()` helper written for Google
 * Sheets that matches on normalised header names. It was never lifted out. This
 * module is that idea done properly: per-column alias lists, a report of what
 * was and was not recognised, and no silent failure.
 *
 * DELIBERATELY PURE. No imports, no server-only, no database. So the import
 * screen can preview the match before uploading, the server can apply the same
 * mapping when writing, and the test can exercise the real thing.
 */

/**
 * Normalise a header for comparison: lowercase, drop everything that is not a
 * letter or digit. `Order No.`, `order_no`, `ORDER NUMBER` and `Order-No` all
 * collapse toward the same shape.
 *
 * Digits are KEPT. Dropping them would merge `qty1` and `qty2`, and more
 * importantly would break `gst_1` style columns that some exports produce.
 */
export function normalizeHeader(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Aliases per target column, per table.
 *
 * These are drawn from what Indian SME tools actually emit. Tally exports
 * "Particulars" for the party and "Voucher No."; Vyapar uses "Party Name" and
 * "Invoice Number"; Busy uses "Amount"; a shop's own sheet says "Customer" and
 * "Total". The first entry of each list is the canonical column name, so an
 * already-correct file matches exactly and costs nothing.
 *
 * Order matters: earlier aliases win. `total` is listed after `amount` so a file
 * carrying both maps `amount` from the column actually called amount.
 */
export const COLUMN_ALIASES: Record<string, Record<string, string[]>> = {
  sales_orders: {
    order_no: ["order_no", "orderno", "ordernumber", "order", "sono", "salesorderno", "voucherno", "vouchernumber", "invoiceno", "billno", "docno", "id", "srno", "sno"],
    customer_name: ["customer_name", "customername", "customer", "party", "partyname", "particulars", "client", "clientname", "buyer", "name", "account"],
    region: ["region", "state", "zone", "territory", "city", "location", "area", "branch"],
    product: ["product", "item", "itemname", "description", "productname", "sku", "goods", "service", "particular"],
    amount: ["amount", "total", "value", "netamount", "grandtotal", "invoiceamount", "billamount", "saleamount", "amt", "totalamount", "debit"],
    status: ["status", "state", "orderstatus", "stage", "paymentstatus"],
  },
  invoices: {
    invoice_no: ["invoice_no", "invoiceno", "invoicenumber", "invoice", "billno", "billnumber", "voucherno", "vouchernumber", "docno", "id"],
    party: ["party", "partyname", "customer", "customername", "particulars", "client", "vendor", "supplier", "name", "account"],
    amount: ["amount", "total", "value", "netamount", "grandtotal", "invoiceamount", "billamount", "amt", "totalamount", "debit"],
    /*
      The date the bill was RAISED, which is what the MSME 45-day clock and the
      ageing run from. It was missing here, so every imported invoice fell back
      to its import timestamp — and a workspace that imported two years of
      payables saw "₹0 of deductions at risk" on day one. A reassuring zero is
      the exact failure the 43B(h) module was written to avoid.
    */
    issue_date: ["issue_date", "issuedate", "invoicedate", "billdate", "voucherdate", "date", "dated", "transactiondate"],
    due_date: ["due_date", "duedate", "due", "paymentdue", "duson", "maturitydate"],
    status: ["status", "paymentstatus", "state", "paid"],
    type: ["type", "kind", "direction", "category"],
  },
  inventory_items: {
    sku: ["sku", "itemcode", "code", "productcode", "partno", "partnumber", "id", "barcode", "hsn"],
    name: ["name", "itemname", "item", "product", "productname", "description", "particulars"],
    category: ["category", "group", "itemgroup", "type", "class", "stockgroup"],
    on_hand: ["on_hand", "onhand", "qty", "quantity", "stock", "closingstock", "instock", "balance", "closingqty", "availableqty"],
    reorder_level: ["reorder_level", "reorderlevel", "reorder", "minqty", "minimumqty", "reorderpoint", "safetystock", "minstock"],
    unit_cost: ["unit_cost", "unitcost", "cost", "rate", "purchaserate", "price", "unitprice", "costprice", "buyprice"],
    supplier: ["supplier", "vendor", "party", "supplierName", "suppliername", "manufacturer", "brand"],
  },
  employees: {
    name: ["name", "employeename", "employee", "staffname", "fullname", "empname"],
    department: ["department", "dept", "division", "team", "section"],
    role: ["role", "designation", "position", "title", "jobtitle"],
    monthly_ctc: ["monthly_ctc", "monthlyctc", "ctc", "salary", "monthlysalary", "grosssalary", "gross", "wage", "pay"],
    performance: ["performance", "rating", "score", "appraisal", "performancerating"],
  },
  leads: {
    name: ["name", "leadname", "fullname", "contactname", "person", "customer"],
    email: ["email", "emailaddress", "mail", "emailid"],
    phone: ["phone", "mobile", "phonenumber", "contact", "contactno", "mobileno", "whatsapp", "cell"],
    plan: ["plan", "interest", "product", "package", "tier"],
    source: ["source", "channel", "via", "campaign", "referrer", "leadsource"],
  },
  production_runs: {
    machine: ["machine", "machineno", "equipment", "line", "workcentre", "workcenter", "asset"],
    shift: ["shift", "shiftname", "batch"],
    run_date: ["run_date", "rundate", "date", "productiondate", "day"],
    planned_qty: ["planned_qty", "plannedqty", "planned", "target", "targetqty", "plan"],
    actual_qty: ["actual_qty", "actualqty", "actual", "produced", "output", "producedqty"],
    reject_qty: ["reject_qty", "rejectqty", "reject", "rejected", "scrap", "defects", "rejection"],
    downtime_min: ["downtime_min", "downtimemin", "downtime", "downtimeminutes", "stoppage", "breakdown"],
    oee: ["oee", "efficiency", "overallequipmenteffectiveness"],
  },
  customers: {
    name: ["name", "customername", "customer", "party", "partyname", "contactname", "particulars", "client"],
    company: ["company", "companyname", "firm", "business", "organisation", "organization", "account"],
    email: ["email", "emailaddress", "mail", "emailid"],
    phone: ["phone", "mobile", "phonenumber", "contact", "contactno", "mobileno", "whatsapp"],
    status: ["status", "stage", "state", "type"],
    value: ["value", "amount", "total", "revenue", "ltv", "lifetimevalue", "business", "turnover"],
  },
};

export type HeaderMatch = {
  /** target column -> the header in the customer's file that supplies it */
  map: Record<string, string>;
  /** target columns we could not find a source for */
  missing: string[];
  /** headers in the file that we did not use */
  unused: string[];
  matched: number;
  total: number;
};

/**
 * Work out which of the file's headers feed which Cortex columns.
 *
 * A header is claimed by at most one target column — otherwise a file with a
 * single `name` column would populate both `customer_name` and `product` on the
 * same row, which looks like it worked and is nonsense.
 */
export function resolveHeaders(table: string, headers: string[]): HeaderMatch {
  const aliases = COLUMN_ALIASES[table] || {};
  const targets = Object.keys(aliases);

  // normalised header -> original header, first occurrence wins
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }

  const map: Record<string, string> = {};
  const claimed = new Set<string>();

  /*
    Two passes. Exact alias matches are taken FIRST, across every column, before
    any fuzzy matching happens. Otherwise a loose prefix match on an early
    column can steal the header that a later column names exactly — e.g.
    `amount` being claimed by `amt`-style matching for a different field.
  */
  for (const col of targets) {
    for (const a of aliases[col]) {
      const norm = normalizeHeader(a);
      const src = byNorm.get(norm);
      if (src && !claimed.has(src)) { map[col] = src; claimed.add(src); break; }
    }
  }

  for (const col of targets) {
    if (map[col]) continue;
    for (const a of aliases[col]) {
      const norm = normalizeHeader(a);
      // Contains, in either direction: "customernameenglish" or "custname".
      // Guarded at 4 characters so short aliases like "id" or "qty" cannot
      // match half the sheet.
      if (norm.length < 4) continue;
      let hit: string | undefined;
      for (const [n, original] of byNorm) {
        if (claimed.has(original)) continue;
        if (n.includes(norm) || norm.includes(n)) { hit = original; break; }
      }
      if (hit) { map[col] = hit; claimed.add(hit); break; }
    }
  }

  return {
    map,
    missing: targets.filter((c) => !map[c]),
    unused: headers.filter((h) => !claimed.has(h)),
    matched: Object.keys(map).length,
    total: targets.length,
  };
}

/** Apply a resolved mapping to one row of the customer's file. */
export function applyMapping(row: any, match: HeaderMatch): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [col, src] of Object.entries(match.map)) {
    const v = row?.[src];
    if (v !== undefined && v !== null && String(v).trim() !== "") out[col] = v;
  }
  return out;
}


/* ===========================================================================
   THE IMPORT SHAPE, AND THE ROW MAPPER — MOVED HERE SO THEY CAN BE EXECUTED.

   These lived in lib/actions.ts, which is a "use server" module that reaches
   the database. That made them unreachable from a test process: the only way
   to check the importer was to read it, and reading is exactly how four
   separate bugs survived in this path (blank rows from unmatched headers,
   orders with no status contributing zero revenue, "Paid" failing a
   case-sensitive comparison, and the URL importer missing all three fixes).

   The logic is pure — a row in, a row out, no I/O — so there was never a reason
   for it to sit behind a server boundary. Now scripts/test-importer.mjs can run
   real Tally, Vyapar and Excel-shaped files through the ACTUAL code path rather
   than a copy of it.
   =========================================================================== */

export const IMPORT_COLS: Record<string, { cols: string[]; nums: string[] }> = {

  sales_orders: { cols: ["order_no", "customer_name", "region", "product", "amount", "status"], nums: ["amount"] },
  invoices: { cols: ["invoice_no", "party", "amount", "issue_date", "due_date", "status", "type"], nums: ["amount"] },
  inventory_items: { cols: ["sku", "name", "category", "on_hand", "reorder_level", "unit_cost", "supplier"], nums: ["on_hand", "reorder_level", "unit_cost"] },
  employees: { cols: ["name", "department", "role", "monthly_ctc", "performance"], nums: ["monthly_ctc", "performance"] },
  // Leads were not importable, and no code path could create one belonging to a
  // customer's workspace at all — so /leads was permanently empty for every
  // paying customer while telling them to "share your pricing page".
  leads: { cols: ["name", "email", "phone", "plan", "source"], nums: [] },
  production_runs: { cols: ["machine", "shift", "run_date", "planned_qty", "actual_qty", "reject_qty", "downtime_min", "oee"], nums: ["planned_qty", "actual_qty", "reject_qty", "downtime_min", "oee"] },
  customers: { cols: ["name", "company", "email", "phone", "status", "value"], nums: ["value"] },
};

/*
  ONE MAPPER FOR BOTH IMPORT PATHS.

  This logic lived inline in importRows() and was simply absent from
  importFromUrl(), so four separate correctness fixes — the "won" default, the
  invoice status/type case-folding, the unknown-type fallback, and numeric
  cleaning — applied to file uploads and not to Google Sheets. The two paths
  write to the same tables and are read by the same queries; they cannot be
  allowed to disagree about what a row means.

  `picked` is the row AFTER header resolution, so this function never sees the
  customer's original column names.
*/
export function mapImportedRow(table: string, spec: { cols: string[]; nums: string[] }, orgId: string, picked: Record<string, any>): any {
  const o: any = { org_id: orgId };
  for (const c of spec.cols) {
    const v = picked[c];
    if (v === undefined || v === "") continue;
    o[c] = spec.nums.includes(c) ? (parseFloat(String(v).replace(/[^0-9.-]/g, "")) || 0) : String(v);
  }

  /*
    An imported sales order with no status contributes ZERO revenue, because
    metrics.ts counts only status === "won". The manual "Add sales order" form
    defaults to "won"; the importer did not, so importing 500 orders produced
    "Orders (MTD): 500" beside "Revenue (MTD): ₹0" and nothing explained why.
  */
  if (table === "sales_orders" && !o.status) o.status = "won";

  /*
    Normalise the two columns that are COMPARED rather than displayed.

    Every read in this codebase tests `status <> 'paid'` and
    `type = 'receivable'` case-sensitively. A Tally or Vyapar export writes
    "Paid", "PAID" or "Receivable", so an invoice the customer had already
    settled came through as unpaid — and would then be CHASED by the collections
    agent, which is the worst outcome this product can produce. It also inflated
    the 43B(h) tax exposure with bills that were paid.
  */
  if (table === "invoices") {
    if (o.status) o.status = String(o.status).trim().toLowerCase();
    if (o.type) o.type = String(o.type).trim().toLowerCase();
    // Anything that is not a known receivable/payable value is a receivable,
    // which is the existing column default.
    if (o.type && !["receivable", "payable"].includes(o.type)) o.type = "receivable";
  }
  return o;
}

