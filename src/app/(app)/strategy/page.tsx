import { getUserAndOrg } from "@/lib/data";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";
import { DataTable } from "@/components/data-table";
import { getStrategyList } from "@/lib/data";

export const dynamic = "force-dynamic";
const frameworks = ["MECE Issue Tree", "SWOT", "Porter's Five Forces", "BCG Matrix", "Ansoff Matrix", "Growth Strategy"];
const swot = {
  Strengths: ["Strong West-region distribution", "Premium-X product-market fit", "Low attrition vs industry"],
  Weaknesses: ["Margin exposed to RM-204 price", "Thin cash runway (5 mo)", "Receivables discipline weak"],
  Opportunities: ["UAE export entry", "Value-tier to counter competitor", "South-region whitespace"],
  Threats: ["Competitor 8% price cut", "Raw-material inflation", "Customer concentration"],
};
export default async function Strategy() {
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);

  const { rows, live } = await getStrategyList();
  return (
    <>
      <Topbar title="AI Strategy Consultant" subtitle="Thinks like McKinsey · BCG · Bain" />
      <PageShell>
        {signedIn && (
          <Card className="p-4 text-sm text-muted-foreground">
            The worked example below is illustrative — it is not your data. Use the AI panel on this page to get the
            same analysis built from your own numbers.
          </Card>
        )}
        <AIPanel mode="strategy" placeholder="Why is revenue flat? Should we change pricing? How do we hit 30% growth?" cta="Build the analysis" saveMode="strategy" />
        <DataTable title="Saved analyses" rows={rows} live={live} table="strategy_docs" path="/strategy" cols={[{key:"question",label:"Question"},{key:"framework",label:"Type"},{key:"created_at",label:"Saved",kind:"date"}]} />
        <Card className="p-4">
          <div className="text-sm font-medium">Frameworks Cortex can apply</div>
          <div className="flex flex-wrap gap-2 mt-2">{frameworks.map((f) => <Badge key={f} className="border-border text-muted-foreground">{f}</Badge>)}</div>
          <p className="text-xs text-muted-foreground mt-2">Name one in your question above and the analysis will use it.</p>
        </Card>

        <Section title="Issue tree — “Why is net profit down 7%?”" desc="MECE decomposition">
          <div className="text-sm space-y-2">
            <div className="font-medium">Profit ↓ = Revenue effect (+) ⟂ Cost effect (−)</div>
            <div className="pl-4 border-l-2 border-primary/30 space-y-1 text-muted-foreground">
              <div>├─ Revenue +12% → not the cause</div>
              <div>├─ Gross margin 33%→31% → <b className="text-foreground">primary driver</b></div>
              <div>│   ├─ RM-204 input cost +9% (not repriced)</div>
              <div>│   └─ Product mix shift toward Value-Tier</div>
              <div>└─ Opex → Packing overtime +18%</div>
            </div>
          </div>
        </Section>

        <Section title="SWOT" desc="An example framework — run the AI panel to build this from your live data">
          <div className="grid sm:grid-cols-2 gap-3">
            {Object.entries(swot).map(([k, v]) => (
              <Card key={k} className="p-4"><div className="font-medium text-sm mb-2">{k}</div>
                <ul className="text-sm text-muted-foreground space-y-1">{v.map((x) => <li key={x}>• {x}</li>)}</ul></Card>
            ))}
          </div>
        </Section>

        <Section title="Recommended roadmap" desc="Sequenced, with KPIs">
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>Reprice low-elasticity SKUs +4% — KPI: gross margin back to 33% in 60 days.</li>
            <li>Approve RM-204 PO + add backup supplier — KPI: zero Line-B stockouts.</li>
            <li>Tighten receivables to &lt;30 days — KPI: free up ₹40 L cash.</li>
            <li>Launch Value-Tier + pilot UAE — KPI: 8% new-revenue mix in 2 quarters.</li>
          </ol>
        </Section>
      </PageShell>
    </>
  );
}
