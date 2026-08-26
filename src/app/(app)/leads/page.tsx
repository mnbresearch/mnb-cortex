import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/export-button";
import { getLeads } from "@/lib/data";
import { deleteLead, addLead, convertLead } from "@/lib/actions";
import { CollapsibleForm, Field } from "@/components/forms";
import Link from "next/link";
import { Trash2, Inbox } from "lucide-react";

export const dynamic = "force-dynamic";
export default async function Leads() {
  const { rows, live } = await getLeads();
  return (
    <>
      <Topbar title="Leads" subtitle="Enquiries from your website, your imports and your team" />
      <PageShell>
        {!live && <Card className="p-5 bg-warning/10 border-warning/20 text-sm"><a href="/login" className="text-primary underline">Sign in</a> to view leads captured from your pricing page.</Card>}
        {live && (
          <CollapsibleForm title="Add a lead" action={addLead}>
            <Field name="name" label="Name" />
            <Field name="email" label="Email" type="email" />
            <Field name="phone" label="Phone" />
            <Field name="plan" label="Interested in" />
            <Field name="source" label="Source" placeholder="referral, call, trade show…" />
          </CollapsibleForm>
        )}
        {live && (
          <Card>
            <div className="flex items-center justify-between p-5 pb-3">
              <div><h3 className="font-semibold flex items-center gap-2"><Inbox className="h-4 w-4 text-primary" /> Inbox</h3><p className="text-xs text-muted-foreground">{rows.length} lead{rows.length === 1 ? "" : "s"}</p></div>
              <ExportButton rows={rows} filename="leads.csv" columns={["name", "email", "phone", "plan", "source", "created_at"]} />
            </div>
            <div className="px-2 pb-2 overflow-x-auto">
              {rows.length === 0 ? (
                /*
                  This used to read "No leads yet. Share your pricing page:
                  /pricing" — a link to MNB's OWN pricing page, shown to a
                  customer, pointing at a form that files leads under no
                  workspace at all. It could never be anything but empty.
                */
                <div className="p-4 text-sm text-muted-foreground space-y-2">
                  <p>No leads yet. There are three ways to get them in:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Point your website&apos;s enquiry form at the Cortex API — see <Link href="/developers" className="text-primary">Developers</Link> for the key and a copy-paste example.</li>
                    <li><Link href="/import" className="text-primary">Import a CSV</Link> of the enquiries you already have.</li>
                    <li>Add one by hand using the form above.</li>
                  </ul>
                </div>
              ) : (
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
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            {/* customers.status already had a "lead" value with no
                                relationship to this table — there was no way to
                                move a person from one to the other. */}
                            <form action={convertLead}>
                              <input type="hidden" name="id" value={l.id} />
                              <button className="text-xs text-primary px-2 py-1 rounded-md hover:bg-primary/10 whitespace-nowrap">Make customer</button>
                            </form>
                            <form action={deleteLead}><input type="hidden" name="id" value={l.id} /><button className="text-muted-foreground hover:text-danger p-1.5 rounded-md hover:bg-danger/10"><Trash2 className="h-4 w-4" /></button></form>
                          </div>
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
