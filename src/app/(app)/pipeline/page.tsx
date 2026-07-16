import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CollapsibleForm, Field, SelectField, DeleteButton } from "@/components/forms";
import { getPipeline } from "@/lib/data";
import { addDeal, moveDeal } from "@/lib/actions";
import { inr } from "@/lib/utils";

export const dynamic = "force-dynamic";
const STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];
const demo = [
  { id: "d1", stage: "lead", deal_name: "Bulk supply Q3", customer_name: "Horizon Mfg", value: 2400000 },
  { id: "d2", stage: "qualified", deal_name: "Export pilot UAE", customer_name: "Gulf Imports", value: 5600000 },
  { id: "d3", stage: "proposal", deal_name: "Annual contract", customer_name: "Metro Mart", value: 8900000 },
  { id: "d4", stage: "negotiation", deal_name: "Premium-X rollout", customer_name: "Sunrise Retail", value: 3300000 },
  { id: "d5", stage: "won", deal_name: "Repeat order", customer_name: "Apex Traders", value: 1700000 },
];

export default async function Pipeline() {
  const { rows, live } = await getPipeline();
  const deals = live && rows.length ? rows : demo;
  return (
    <>
      <Topbar title="Deals Pipeline" subtitle="Kanban view of your sales pipeline" />
      <PageShell>
        <CollapsibleForm title="Add deal" action={addDeal}>
          <Field name="deal_name" label="Deal name" required />
          <Field name="customer_name" label="Customer" />
          <Field name="value" label="Value (₹)" type="number" />
          <SelectField name="stage" label="Stage" options={STAGES} />
          <Field name="probability" label="Probability %" type="number" />
        </CollapsibleForm>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {STAGES.map((st) => {
            const col = deals.filter((d: any) => d.stage === st);
            const total = col.reduce((a: number, d: any) => a + (Number(d.value) || 0), 0);
            return (
              <div key={st} className="rounded-xl border bg-card/40 p-2">
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold capitalize">{st}</span>
                  <span className="text-[10px] text-muted-foreground">{col.length} · {inr(total)}</span>
                </div>
                <div className="space-y-2">
                  {col.map((d: any) => (
                    <div key={d.id} className="rounded-lg border bg-card p-2.5">
                      <div className="text-sm font-medium leading-tight">{d.deal_name}</div>
                      <div className="text-xs text-muted-foreground">{d.customer_name}</div>
                      <div className="text-xs mt-1 font-medium">{inr(Number(d.value) || 0)}</div>
                      {live && (
                        <div className="flex items-center gap-1 mt-2">
                          <form action={moveDeal} className="flex-1">
                            <input type="hidden" name="id" value={d.id} />
                            <select name="stage" defaultValue={d.stage} className="w-full rounded-md border bg-background px-1.5 h-7 text-[11px]">
                              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </form>
                          <DeleteButton table="sales_pipeline" id={d.id} path="/pipeline" />
                        </div>
                      )}
                    </div>
                  ))}
                  {col.length === 0 && <div className="text-[11px] text-muted-foreground px-2 py-3">—</div>}
                </div>
              </div>
            );
          })}
        </div>
        {live && <p className="text-xs text-muted-foreground">Change a card's stage dropdown to move the deal. Sign-in required to edit.</p>}
      </PageShell>
    </>
  );
}
