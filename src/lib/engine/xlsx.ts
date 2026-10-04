import "server-only";
import ExcelJS from "exceljs";
import { serviceClient } from "@/lib/supabase/server";

/*
  REAL WORKBOOKS, NOT CSV WITH A DIFFERENT EXTENSION.

  The export button has shipped CSV, and a client-side SheetJS sheet with no
  formulas, since the beginning. An accountant who opens either has to rebuild
  the totals and the ageing buckets by hand, which is the work the product
  exists to remove.

  This module writes .xlsx on the server with exceljs: typed columns, number
  formats in ₹, dates as dates, a header row that is frozen and filterable,
  and — the part that matters — FORMULAS. The ageing sheet's bucket totals are
  SUM() over the bucket column, so when the person edits a row the totals move.
  A total written as a number is a screenshot; a total written as a formula is
  a spreadsheet.

  Two rules carried over from the CSV path, because a workbook is the same
  attack surface with better formatting:

  · FORMULA INJECTION. A cell whose text begins with = + - @ is executed by
    Excel. Party names arrive from CSV imports and the public ingest API, so
    a supplier can choose the contents of a cell. Every string cell goes
    through `safeText`, which prefixes a quote. Our own formulas are written
    through the `formula` property, not as text, so they are unaffected.

  · SCOPE. Every query is `.eq("org_id", orgId)`. The service role bypasses
    RLS; this filter is the tenant boundary on this path.
*/

export type Dataset = "receivables_ageing" | "payables" | "customers" | "sales_orders" | "inventory" | "invoices";

const INR = '"₹"#,##0.00;[Red]-"₹"#,##0.00';
const DATE = "dd-mmm-yyyy";

function safeText(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

const svcOrThrow = () => {
  const svc = serviceClient();
  if (!svc) throw new Error("Service role is not configured.");
  return svc;
};

function sinceISO(days: number): string {
  const d = new Date(Date.now() - Math.max(1, days) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Row count the handler records in the ledger, so the history is honest about scope. */
export async function countRowsFor(dataset: string, orgId: string, days: number): Promise<number> {
  const svc = svcOrThrow();
  const since = sinceISO(days);
  const head = (q: any) => q.select("id", { count: "exact", head: true });
  switch (dataset as Dataset) {
    case "receivables_ageing": {
      const { count } = await head(svc.from("invoices")).eq("org_id", orgId).eq("type", "receivable").or("status.is.null,status.not.ilike.paid");
      return count || 0;
    }
    case "payables": {
      const { count } = await head(svc.from("invoices")).eq("org_id", orgId).eq("type", "payable").or("status.is.null,status.not.ilike.paid");
      return count || 0;
    }
    case "invoices": {
      const { count } = await head(svc.from("invoices")).eq("org_id", orgId).gte("created_at", since);
      return count || 0;
    }
    case "customers": {
      const { count } = await head(svc.from("customers")).eq("org_id", orgId);
      return count || 0;
    }
    case "sales_orders": {
      const { count } = await head(svc.from("sales_orders")).eq("org_id", orgId).gte("order_date", since);
      return count || 0;
    }
    case "inventory": {
      const { count } = await head(svc.from("inventory_items")).eq("org_id", orgId);
      return count || 0;
    }
    default:
      return 0;
  }
}

/** Build the workbook and return its bytes plus a filename. */
export async function buildWorkbook(dataset: Dataset, orgId: string, days = 365, businessName = "Workspace"): Promise<{ buffer: Buffer; filename: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MNB Cortex";
  wb.created = new Date();
  const stamp = new Date().toISOString().slice(0, 10);

  switch (dataset) {
    case "receivables_ageing": await receivablesAgeing(wb, orgId, businessName); break;
    case "payables": await simpleInvoices(wb, orgId, "payable", "Payables", businessName); break;
    case "invoices": await simpleInvoices(wb, orgId, null, "Invoices", businessName, sinceISO(days)); break;
    case "customers": await customers(wb, orgId, businessName); break;
    case "sales_orders": await salesOrders(wb, orgId, businessName, sinceISO(days)); break;
    case "inventory": await inventory(wb, orgId, businessName); break;
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const slug = String(businessName).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
  return { buffer, filename: `${slug}-${dataset}-${stamp}.xlsx` };
}

/* ---------------------------------------------------------------- sheets */

function header(ws: ExcelJS.Worksheet, cols: Array<{ header: string; key: string; width?: number; fmt?: string }>) {
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.fmt ? { numFmt: c.fmt } : undefined }));
  const h = ws.getRow(1);
  h.font = { bold: true };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F0E8" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

function title(wb: ExcelJS.Workbook, name: string, lines: string[]) {
  const ws = wb.addWorksheet(name);
  lines.forEach((l, i) => { ws.getCell(i + 1, 1).value = safeText(l); if (i === 0) ws.getCell(1, 1).font = { bold: true, size: 14 }; });
  ws.getColumn(1).width = 90;
  return ws;
}

async function receivablesAgeing(wb: ExcelJS.Workbook, orgId: string, biz: string) {
  const svc = svcOrThrow();
  const { data } = await svc.from("invoices")
    .select("invoice_no, party, amount, due_date, status, created_at")
    .eq("org_id", orgId).eq("type", "receivable").or("status.is.null,status.not.ilike.paid")
    .order("due_date", { ascending: true }).limit(10_000);
  const rows = (data as any[]) || [];

  const ws = wb.addWorksheet("Ageing");
  header(ws, [
    { header: "Invoice", key: "no", width: 14 },
    { header: "Party", key: "party", width: 32 },
    { header: "Amount (₹)", key: "amount", width: 16, fmt: INR },
    { header: "Due date", key: "due", width: 14, fmt: DATE },
    { header: "Days past due", key: "dpd", width: 14 },
    { header: "Bucket", key: "bucket", width: 12 },
  ]);

  /*
    Days past due is a FORMULA against TODAY(), so the sheet ages itself each
    time it is opened — which is what an ageing report should do. The bucket
    is a formula over that cell. The person can change a due date and watch
    both update.
  */
  rows.forEach((r, i) => {
    const n = i + 2;
    ws.addRow({
      no: safeText(r.invoice_no), party: safeText(r.party),
      amount: Number(r.amount) || 0,
      due: r.due_date ? new Date(r.due_date) : null,
    });
    ws.getCell(`E${n}`).value = { formula: `IF(D${n}="","",MAX(0,TODAY()-D${n}))`, result: undefined as any };
    ws.getCell(`F${n}`).value = {
      formula: `IF(E${n}="","",IF(E${n}<=0,"Current",IF(E${n}<=30,"1-30",IF(E${n}<=60,"31-60",IF(E${n}<=90,"61-90","90+")))))`,
      result: undefined as any,
    };
  });

  const last = rows.length + 1;
  const sum = wb.addWorksheet("Summary");
  sum.getCell("A1").value = safeText(`${biz} — receivables ageing`); sum.getCell("A1").font = { bold: true, size: 14 };
  sum.getCell("A2").value = `Generated ${new Date().toLocaleDateString("en-IN")} by MNB Cortex. Buckets recompute from Ageing!D (due date) against TODAY().`;
  sum.getCell("A4").value = "Bucket"; sum.getCell("B4").value = "Invoices"; sum.getCell("C4").value = "Amount (₹)";
  ["A4", "B4", "C4"].forEach((c) => (sum.getCell(c).font = { bold: true }));
  const buckets = ["Current", "1-30", "31-60", "61-90", "90+"];
  buckets.forEach((b, i) => {
    const r = 5 + i;
    sum.getCell(`A${r}`).value = b;
    if (rows.length) {
      sum.getCell(`B${r}`).value = { formula: `COUNTIF(Ageing!$F$2:$F$${last},A${r})`, result: undefined as any };
      sum.getCell(`C${r}`).value = { formula: `SUMIF(Ageing!$F$2:$F$${last},A${r},Ageing!$C$2:$C$${last})`, result: undefined as any };
    } else {
      sum.getCell(`B${r}`).value = 0; sum.getCell(`C${r}`).value = 0;
    }
    sum.getCell(`C${r}`).numFmt = INR;
  });
  sum.getCell("A10").value = "Total"; sum.getCell("A10").font = { bold: true };
  sum.getCell("B10").value = { formula: "SUM(B5:B9)", result: undefined as any };
  sum.getCell("C10").value = { formula: "SUM(C5:C9)", result: undefined as any }; sum.getCell("C10").numFmt = INR;
  sum.getColumn(1).width = 14; sum.getColumn(2).width = 12; sum.getColumn(3).width = 18;
  wb.worksheets.unshift(wb.worksheets.pop()!); // Summary first
}

async function simpleInvoices(wb: ExcelJS.Workbook, orgId: string, type: "payable" | null, name: string, biz: string, since?: string) {
  const svc = svcOrThrow();
  let q = svc.from("invoices").select("invoice_no, party, amount, due_date, status, type, created_at").eq("org_id", orgId);
  if (type) q = q.eq("type", type).or("status.is.null,status.not.ilike.paid");
  if (since) q = q.gte("created_at", since);
  const { data } = await q.order("due_date", { ascending: true }).limit(10_000);
  const rows = (data as any[]) || [];
  title(wb, "About", [`${biz} — ${name.toLowerCase()}`, `Generated ${new Date().toLocaleDateString("en-IN")} by MNB Cortex. ${rows.length} rows.`]);
  const ws = wb.addWorksheet(name);
  header(ws, [
    { header: "Invoice", key: "no", width: 14 }, { header: "Party", key: "party", width: 32 },
    { header: "Type", key: "type", width: 12 }, { header: "Amount (₹)", key: "amount", width: 16, fmt: INR },
    { header: "Due date", key: "due", width: 14, fmt: DATE }, { header: "Status", key: "status", width: 12 },
    { header: "Created", key: "created", width: 14, fmt: DATE },
  ]);
  rows.forEach((r) => ws.addRow({
    no: safeText(r.invoice_no), party: safeText(r.party), type: safeText(r.type), amount: Number(r.amount) || 0,
    due: r.due_date ? new Date(r.due_date) : null, status: safeText(r.status), created: r.created_at ? new Date(r.created_at) : null,
  }));
  const n = rows.length + 2;
  ws.getCell(`C${n}`).value = "Total"; ws.getCell(`C${n}`).font = { bold: true };
  ws.getCell(`D${n}`).value = { formula: rows.length ? `SUM(D2:D${n - 1})` : "0", result: undefined as any };
  ws.getCell(`D${n}`).numFmt = INR; ws.getCell(`D${n}`).font = { bold: true };
}

async function customers(wb: ExcelJS.Workbook, orgId: string, biz: string) {
  const svc = svcOrThrow();
  const { data } = await svc.from("customers").select("name, status, value, last_touch, notes, created_at").eq("org_id", orgId).order("name").limit(10_000);
  const rows = (data as any[]) || [];
  title(wb, "About", [`${biz} — customers`, `Generated ${new Date().toLocaleDateString("en-IN")} by MNB Cortex. ${rows.length} rows.`]);
  const ws = wb.addWorksheet("Customers");
  header(ws, [
    { header: "Name", key: "name", width: 32 }, { header: "Status", key: "status", width: 14 },
    { header: "Value (₹)", key: "value", width: 16, fmt: INR }, { header: "Last touch", key: "touch", width: 14, fmt: DATE },
    { header: "Notes", key: "notes", width: 40 }, { header: "Since", key: "since", width: 14, fmt: DATE },
  ]);
  rows.forEach((r) => ws.addRow({
    name: safeText(r.name), status: safeText(r.status), value: Number(r.value) || 0,
    touch: r.last_touch ? new Date(r.last_touch) : null, notes: safeText(r.notes), since: r.created_at ? new Date(r.created_at) : null,
  }));
  const n = rows.length + 2;
  ws.getCell(`B${n}`).value = "Total value"; ws.getCell(`B${n}`).font = { bold: true };
  ws.getCell(`C${n}`).value = { formula: rows.length ? `SUM(C2:C${n - 1})` : "0", result: undefined as any };
  ws.getCell(`C${n}`).numFmt = INR; ws.getCell(`C${n}`).font = { bold: true };
}

async function salesOrders(wb: ExcelJS.Workbook, orgId: string, biz: string, since: string) {
  const svc = svcOrThrow();
  const { data } = await svc.from("sales_orders").select("order_no, customer_name, region, product, amount, status, order_date, is_repeat")
    .eq("org_id", orgId).gte("order_date", since).order("order_date", { ascending: false }).limit(10_000);
  const rows = (data as any[]) || [];
  title(wb, "About", [`${biz} — sales orders since ${since}`, `Generated ${new Date().toLocaleDateString("en-IN")} by MNB Cortex. ${rows.length} rows.`]);
  const ws = wb.addWorksheet("Orders");
  header(ws, [
    { header: "Order", key: "no", width: 14 }, { header: "Customer", key: "cust", width: 32 },
    { header: "Amount (₹)", key: "amount", width: 16, fmt: INR }, { header: "Status", key: "status", width: 12 },
    { header: "Date", key: "date", width: 14, fmt: DATE }, { header: "Region", key: "region", width: 14 },
    { header: "Product", key: "product", width: 24 }, { header: "Repeat", key: "repeat", width: 10 },
  ]);
  rows.forEach((r) => ws.addRow({
    no: safeText(r.order_no), cust: safeText(r.customer_name), amount: Number(r.amount) || 0, status: safeText(r.status),
    date: r.order_date ? new Date(r.order_date) : null, region: safeText(r.region), product: safeText(r.product),
    repeat: r.is_repeat ? "yes" : "",
  }));
  const n = rows.length + 2;
  ws.getCell(`B${n}`).value = "Total"; ws.getCell(`B${n}`).font = { bold: true };
  ws.getCell(`C${n}`).value = { formula: rows.length ? `SUM(C2:C${n - 1})` : "0", result: undefined as any };
  ws.getCell(`C${n}`).numFmt = INR; ws.getCell(`C${n}`).font = { bold: true };
}

async function inventory(wb: ExcelJS.Workbook, orgId: string, biz: string) {
  const svc = svcOrThrow();
  const { data } = await svc.from("inventory_items").select("sku, name, category, on_hand, reorder_level, unit_cost, supplier").eq("org_id", orgId).order("name").limit(10_000);
  const rows = (data as any[]) || [];
  title(wb, "About", [`${biz} — inventory`, `Generated ${new Date().toLocaleDateString("en-IN")} by MNB Cortex. ${rows.length} rows. "Below reorder" and "Stock value" are formulas.`]);
  const ws = wb.addWorksheet("Inventory");
  header(ws, [
    { header: "SKU", key: "sku", width: 14 }, { header: "Item", key: "name", width: 32 },
    { header: "On hand", key: "qty", width: 10 }, { header: "Reorder level", key: "rol", width: 14 },
    { header: "Unit cost (₹)", key: "cost", width: 14, fmt: INR }, { header: "Stock value (₹)", key: "value", width: 16, fmt: INR },
    { header: "Below reorder", key: "below", width: 14 },
  ]);
  rows.forEach((r, i) => {
    const n = i + 2;
    ws.addRow({ sku: safeText(r.sku), name: safeText(r.name), qty: Number(r.on_hand) || 0, rol: Number(r.reorder_level) || 0, cost: Number(r.unit_cost) || 0 });
    ws.getCell(`F${n}`).value = { formula: `C${n}*E${n}`, result: undefined as any };
    ws.getCell(`G${n}`).value = { formula: `IF(C${n}<D${n},"YES","")`, result: undefined as any };
  });
  const n = rows.length + 2;
  ws.getCell(`E${n}`).value = "Total value"; ws.getCell(`E${n}`).font = { bold: true };
  ws.getCell(`F${n}`).value = { formula: rows.length ? `SUM(F2:F${n - 1})` : "0", result: undefined as any };
  ws.getCell(`F${n}`).numFmt = INR; ws.getCell(`F${n}`).font = { bold: true };
}
