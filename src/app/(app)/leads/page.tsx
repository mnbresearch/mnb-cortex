import { Topbar } from "@/components/topbar";
import { SafeForm } from "@/components/safe-form";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/export-button";
import { getLeads, getTableStats } from "@/lib/data";
import { deleteLead, addLead, convertLead } from "@/lib/actions";
import { CollapsibleForm, Field } from "@/components/forms";
import Link from "next/link";
import { Trash2, Inbox } from "lucide-react";
import { scoreLead } from "@/lib/lead-score";

export const dynamic = "force-dynamic";
export default async function Leads() {
  /*
    getLeads() lists the latest 200 and swallows its own read error, so a
    failed query used to render "No leads yet". getTableStats counts EVERY
    lead in this workspace and reports `error` — so the page can say "couldn't
    load" instead of "none", and "latest 200 of N" instead of a bare 200.
  */
  const [{ rows: raw, live }, stats] = await Promise.all([getLeads(), getTableStats("leads", "id")]);
  const total = stats.rows.length;
  const loadFailed = live && (Boolean(stats.error) || (raw.length === 0 && total > 0));
  const partial = live && !loadFailed && total > raw.length;
  /* Scored and sorted: open leads hottest first, converted ones last. */
  const isConverted = (l: any) => Boolean(l.converted_customer_id) || /· converted$/.test(String(l.source || ""));
  const rows = raw.map((l: any) => ({ ...l, _s: scoreLead(l), _c: isConverted(l) }))
    .sort((a: any, b: any) => Number(a._c) - Number(b._c) || b._s.score - a._s.score);
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
            <Field name="source" label="Source" placeholder="referral, call, trade show…" aria-label="referral, call, trade show" />
          </CollapsibleForm>
        )}
        {live && (
          <Card>
            <div className="flex items-center justify-between p-5 pb-3">
              <div><h3 className="font-semibold flex items-center gap-2"><Inbox className="h-4 w-4 text-primary" /> Inbox</h3><p className="text-xs text-muted-foreground">{partial ? <>Showing the latest {rows.length.toLocaleString("en-IN")} of {stats.truncated ? "more than " : ""}{total.toLocaleString("en-IN")} leads</> : <>{rows.length} lead{rows.length === 1 ? "" : "s"}</>} · scored by a fixed rule (contact details, business email, source, how recent) — hover a score for the reasons</p></div>
              <ExportButton rows={rows} filename="leads.csv" columns={["name", "email", "phone", "plan", "source", "created_at"]} />
            </div>
            <div className="px-2 pb-2 overflow-x-auto">
              {loadFailed ? (
                /* Not "No leads yet": the read failed, and saying "none" to an
                   owner with a full inbox is the worse error. */
                <div className="m-2 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm" role="alert">
                  <p className="font-medium">Couldn&apos;t load your leads just now.</p>
                  <p className="text-muted-foreground mt-1">
                    Nothing has been deleted. Reload the page; if it keeps failing{stats.error ? <>, the database said: <span className="font-mono text-xs">{stats.error}</span></> : "."}
                  </p>
                </div>
              ) : rows.length === 0 ? (
                /*
                  This used to read "No leads yet. Share your pricing page:
                  /pricing" — a link to MNB's OWN pricing page, shown to a
                  customer, pointing at a form that files leads under no
                  workspace at all. It could never be anything but empty.
                */
                <div className="p-4 text-sm text-muted-foreground space-y-2">
                  <p>No leads yet. There are three ways to get them in:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Send enquiries to the Cortex API (table <code>leads</code>) from your website&apos;s server, or from Zapier/Make — see <Link href="/developers" className="text-primary">Developers</Link> for the key and an example. Never put the key in browser code.</li>
                    <li><Link href="/import" className="text-primary">Import a CSV</Link> of the enquiries you already have.</li>
                    <li>Add one by hand using the form above.</li>
                  </ul>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground border-b">{["Score","Name","Email","Phone","Plan","Source","When",""].map((h)=><th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.id} className="border-b border-border/50 hover:bg-accent/40">
                        <td className="px-3 py-2" title={l._s.why}>
                          <span className={`text-[11px] font-bold rounded px-1.5 py-0.5 ${l._s.band === "hot" ? "bg-danger/10 text-danger" : l._s.band === "warm" ? "bg-warning/10 text-warning" : "bg-secondary text-muted-foreground"}`}>{l._s.score}</span>
                        </td>
                        <td className="px-3 py-2 font-medium">{l.name}{l.company ? <span className="text-xs text-muted-foreground"> · {l.company}</span> : null}</td>
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
                            {l._c ? <Badge className="border-success/30 text-success">Customer</Badge> : (
                            <SafeForm action={convertLead}>
                              <input type="hidden" name="id" value={l.id} />
                              <button className="text-xs text-primary px-2 py-1 rounded-md hover:bg-primary/10 whitespace-nowrap">Make customer</button>
                            </SafeForm>
                            )}
                            <SafeForm action={deleteLead}><input type="hidden" name="id" value={l.id} /><button className="text-muted-foreground hover:text-danger p-1.5 rounded-md hover:bg-danger/10 min-h-11 min-w-11" aria-label="Remove"><Trash2 aria-hidden="true" className="h-4 w-4" /></button></SafeForm>
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
