"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Upload, CheckCircle2, Table, ArrowRight, AlertTriangle, Wand2 } from "lucide-react";
import { importRows, importFromUrl } from "@/lib/actions";
// Same resolver the server uses, so the preview cannot disagree with the import.
import { resolveHeaders } from "@/lib/import-map";
// Recognises Tally/Vyapar/Busy export SHAPES — title rows, total rows,
// Debit/Credit pairs — which header matching alone cannot handle.
import { flattenExport, type FlattenResult } from "@/lib/accounting-export";
import { parseCsvGrid } from "@/lib/csv";
// Works out WHICH dataset a file is, so the dropdown's default cannot silently
// file someone's invoices as sales orders. See lib/import-detect.
import { detectDataset, mismatchWarning, datasetLabel, type DatasetGuess } from "@/lib/import-detect";

/*
  DATASETS: all seven, not four.

  `leads`, `customers` and `production_runs` have existed in IMPORT_COLS for
  months — added precisely because those pages were permanently empty for real
  customers — and were never added to this list. So /leads told the owner
  "Import a CSV of the enquiries you already have" and linked here, to a
  dropdown that could not select leads.
*/
const DATASETS = [
  { table: "invoices", label: "Invoices", cols: "invoice_no, party, amount, due_date, status, type" },
  { table: "sales_orders", label: "Sales orders", cols: "order_no, customer_name, region, product, amount, status" },
  { table: "inventory_items", label: "Inventory items", cols: "sku, name, category, on_hand, reorder_level, unit_cost, supplier" },
  { table: "employees", label: "Employees", cols: "name, department, role, monthly_ctc, performance" },
  { table: "customers", label: "Customers", cols: "name, company, email, phone, status, value" },
  { table: "leads", label: "Leads", cols: "name, email, phone, plan, source" },
  { table: "production_runs", label: "Production runs", cols: "machine, shift, run_date, planned_qty, actual_qty, reject_qty, downtime_min, oee" },
];

const OFFERED = DATASETS.map((d) => d.table);

/*
  INVOICES IS FIRST, AND FIRST IS THE DEFAULT.

  This list used to start with Sales orders, for no reason beyond the order
  someone typed it in. Cortex is sold on receivables — the landing page, the
  onboarding wizard and the setup path all promise that importing invoices shows
  what is overdue — so the most likely single action a new customer takes is
  uploading an invoice register. With Sales orders selected, that wrote their
  invoices into the wrong table, reported success, ticked the setup step off,
  and made the receivables warning permanently impossible.

  Reordering is not the fix on its own — detectDataset() below is — but a
  default that matches what people actually upload means detection has less to
  correct.
*/
const DEFAULT_TABLE = "invoices";

export function CsvImport({ initialTable }: { initialTable?: string } = {}) {
  const [table, setTable] = useState(
    initialTable && OFFERED.includes(initialTable) ? initialTable : DEFAULT_TABLE,
  );
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [shape, setShape] = useState<FlattenResult | null>(null);
  const [guess, setGuess] = useState<DatasetGuess | null>(null);
  const [switched, setSwitched] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importRows>> | null>(null);
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

  /* Recomputed from the CURRENT dropdown value, so it appears the moment the
     user overrides a correct auto-switch and disappears when they fix it. */
  const mismatch = mismatchWarning(table, guess);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setResult(null);
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

    /* Which dataset IS this? Switch only on a confident answer — see
       lib/import-detect for why a confident wrong switch is the worse bug. */
    const g = detectDataset(Object.keys(flat.rows[0] || {}), OFFERED);
    setGuess(g);
    if (g && g.confident && g.table !== table) {
      setTable(g.table);
      setSwitched(g.table);
    } else {
      setSwitched(null);
    }

    setMsg(`${flat.rows.length.toLocaleString("en-IN")} rows detected. ${flat.note} Check the column match below, then import.`);
  }

  async function doImport() {
    if (!rows.length) return;
    setLoading(true); setMsg(""); setResult(null);
    const fd = new FormData(); fd.set("table", table); fd.set("rows", JSON.stringify(rows));
    const res = await importRows(fd);
    setLoading(false);
    if (res.error) { setMsg(`Error: ${res.error}`); return; }
    setResult(res);
    setRows([]); setShape(null); setGuess(null); setSwitched(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function doUrlImport() {
    if (!url.trim()) return;
    setLoading(true); setMsg(""); setResult(null);
    const fd = new FormData(); fd.set("table", table); fd.set("url", url);
    const res = await importFromUrl(fd);
    setLoading(false);
    if (res.error) { setMsg(`Error: ${res.error}`); return; }
    setResult(res);
    setUrl("");
  }

  const preview = rows.slice(0, 5);
  const cols = preview.length ? Object.keys(preview[0]) : [];

  return (
    <Card className="p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Dataset
          <select
            value={table}
            onChange={(e) => { setTable(e.target.value); setSwitched(null); setResult(null); }}
            className="rounded-lg border bg-background px-3 h-9 text-sm"
          >
            {DATASETS.map((d) => <option key={d.table} value={d.table}>{d.label}</option>)}
          </select>
        </label>
        <div className="text-xs text-muted-foreground flex items-end pb-1">Cortex looks for: <span className="ml-1 text-foreground">{ds.cols}</span> &mdash; your own column names are matched automatically.</div>
      </div>

      {/*
        The auto-switch, stated plainly and reversibly.

        Changing the dataset under someone without telling them would be its own
        bug — so it is announced, the reason is given, and the dropdown above is
        still theirs.
      */}
      {switched && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm flex items-start gap-2.5">
          <Wand2 className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            This file looks like <span className="font-medium">{datasetLabel(switched)}</span>, so Cortex
            set the dataset for you. Change it above if that is wrong.
          </div>
        </div>
      )}

      {/*
        The owner overrode a confident guess. This is the last chance to say
        what that will cost them, and it names the consequence rather than the
        mismatch — see mismatchWarning().
      */}
      {mismatch && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" aria-hidden="true" />
          <div>{mismatch}</div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Choose CSV</Button>
        <Button onClick={doImport} disabled={!rows.length || loading}><CheckCircle2 className="h-4 w-4" /> {loading ? "Importing…" : `Import ${rows.length ? rows.length.toLocaleString("en-IN") : ""} rows`}</Button>
      </div>
      <div className="flex items-center gap-2 pt-1 border-t">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste a public Google Sheets / CSV link" aria-label="…or paste a public Google Sheets / CSV link" className="flex-1 rounded-lg border bg-background px-3 h-9 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <Button variant="outline" onClick={doUrlImport} disabled={!url.trim() || loading}>Import from URL</Button>
      </div>
      {msg && <p className="text-sm" role="status">{msg}</p>}

      {/*
        =====================================================================
        THE RESULT — which is where this screen used to stop being useful.

        It printed "✓ Imported 412 rows into Invoices." and nothing else: no
        link, no figure, no next step, at the single most important moment in
        the funnel. The warning was already computed server-side and thrown
        away. Now it lands here.
        =====================================================================
      */}
      {result && !result.error && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-4 space-y-3" role="status">
          <div className="text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">Imported {result.inserted.toLocaleString("en-IN")} rows into {ds.label}.</span>
              {(result.missing || []).length > 0 && (
                <> Not found in your file: <span className="text-warning">{(result.missing || []).join(", ")}</span> — those fields are blank.</>
              )}
            </span>
          </div>

          {/* Every row accounted for. "412 detected, 380 imported" with no
              explanation reads like data loss. */}
          {result.skippedReason && (
            <p className="text-xs text-muted-foreground">{result.skippedReason}</p>
          )}

          {result.warning ? (
            <div className="rounded-lg border bg-background p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                {result.warning.severity === "green" ? "What Cortex found" : "The first thing to look at"}
              </div>
              <div className="text-sm font-medium">{result.warning.title}</div>
              <p className="text-sm text-muted-foreground mt-1">{result.warning.detail}</p>
              {/*
                buttonVariants on the Link rather than <Button asChild>, which
                this Button does not support. Using the variants keeps the 44px
                tap target the size tokens encode — see ui/button.tsx.
              */}
              {result.warning.route && (
                <Link href={result.warning.route} className={`${buttonVariants({ size: "sm" })} mt-3`}>
                  Open it <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          ) : (
            /*
              Nothing to warn about is a real outcome and is said as one. The
              alternative — silence — reads as though the import did not work.
            */
            <div className="rounded-lg border bg-background p-3 text-sm">
              <div className="font-medium">Nothing needs your attention from this file.</div>
              <p className="text-muted-foreground mt-1">
                No overdue receivables, no supplier past the 45-day mark, nothing below reorder level. Your
                numbers are on the dashboard.
              </p>
              <Link href="/dashboard" className={`${buttonVariants({ size: "sm", variant: "outline" })} mt-3`}>
                Open Business Health <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      )}

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
          <div className="text-xs text-muted-foreground px-3 py-2 border-b flex items-center gap-1.5"><Table className="h-3.5 w-3.5" aria-hidden="true" /> Preview (first 5 rows)</div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground border-b">{cols.map((c) => <th key={c} scope="col" className="px-3 py-1.5">{c}</th>)}</tr></thead>
            <tbody>{preview.map((r, i) => <tr key={i} className="border-b border-border/50">{cols.map((c) => <td key={c} className="px-3 py-1.5">{String(r[c])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {/*
        HONEST ABOUT EXCEL. The file picker accepts .csv only and there is no
        XLSX parser in the bundle, so the old subtitle "Bring your real numbers
        in from CSV / Excel" was an offer the screen then refused — the file
        dialog simply would not show the owner their own .xlsx.
      */}
      <p className="text-xs text-muted-foreground">
        Working in Excel? Use <span className="text-foreground">File → Save As → CSV UTF-8</span> first — Cortex reads CSV,
        and a saved .xlsx cannot be opened here. Tally, Vyapar and Busy exports are recognised as they come.
      </p>
    </Card>
  );
}
