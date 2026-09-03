"use client";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, Table } from "lucide-react";
import { importRows, importFromUrl } from "@/lib/actions";
// Same resolver the server uses, so the preview cannot disagree with the import.
import { resolveHeaders } from "@/lib/import-map";
// Recognises Tally/Vyapar/Busy export SHAPES — title rows, total rows,
// Debit/Credit pairs — which header matching alone cannot handle.
import { flattenExport, type FlattenResult } from "@/lib/accounting-export";
import { parseCsv, parseCsvGrid } from "@/lib/csv";

const DATASETS = [
  { table: "sales_orders", label: "Sales orders", cols: "order_no, customer_name, region, product, amount, status" },
  { table: "invoices", label: "Invoices", cols: "invoice_no, party, amount, due_date, status, type" },
  { table: "inventory_items", label: "Inventory items", cols: "sku, name, category, on_hand, reorder_level, unit_cost, supplier" },
  { table: "employees", label: "Employees", cols: "name, department, role, monthly_ctc, performance" },
];

export function CsvImport() {
  const [table, setTable] = useState("sales_orders");
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [shape, setShape] = useState<FlattenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ds = DATASETS.find((d) => d.table === table)!;

  /*
    Show the column match BEFORE importing.

    The old screen said "Expected columns: order_no, customer_name, …" and then
    silently ignored anything else — a file headed "Order No"/"Customer" wrote
    blank rows and reported success. Cortex now matches your headers to its
    columns, but a PARTIAL match is the remaining trap: importing 500 rows while
    quietly dropping the amount column looks exactly like success.

    So the match is computed from the parsed file, with the same function the
    server uses, and shown before the user commits.
  */
  const match = rows.length ? resolveHeaders(table, Object.keys(rows[0] || {})) : null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text();
    /*
      Read the grid FIRST, then work out where the header is.

      parseCsv() takes row 0 as the header, which is right for a clean sheet and
      wrong for every Tally and Vyapar export — where row 0 is the company name
      and the last row is a Grand Total that would otherwise be imported as a
      transaction worth the sum of all the others.
    */
    const flat = flattenExport(parseCsvGrid(text));
    setShape(flat);
    setRows(flat.rows);
    setMsg(`${flat.rows.length} rows detected. ${flat.note} Check the column match below, then import.`);
  }

  async function doImport() {
    if (!rows.length) return;
    setLoading(true); setMsg("");
    const fd = new FormData(); fd.set("table", table); fd.set("rows", JSON.stringify(rows));
    const res = await importRows(fd);
    setLoading(false);
    if (res.error) setMsg(`Error: ${res.error}${/Sign in/.test(res.error) ? "" : ""}`);
    else {
      const dropped = (res.missing || []).length
        ? ` Not found in your file: ${(res.missing || []).join(", ")} — those fields are blank.`
        : "";
      setMsg(`✓ Imported ${res.inserted} rows into ${ds.label}.${dropped}`);
      setRows([]); if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function doUrlImport() {
    if (!url.trim()) return;
    setLoading(true); setMsg("");
    const fd = new FormData(); fd.set("table", table); fd.set("url", url);
    const res = await importFromUrl(fd);
    setLoading(false);
    setMsg(res.error ? `Error: ${res.error}` : `✓ Imported ${res.inserted} rows from URL into ${ds.label}.`);
    if (!res.error) setUrl("");
  }

  const preview = rows.slice(0, 5);
  const cols = preview.length ? Object.keys(preview[0]) : [];

  return (
    <Card className="p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Dataset
          <select value={table} onChange={(e) => { setTable(e.target.value); setRows([]); setMsg(""); }} className="rounded-lg border bg-background px-3 h-9 text-sm">
            {DATASETS.map((d) => <option key={d.table} value={d.table}>{d.label}</option>)}
          </select>
        </label>
        <div className="text-xs text-muted-foreground flex items-end pb-1">Cortex looks for: <span className="ml-1 text-foreground">{ds.cols}</span> &mdash; your own column names are matched automatically.</div>
      </div>
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Choose CSV</Button>
        <Button onClick={doImport} disabled={!rows.length || loading}><CheckCircle2 className="h-4 w-4" /> {loading ? "Importing…" : `Import ${rows.length || ""} rows`}</Button>
      </div>
      <div className="flex items-center gap-2 pt-1 border-t">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste a public Google Sheets / CSV link" className="flex-1 rounded-lg border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <Button variant="outline" onClick={doUrlImport} disabled={!url.trim() || loading}>Import from URL</Button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}

      {/*
        The column match, shown before the user commits.

        Nothing recognised is a hard stop with the reason, because importing a
        file we cannot read used to write blank rows and report success — the
        single worst outcome, since the owner then believes their data is in.
      */}
      {shape && shape.source !== "generic" && (
        <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 text-sm">
          <span className="font-medium capitalize">{shape.source} export recognised.</span>{" "}
          <span className="text-muted-foreground">{shape.note}</span>
        </div>
      )}

      {match && (
        <div className={`rounded-lg border p-3 text-sm ${match.matched === 0 ? "bg-danger/10 border-danger/20" : "bg-background"}`}>
          <div className="font-medium mb-1.5">
            {match.matched === 0
              ? "None of your columns were recognised"
              : `Matched ${match.matched} of ${match.total} columns`}
          </div>
          {match.matched > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {Object.entries(match.map).map(([col, src]) => (
                <span key={col} className="rounded-md border bg-success/10 text-success border-success/20 px-2 py-0.5 text-xs">
                  {src} → {col}
                </span>
              ))}
            </div>
          )}
          {match.missing.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Not found: <span className="text-warning">{match.missing.join(", ")}</span>
              {match.matched > 0 ? " — these will be left blank." : ""}
            </div>
          )}
          {match.unused.length > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Ignored from your file: {match.unused.slice(0, 6).join(", ")}{match.unused.length > 6 ? "…" : ""}
            </div>
          )}
          {match.matched === 0 && (
            <div className="text-xs mt-1">
              Rename a column to one Cortex knows, or pick a different dataset above.
            </div>
          )}
        </div>
      )}
      {preview.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <div className="text-xs text-muted-foreground px-3 py-2 border-b flex items-center gap-1.5"><Table className="h-3.5 w-3.5" /> Preview (first 5 rows)</div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground border-b">{cols.map((c) => <th key={c} className="px-3 py-1.5">{c}</th>)}</tr></thead>
            <tbody>{preview.map((r, i) => <tr key={i} className="border-b border-border/50">{cols.map((c) => <td key={c} className="px-3 py-1.5">{String(r[c])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Tip: export any table as CSV first to get the exact column format, then edit and re-import. Sign in to import into your workspace.</p>
    </Card>
  );
}
