import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain } from "lucide-react";

export const dynamic = "force-dynamic";
const frameworks = ["MECE Issue Tree", "SWOT", "Porter's Five Forces", "BCG Matrix", "Ansoff Matrix", "Growth Strategy"];
const swot = {
  Strengths: ["Strong West-region distribution", "Premium-X product-market fit", "Low attrition vs industry"],
  Weaknesses: ["Margin exposed to RM-204 price", "Thin cash runway (5 mo)", "Receivables discipline weak"],
  Opportunities: ["UAE export entry", "Value-tier to counter competitor", "South-region whitespace"],
  Threats: ["Competitor 8% price cut", "Raw-material inflation", "Customer concentration"],
};
export default function Strategy() {
  return (
    <>
      <Topbar title="AI Strategy Consultant" subtitle="Thinks like McKinsey · BCG · Bain" />
      <PageShell>
        <Card className="p-4">
          <div className="flex items-center gap-2 rounded-lg border px-3 h-11">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <input className="flex-1 bg-transparent text-sm outline-none" placeholder="Why is revenue flat? Should we change pricing?" />
            <Button size="sm">Build analysis</Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">{frameworks.map((f) => <Badge key={f} className="border-border text-muted-foreground">{f}</Badge>)}</div>
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

        <Section title="SWOT" desc="Auto-generated from your live data">
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
