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
