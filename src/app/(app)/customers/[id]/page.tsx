import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SafeForm } from "@/components/safe-form";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { getCustomer360 } from "@/lib/customer-360";
import { proposeAction } from "@/lib/engine/server-actions";
import { SEGMENT_TONE } from "@/lib/rfm";
import { inr } from "@/lib/utils";
import { ArrowLeft, Mail, Phone, Send, Ban, MessageSquare, BrainCircuit, FileText, ShoppingCart } from "lucide-react";

export const dynamic = "force-dynamic";

/*
  /customers/[id] — one party, everything, and the two things you can do
  about them. Every action goes through proposeAction → the ledger → the
  owner's rules, exactly like chat; nothing on this page writes directly.
*/
const date = (s: string | null) => (s ? String(s).slice(0, 10) : "—");

export default async function CustomerPage({ params }: { params: { id: string } }) {
  const { orgId } = await getUserAndOrg();
  if (!orgId) {
    return (
      <>
        <Topbar title="Customer" />
        <PageShell><Card className="p-5 text-sm"><Link href="/login" className="text-primary underline">Sign in</Link> to see a customer's history.</Card></PageShell>
      </>
    );
  }
  const c = await getCustomer360(orgId, params.id);
  if (!c) notFound();
  const canAct = await hasRole("analyst");
  const worst = c.invoices.filter((i) => i.status !== "paid" && i.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue)[0];

  return (
    <>
      <Topbar title={c.customer.name} subtitle={[c.customer.company, c.customer.status].filter(Boolean).join(" · ") || "Customer"} />
      <PageShell>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All customers</Link>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {c.customer.email && <a href={`mailto:${c.customer.email}`} className="inline-flex items-center gap-1.5 rounded-lg border h-8 px-3 hover:bg-accent"><Mail className="h-3.5 w-3.5" aria-hidden="true" /> {c.customer.email}</a>}
            {c.customer.phone && <a href={`tel:${c.customer.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border h-8 px-3 hover:bg-accent"><Phone className="h-3.5 w-3.5" aria-hidden="true" /> {c.customer.phone}</a>}
            {c.doNotContact && <Badge className="bg-danger/10 text-danger border-danger/20">Do not contact</Badge>}
            {c.rfm && <Badge className={SEGMENT_TONE[c.rfm.segment]}>{c.rfm.segment}</Badge>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Lifetime orders", value: inr(c.totals.lifetime), sub: `${c.totals.orders} won order${c.totals.orders === 1 ? "" : "s"}` },
            { label: "Open receivable", value: inr(c.totals.openReceivable), sub: c.invoices.filter((i) => i.status !== "paid").length + " open invoice(s)" },
            { label: "Overdue", value: inr(c.totals.overdue), sub: c.totals.oldestOverdueDays ? `oldest ${c.totals.oldestOverdueDays} days past due` : "nothing past due", tone: c.totals.overdue > 0 ? "text-danger" : "" },
            { label: "Last order", value: date(c.totals.lastOrder), sub: c.totals.firstSeen ? `first seen ${date(c.totals.firstSeen)}` : "" },
          ].map((k) => (
            <Card key={k.label} className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className={`text-xl font-semibold mt-0.5 ${(k as any).tone || ""}`}>{k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.sub}</div>
            </Card>
          ))}
        </div>

        {canAct && (worst || !c.doNotContact) && (
          <Card className="p-4">
            <div className="text-sm font-medium">Do something about it</div>
            <p className="text-xs text-muted-foreground mt-0.5">Each of these is a proposal: it runs only if your Approvals rule allows it, otherwise it waits for a tap.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {worst && !c.doNotContact && (
                <SafeForm action={proposeAction}>
                  <input type="hidden" name="action" value="send_payment_reminder" />
                  <input type="hidden" name="args" value={JSON.stringify({ invoice_id: worst.id, invoice_no: worst.invoice_no || undefined, channel: "email" })} />
                  <input type="hidden" name="rationale" value={`Invoice ${worst.invoice_no || worst.id.slice(0, 8)} for ${inr(worst.amount)} is ${worst.daysOverdue} days past due — proposed from the customer page.`} />
                  <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-9 px-3 text-sm font-medium hover:opacity-90"><Send className="h-4 w-4" aria-hidden="true" /> Remind about {worst.invoice_no || "the oldest invoice"} ({worst.daysOverdue}d)</button>
                </SafeForm>
              )}
              {!c.doNotContact && (
                <SafeForm action={proposeAction}>
                  <input type="hidden" name="action" value="add_do_not_contact" />
                  <input type="hidden" name="args" value={JSON.stringify({ party: c.customer.name })} />
                  <input type="hidden" name="rationale" value="Stop all collections messages to this party — requested from the customer page." />
                  <button className="inline-flex items-center gap-1.5 rounded-lg border h-9 px-3 text-sm font-medium hover:bg-accent"><Ban className="h-4 w-4" aria-hidden="true" /> Stop chasing this party</button>
                </SafeForm>
              )}
              <Link href={`/chat?q=${encodeURIComponent(`Tell me everything about ${c.customer.name}`)}`} className="inline-flex items-center gap-1.5 rounded-lg border h-9 px-3 text-sm font-medium hover:bg-accent"><MessageSquare className="h-4 w-4" aria-hidden="true" /> Ask Cortex</Link>
            </div>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Invoices" desc={c.invoices.length ? `${c.invoices.length} matched by party name` : "No invoices name this party"}>
            {c.invoices.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="px-2 py-1.5">No.</th><th className="px-2 py-1.5">Amount</th><th className="px-2 py-1.5">Due</th><th className="px-2 py-1.5">Status</th></tr></thead>
                <tbody>{c.invoices.map((i) => (
                  <tr key={i.id} className="border-b border-border/50">
                    <td className="px-2 py-1.5 font-medium">{i.invoice_no || i.id.slice(0, 8)}</td>
                    <td className="px-2 py-1.5">{inr(i.amount)}</td>
                    <td className="px-2 py-1.5">{date(i.due_date)}</td>
                    <td className="px-2 py-1.5">{i.status === "paid" ? <Badge className="bg-success/10 text-success border-success/20">Paid</Badge> : i.daysOverdue > 0 ? <Badge className="bg-danger/10 text-danger border-danger/20">{i.daysOverdue}d overdue</Badge> : <Badge>Open</Badge>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Section>

          <Section title="Orders" desc={c.orders.length ? `${c.orders.length} order${c.orders.length === 1 ? "" : "s"}${c.matchedBy.name && c.matchedBy.customerId ? ` · ${c.matchedBy.customerId} linked, the rest matched by name` : ""}` : "No orders yet"}>
            {c.orders.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="px-2 py-1.5">Date</th><th className="px-2 py-1.5">Order</th><th className="px-2 py-1.5">Product</th><th className="px-2 py-1.5">Amount</th><th className="px-2 py-1.5">Status</th></tr></thead>
                <tbody>{c.orders.slice(0, 50).map((o) => (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="px-2 py-1.5">{date(o.order_date)}</td>
                    <td className="px-2 py-1.5 font-medium">{o.order_no || o.id.slice(0, 8)}</td>
                    <td className="px-2 py-1.5">{o.product || "—"}</td>
                    <td className="px-2 py-1.5">{inr(o.amount)}</td>
                    <td className="px-2 py-1.5 capitalize">{o.status || "won"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            {c.orders.length > 50 && <p className="text-xs text-muted-foreground mt-2">Showing the latest 50 of {c.orders.length}.</p>}
          </Section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Collections" desc={c.threads.length ? "Reminder threads on this party's invoices" : "No reminders have been drafted for this party"}>
            {c.threads.map((t) => {
              const inv = c.invoices.find((i) => i.id === t.invoice_id);
              return (
                <div key={t.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div><span className="font-medium">{inv?.invoice_no || t.invoice_id.slice(0, 8)}</span> · {inr(t.amount)} · {t.attempts} attempt{t.attempts === 1 ? "" : "s"}{t.last_sent_at ? ` · last ${date(t.last_sent_at)}` : ""}</div>
                  <Badge className="capitalize">{t.status}</Badge>
                </div>
              );
            })}
            <Link href="/collections" className="inline-block mt-2 text-xs text-primary underline">Open collections</Link>
          </Section>

          <Section title="What Cortex remembers" desc={c.memories.length ? "Memories tagged with this party" : "Nothing remembered yet — say 'remember' in chat"}>
            {c.memories.map((m) => (
              <div key={m.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" /> {m.kind} · {date(m.created_at)}</div>
                {m.title && <div className="font-medium mt-0.5">{m.title}</div>}
                <div className="mt-0.5 text-muted-foreground">{m.content.slice(0, 300)}</div>
              </div>
            ))}
            {c.customer.notes && (
              <div className="rounded-lg border p-3 text-sm"><div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5" aria-hidden="true" /> Notes on the record</div><div className="mt-0.5">{c.customer.notes}</div></div>
            )}
          </Section>
        </div>

        {c.incomplete && <p className="text-xs text-warning">This workspace has more records than this page reads at once (20,000), so the totals above may be incomplete.</p>}
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" /> Invoices and unlinked orders are matched to this customer by normalised name — the same rule the importer uses — so spelling variants of the same party land here.</p>
      </PageShell>
    </>
  );
}
