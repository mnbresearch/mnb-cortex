import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { DeleteButton } from "@/components/forms";
import { getApprovals } from "@/lib/data";
import { updateStatus } from "@/lib/actions";
import { inr } from "@/lib/utils";
import { Check, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

function StatusButton({ table, id, status, label }: { table: string; id: string; status: string; label: string }) {
  return (
    <form action={updateStatus}>
      <input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} /><input type="hidden" name="path" value="/approvals" />
      <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground h-8 px-3 text-xs font-medium hover:opacity-90"><Check className="h-3.5 w-3.5" /> {label}</button>
    </form>
  );
}

export default async function Approvals() {
  const { pos, invoices, live } = await getApprovals();
  const empty = pos.length === 0 && invoices.length === 0;
  return (
    <>
      <Topbar title="Approvals" subtitle="The AI drafts — you approve" />
      <PageShell>
        {!live && (
          <Card className="p-5 bg-warning/10 border-warning/20 text-sm">
            <a href="/login" className="text-primary underline">Sign in</a> and load demo data, then the AI's drafted purchase orders and pending invoices appear here for one-click approval.
          </Card>
        )}
        {live && empty && (
          <Card className="p-10 text-center text-muted-foreground"><ShieldCheck className="h-8 w-8 mx-auto mb-2" />Nothing awaiting approval. The AI will queue drafted POs and pending invoices here.</Card>
        )}
        {live && pos.length > 0 && (
          <Section title="AI-drafted purchase orders" desc="Approve to send to the supplier">
            <div className="space-y-2">
              {pos.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div><div className="font-medium text-sm">{p.po_no} · {p.item}</div><div className="text-xs text-muted-foreground">{p.supplier} · {p.qty} units · {inr(Number(p.amount))}</div></div>
                  <div className="flex items-center gap-2">
                    <StatusButton table="purchase_orders" id={p.id} status="sent" label="Approve & send" />
                    <DeleteButton table="purchase_orders" id={p.id} path="/approvals" />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
        {live && invoices.length > 0 && (
          <Section title="Pending invoices" desc="Mark as paid once received">
            <div className="space-y-2">
              {invoices.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div><div className="font-medium text-sm">{i.invoice_no} · {i.party}</div><div className="text-xs text-muted-foreground">{inr(Number(i.amount))} · due {String(i.due_date).slice(0,10)}</div></div>
                  <StatusButton table="invoices" id={i.id} status="paid" label="Mark paid" />
                </div>
              ))}
            </div>
          </Section>
        )}
      </PageShell>
    </>
  );
}
