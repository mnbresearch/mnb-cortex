"use client";
import { Download } from "lucide-react";
export function ExportButton({ rows, filename, columns }: { rows: any[]; filename: string; columns?: string[] }) {
  function exportCsv() {
    if (!rows?.length) { alert("No data to export yet."); return; }
    const cols = columns || Object.keys(rows[0]);
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
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
