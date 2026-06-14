import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/forms";
import { ExportButton } from "@/components/export-button";

export type Col = { key: string; label: string; kind?: "inr" | "pct" | "text" | "date" };

function fmt(v: any, kind?: string) {
  if (v == null) return "—";
  if (kind === "inr") { const n = Number(v); if (n >= 1e7) return `₹${(n/1e7).toFixed(2)} Cr`; if (n >= 1e5) return `₹${(n/1e5).toFixed(2)} L`; return `₹${n.toLocaleString("en-IN")}`; }
  if (kind === "pct") return `${v}%`;
  if (kind === "date") return String(v).slice(0, 10);
  return String(v);
}

export function DataTable({ title, rows, cols, table, path, live }: { title: string; rows: any[]; cols: Col[]; table: string; path: string; live: boolean }) {
  return (
    <Card>
      <div className="flex items-center justify-between p-5 pb-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{live ? `${rows.length} record${rows.length === 1 ? "" : "s"} in your workspace` : "Sign in to manage your own records"}</p>
        </div>
        <ExportButton rows={rows} filename={`${table}.csv`} columns={cols.map((c) => c.key)} />
      </div>
      <div className="px-2 pb-2 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No records yet. Add one above{live ? "" : ", or sign in and load demo data"}.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                {cols.map((c) => <th key={c.key} className="px-3 py-2 font-medium">{c.label}</th>)}
                {live && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-accent/40">
                  {cols.map((c) => <td key={c.key} className="px-3 py-2">{fmt(r[c.key], c.kind)}</td>)}
                  {live && <td className="px-3 py-2 text-right"><DeleteButton table={table} id={r.id} path={path} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
