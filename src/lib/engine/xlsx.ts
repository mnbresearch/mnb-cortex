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

export type Dataset = "receivables_ageing" | "payables" | "customers" | "sales_orders" | "inventory" | "invoices" | "mis_pack";

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
    case "mis_pack": {
      /* The pack is a set of sheets; "rows" here is the number of KPI rows the
         Summary will carry, which is what tells the approver it is non-empty. */
      const { count } = await head(svc.from("health_metrics")).eq("org_id", orgId);
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
    case "mis_pack": await misPack(wb, orgId, businessName); break;
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


/* ------------------------------------------------------------- MIS pack */
/*
  THE MONTHLY PACK A FOUNDER SENDS TO A BOARD, A BANK OR AN INVESTOR.

  Six sheets, every one of them from rows the workspace already holds:
    Overview     latest value of every KPI, with its period-over-period change
    Trend        the finance ledger, newest 24 months, with formulas for
                 gross/net margin so the reader can see the arithmetic
    Receivables  open receivables with live ageing (same formulas as the
                 standalone ageing export)
    Payables     open payables
    Customers    top 25 by won-order value in the last 12 months
    Collections  what Cortex recovered after a reminder, last 90 days (the
                 same conservative RPC the weekly report uses)
  Nothing is modelled or projected. A sheet with no rows says so in its
  first line rather than being omitted, so the reader knows it was looked at.
*/
async function misPack(wb: ExcelJS.Workbook, orgId: string, biz: string) {
  const svc = svcOrThrow();
  const today = new Date().toLocaleDateString("en-IN");

  // --- Summary: latest row per metric_key
  const { data: hm } = await svc.from("health_metrics").select("metric_key, label, value, unit, delta_pct, status, as_of")
    .eq("org_id", orgId).order("as_of", { ascending: false }).limit(500);
  const latest = new Map<string, any>();
  for (const r of ((hm as any[]) || [])) if (!latest.has(r.metric_key)) latest.set(r.metric_key, r);
  const sum = wb.addWorksheet("Overview");
  sum.getCell("A1").value = safeText(`${biz} — MIS pack`); sum.getCell("A1").font = { bold: true, size: 14 };
  sum.getCell("A2").value = `Generated ${today} by MNB Cortex from the workspace's own records. Figures are as of each metric's last recompute.`;
  if (!latest.size) sum.getCell("A4").value = "No KPIs have been computed yet — import data or run a recompute, then regenerate.";
  else {
    ["Metric", "Value", "Unit", "Change vs prior (%)", "Status", "As of"].forEach((h, i) => { const c = sum.getCell(4, i + 1); c.value = h; c.font = { bold: true }; });
    let r = 5;
    for (const m of Array.from(latest.values())) {
      sum.getCell(r, 1).value = safeText(m.label || m.metric_key);
      sum.getCell(r, 2).value = m.value === null ? null : Number(m.value);
      if (m.unit === "INR") sum.getCell(r, 2).numFmt = INR;
      sum.getCell(r, 3).value = safeText(m.unit);
      sum.getCell(r, 4).value = m.delta_pct === null || m.delta_pct === undefined ? null : Number(m.delta_pct);
      sum.getCell(r, 5).value = safeText(m.status);
      sum.getCell(r, 6).value = m.as_of ? new Date(m.as_of) : null; sum.getCell(r, 6).numFmt = DATE;
      r++;
    }
    sum.views = [{ state: "frozen", ySplit: 4 }];
  }
  [34, 18, 8, 20, 10, 12].forEach((w, i) => (sum.getColumn(i + 1).width = w));

  // --- Trend: finance ledger
  const { data: fl } = await svc.from("finance_ledger").select("period, revenue, cogs, opex, gross_profit, net_profit, cash_balance, receivables, payables, ebitda")
    .eq("org_id", orgId).order("period", { ascending: false }).limit(24);
  const ledger = (((fl as any[]) || []).slice().reverse());
  const tr = wb.addWorksheet("Trend");
  header(tr, [
    { header: "Period", key: "period", width: 12, fmt: "mmm yyyy" }, { header: "Revenue (₹)", key: "revenue", width: 16, fmt: INR },
    { header: "COGS (₹)", key: "cogs", width: 16, fmt: INR }, { header: "Opex (₹)", key: "opex", width: 16, fmt: INR },
    { header: "Gross profit (₹)", key: "gp", width: 16, fmt: INR }, { header: "Net profit (₹)", key: "np", width: 16, fmt: INR },
    { header: "Gross margin", key: "gm", width: 13, fmt: "0.0%" }, { header: "Net margin", key: "nm", width: 13, fmt: "0.0%" },
    { header: "Cash (₹)", key: "cash", width: 16, fmt: INR }, { header: "Receivables (₹)", key: "rec", width: 16, fmt: INR }, { header: "Payables (₹)", key: "pay", width: 16, fmt: INR },
  ]);
  if (!ledger.length) tr.addRow({ period: "No monthly ledger rows yet — the Trend sheet fills in once sales or a bank statement have been imported." });
  ledger.forEach((r, i) => {
    const n = i + 2;
    tr.addRow({
      period: r.period ? new Date(r.period) : null, revenue: Number(r.revenue) || 0, cogs: Number(r.cogs) || 0, opex: Number(r.opex) || 0,
      gp: Number(r.gross_profit) || 0, np: Number(r.net_profit) || 0, cash: Number(r.cash_balance) || 0, rec: Number(r.receivables) || 0, pay: Number(r.payables) || 0,
    });
    tr.getCell(`G${n}`).value = { formula: `IF(B${n}=0,"",E${n}/B${n})`, result: undefined as any };
    tr.getCell(`H${n}`).value = { formula: `IF(B${n}=0,"",F${n}/B${n})`, result: undefined as any };
  });

  // --- Receivables ageing and payables: reuse the standalone builders
  await receivablesAgeing(wb, orgId, biz);
  // receivablesAgeing() moves its own Summary sheet to the front; the pack wants Overview first.
  const ageSummary = wb.worksheets.find((w) => w.name === "Summary");
  if (ageSummary) ageSummary.name = "Ageing summary";
  const kpi = wb.worksheets.indexOf(sum);
  if (kpi > 0) { wb.worksheets.splice(kpi, 1); wb.worksheets.unshift(sum); }
  await simpleInvoices(wb, orgId, "payable", "Payables", biz);

  // --- Top customers, won orders in the last 12 months
  const { data: so } = await svc.from("sales_orders").select("customer_name, amount, order_date, status")
    .eq("org_id", orgId).gte("order_date", sinceISO(365)).limit(10_000);
  const byCust = new Map<string, { amount: number; orders: number; last: string }>();
  for (const o of ((so as any[]) || [])) {
    if (o.status && String(o.status).toLowerCase() !== "won") continue;
    const k = String(o.customer_name || "(unnamed)");
    const cur = byCust.get(k) || { amount: 0, orders: 0, last: "" };
    cur.amount += Number(o.amount) || 0; cur.orders += 1; if (o.order_date && o.order_date > cur.last) cur.last = o.order_date;
    byCust.set(k, cur);
  }
  const top = Array.from(byCust.entries()).sort((a, b) => b[1].amount - a[1].amount).slice(0, 25);
  const cu = wb.addWorksheet("Top customers");
  header(cu, [{ header: "Customer", key: "c", width: 34 }, { header: "Won orders (₹, 12m)", key: "a", width: 20, fmt: INR }, { header: "Orders", key: "n", width: 10 }, { header: "Last order", key: "l", width: 14, fmt: DATE }, { header: "Share of total", key: "s", width: 14, fmt: "0.0%" }]);
  if (!top.length) cu.addRow({ c: "No won orders in the last 12 months." });
  top.forEach(([name, v], i) => {
    const n = i + 2;
    cu.addRow({ c: safeText(name), a: v.amount, n: v.orders, l: v.last ? new Date(v.last) : null });
    cu.getCell(`E${n}`).value = { formula: `IF(SUM($B$2:$B$${top.length + 1})=0,"",B${n}/SUM($B$2:$B$${top.length + 1}))`, result: undefined as any };
  });

  // --- Collections, last 90 days, conservative RPC
  const co = wb.addWorksheet("Collections");
  co.getCell("A1").value = safeText(`${biz} — collections, last 90 days`); co.getCell("A1").font = { bold: true, size: 14 };
  try {
    const { data: rec } = await svc.rpc("cortex_recovery_summary", { p_org: orgId, p_days: 90 });
    const r = (Array.isArray(rec) ? rec[0] : rec) as any;
    const rows: Array<[string, number | string]> = [
      ["Recovered after a Cortex reminder (₹)", Number(r?.amount_recovered) || 0],
      ["Invoices recovered", Number(r?.invoices_recovered) || 0],
      ["Still being chased (₹)", Number(r?.amount_chasing) || 0],
      ["Invoices still being chased", Number(r?.still_chasing) || 0],
    ];
    co.getCell("A2").value = "Counts only invoices where a reminder was actually sent and the money then came in.";
    rows.forEach(([k, v], i) => { co.getCell(4 + i, 1).value = k; co.getCell(4 + i, 2).value = v as any; if (String(k).includes("₹")) co.getCell(4 + i, 2).numFmt = INR; });
  } catch {
    co.getCell("A2").value = "Collections is not set up for this workspace yet (the recovery summary function is not installed).";
  }
  co.getColumn(1).width = 44; co.getColumn(2).width = 18;
}
