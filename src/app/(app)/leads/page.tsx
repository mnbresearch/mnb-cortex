import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/export-button";
import { getLeads } from "@/lib/data";
import { deleteLead } from "@/lib/actions";
import { Trash2, Inbox } from "lucide-react";

export const dynamic = "force-dynamic";
export default async function Leads() {
  const { rows, live } = await getLeads();
  return (
    <>
      <Topbar title="Leads" subtitle="Pricing inquiries from your site" />
      <PageShell>
        {!live && <Card className="p-5 bg-warning/10 border-warning/20 text-sm"><a href="/login" className="text-primary underline">Sign in</a> to view leads captured from your pricing page.</Card>}
        {live && (
          <Card>
            <div className="flex items-center justify-between p-5 pb-3">
              <div><h3 className="font-semibold flex items-center gap-2"><Inbox className="h-4 w-4 text-primary" /> Inbox</h3><p className="text-xs text-muted-foreground">{rows.length} lead{rows.length === 1 ? "" : "s"}</p></div>
              <ExportButton rows={rows} filename="leads.csv" columns={["name", "email", "phone", "plan", "source", "created_at"]} />
            </div>
            <div className="px-2 pb-2 overflow-x-auto">
              {rows.length === 0 ? <p className="text-sm text-muted-foreground p-4">No leads yet. Share your pricing page: /pricing</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground border-b">{["Name","Email","Phone","Plan","Source","When",""].map((h)=><th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.id} className="border-b border-border/50 hover:bg-accent/40">
                        <td className="px-3 py-2 font-medium">{l.name}</td>
                        <td className="px-3 py-2"><a href={`mailto:${l.email}`} className="text-primary">{l.email}</a></td>
                        <td className="px-3 py-2">{l.phone || "—"}</td>
                        <td className="px-3 py-2"><Badge className="border-border">{l.plan || "—"}</Badge></td>
                        <td className="px-3 py-2 text-muted-foreground">{l.source}</td>
                        <td className="px-3 py-2 text-muted-foreground">{String(l.created_at).slice(0, 16).replace("T", " ")}</td>
                        <td className="px-3 py-2 text-right">
                          <form action={deleteLead}><input type="hidden" name="id" value={l.id} /><button className="text-muted-foreground hover:text-danger p-1.5 rounded-md hover:bg-danger/10"><Trash2 className="h-4 w-4" /></button></form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        )}
      </PageShell>
    </>
  );
}
