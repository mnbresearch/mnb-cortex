import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CollapsibleForm, Field, SelectField, DeleteButton } from "@/components/forms";
import { getPipeline } from "@/lib/data";
import { addDeal, moveDeal } from "@/lib/actions";
import { inr } from "@/lib/utils";
import { scorePipeline, pipelineSummary } from "@/lib/lead-score";
import { Card } from "@/components/ui/card";
import { Flame, Snowflake, TrendingUp } from "lucide-react";

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

  // Scored, ranked and explained — the "AI-ranked pipeline that tells you who
  // to chase" the marketing has always promised. Deterministic arithmetic, so
  // it costs nothing, never rate-limits, and gives the same answer twice.
  const scored = scorePipeline(deals as any);
  const sum = pipelineSummary(scored);
  const chase = scored.slice(0, 5);
  const byId = new Map(scored.map((d) => [String(d.id), d]));

  return (
    <>
      <Topbar title="Deals Pipeline" subtitle="Ranked by what's actually worth chasing" />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4"><div className="text-sm text-muted-foreground">Open deals</div><div className="text-2xl font-semibold mt-1">{sum.count}</div></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground">Pipeline value</div><div className="text-2xl font-semibold mt-1">{inr(sum.gross)}</div></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground">Weighted forecast</div><div className="text-2xl font-semibold mt-1">{inr(sum.weighted)}</div><div className="text-xs text-muted-foreground">value × probability</div></Card>
          <Card className="p-4"><div className="text-sm text-muted-foreground">Going cold</div><div className="text-2xl font-semibold mt-1">{sum.stale}</div><div className="text-xs text-muted-foreground">untouched 45+ days</div></Card>
        </div>

        {chase.length > 0 && (
          <Card className="p-5">
            <div className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Chase these first</div>
            <div className="mt-3 space-y-2">
              {chase.map((d) => (
                <div key={String(d.id)} className="flex items-start gap-3 rounded-lg border p-3">
                  <span className={`text-xs font-bold rounded-md px-2 py-1 shrink-0 ${d.band === "hot" ? "bg-danger/10 text-danger" : d.band === "warm" ? "bg-warning/10 text-warning" : "bg-secondary text-muted-foreground"}`}>{d.score}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{d.deal_name} <span className="text-muted-foreground font-normal">· {d.customer_name}</span></div>
                    <div className="text-xs text-muted-foreground">{d.why}</div>
                  </div>
                  {d.band === "hot" ? <Flame className="h-4 w-4 text-danger shrink-0" /> : d.ageDays > 45 ? <Snowflake className="h-4 w-4 text-muted-foreground shrink-0" /> : null}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Score = expected value (55) + stage progress (30) + recency (15). Hot ≥ 65, warm ≥ 35.</p>
          </Card>
        )}

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
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium leading-tight">{d.deal_name}</div>
                        {byId.get(String(d.id)) && (
                          <span
                            title={byId.get(String(d.id))!.why}
                            className={`text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0 ${byId.get(String(d.id))!.band === "hot" ? "bg-danger/10 text-danger" : byId.get(String(d.id))!.band === "warm" ? "bg-warning/10 text-warning" : "bg-secondary text-muted-foreground"}`}
                          >{byId.get(String(d.id))!.score}</span>
                        )}
                      </div>
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
