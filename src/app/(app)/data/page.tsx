import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/forms";
import { ExportButton, ExcelButton } from "@/components/export-button";
import { getTableRows, EXPLORE_TABLES } from "@/lib/data";
import Link from "next/link";
import { Search, Database } from "lucide-react";

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = { sales_orders: "Sales orders", invoices: "Invoices", inventory_items: "Inventory", employees: "Employees", purchase_orders: "Purchase orders", production_runs: "Production runs" };

export default async function DataExplorer({ searchParams }: { searchParams: { table?: string; q?: string; page?: string } }) {
  const table = EXPLORE_TABLES.includes(searchParams.table || "") ? searchParams.table! : "sales_orders";
  const q = searchParams.q || "";
  const page = Math.max(0, parseInt(searchParams.page || "0") || 0);
  const { rows, cols, live, total } = await getTableRows(table, q, page);
  const per = 15;

  return (
    <>
      <Topbar title="Data Explorer" subtitle="Browse, search & manage every record" />
      <PageShell>
        <div className="flex flex-wrap gap-2">
          {EXPLORE_TABLES.map((t) => (
            <Link key={t} href={`/data?table=${t}`} className={`rounded-lg border px-3 h-9 inline-flex items-center text-sm ${t === table ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}>{LABEL[t]}</Link>
          ))}
        </div>

        {!live && <Card className="p-5 bg-warning/10 border-warning/20 text-sm"><a href="/login" className="text-primary underline">Sign in</a> and load demo data to explore your records here.</Card>}

        {live && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
              <form className="flex items-center gap-2 rounded-lg border px-3 h-9 w-full sm:w-72" action="/data">
                <input type="hidden" name="table" value={table} />
                <Search className="h-4 w-4 text-muted-foreground" />
                <input name="q" defaultValue={q} placeholder={`Search ${LABEL[table]}…`} className="flex-1 bg-transparent text-sm outline-none" />
              </form>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Database className="h-3.5 w-3.5" /> {total} total</span>
                <ExportButton rows={rows} filename={`${table}.csv`} columns={cols} />
                <ExcelButton rows={rows} filename={`${table}.csv`} columns={cols} />
              </div>
            </div>
            <div className="px-2 pb-2 overflow-x-auto">
              {rows.length === 0 ? <p className="text-sm text-muted-foreground p-4">No records{q ? " match your search" : ""}.</p> : (
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-muted-foreground border-b">{cols.map((c) => <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">{c}</th>)}<th /></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-accent/40">
                        {cols.map((c) => <td key={c} className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate">{typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "—")}</td>)}
                        <td className="px-3 py-2 text-right"><DeleteButton table={table} id={r.id} path={`/data?table=${table}`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between p-4 border-t text-sm">
              <span className="text-muted-foreground">Page {page + 1} of {Math.max(1, Math.ceil(total / per))}</span>
              <div className="flex gap-2">
                {page > 0 && <Link href={`/data?table=${table}&q=${encodeURIComponent(q)}&page=${page - 1}`} className="rounded-lg border px-3 h-8 inline-flex items-center hover:bg-accent">Prev</Link>}
                {(page + 1) * per < total && <Link href={`/data?table=${table}&q=${encodeURIComponent(q)}&page=${page + 1}`} className="rounded-lg border px-3 h-8 inline-flex items-center hover:bg-accent">Next</Link>}
              </div>
            </div>
          </Card>
        )}
      </PageShell>
    </>
  );
}
