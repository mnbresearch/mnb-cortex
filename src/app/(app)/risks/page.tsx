import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const risks = [
  { risk: "Line B stockout (RM-204)", like: "H", impact: "H", sign: "Inventory cover <10 days", mit: "Approve PO-4471; add backup supplier" },
  { risk: "Cash crunch", like: "M", impact: "H", sign: "Runway <4 mo, receivables rising", mit: "Collect overdue, tighten DSO to <30d" },
  { risk: "Margin erosion", like: "H", impact: "M", sign: "Input costs up, prices flat", mit: "Reprice low-elasticity SKUs +4%" },
  { risk: "Customer concentration", like: "M", impact: "H", sign: "Top 5 = large revenue share", mit: "Diversify pipeline, grow South region" },
  { risk: "Key-talent attrition", like: "M", impact: "M", sign: "3 high performers flagged", mit: "Retention conversations + comp review" },
  { risk: "Competitor price war", like: "M", impact: "M", sign: "Rival cut entry-tier 8%", mit: "Launch Value-Tier, defend premium" },
];

const lvl: Record<string, string> = {
  H: "bg-danger/10 text-danger border-danger/20",
  M: "bg-warning/10 text-warning border-warning/20",
  L: "bg-success/10 text-success border-success/20",
};

export default function Risks() {
  return (
    <>
      <Topbar title="Risk Radar" subtitle="What could go wrong — and the early warning signs" />
      <PageShell>
        <Card className="p-4 border-danger/30 bg-danger/5">
          <div className="text-sm"><b className="text-danger">Biggest risk right now:</b> Line B stockout on RM-204 within ~9 days. It's high-likelihood and high-impact, and the fix (PO-4471) is already drafted and waiting for approval.</div>
        </Card>

        <Section title="Risk matrix" desc="Likelihood × impact, with mitigations">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">Risk</th>
                <th className="py-2 pr-3 font-medium">Likelihood</th>
                <th className="py-2 pr-3 font-medium">Impact</th>
                <th className="py-2 pr-4 font-medium">Early warning</th>
                <th className="py-2 font-medium">Mitigation</th>
              </tr></thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.risk} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-4 font-medium">{r.risk}</td>
                    <td className="py-2 pr-3"><Badge className={lvl[r.like]}>{r.like}</Badge></td>
                    <td className="py-2 pr-3"><Badge className={lvl[r.impact]}>{r.impact}</Badge></td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.sign}</td>
                    <td className="py-2 text-muted-foreground">{r.mit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Generate a fresh risk assessment" desc="Cortex re-scans your live data for emerging risks">
          <AIPanel mode="risk" placeholder="Optional: focus (e.g. 'supply chain' or 'financial risk')" cta="Run risk assessment" saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
