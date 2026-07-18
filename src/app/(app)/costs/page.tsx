import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const areas = [
  { area: "Raw material (RM-204)", idea: "Backup supplier + volume renegotiation", save: "₹6–8 L/mo", tone: "up" },
  { area: "Packing overtime", idea: "Add a half-shift, cap overtime", save: "₹2 L/mo", tone: "up" },
  { area: "Logistics", idea: "Consolidate loads, renegotiate rates", save: "₹1–1.5 L/mo", tone: "flat" },
  { area: "Working capital interest", idea: "Cut DSO to reduce borrowing", save: "₹1 L/mo", tone: "flat" },
];

export default function Costs() {
  return (
    <>
      <Topbar title="Cost Optimizer" subtitle="Find savings without starving growth" />
      <PageShell>
        <Section title="Savings on the table" desc="Where the money is leaking — ranked by impact">
          <div className="space-y-2">
            {areas.map((a) => (
              <Card key={a.area} className="p-4 flex items-center gap-3">
                <div className="flex-1"><div className="font-medium text-sm">{a.area}</div><div className="text-sm text-muted-foreground">{a.idea}</div></div>
                <Badge className={a.tone === "up" ? "bg-success/10 text-success border-success/20" : "border-border text-muted-foreground"}>{a.save}</Badge>
              </Card>
            ))}
          </div>
        </Section>
        <Section title="Run a cost-optimization pass" desc="Cortex finds savings and flags what not to cut">
          <AIPanel mode="costs" placeholder="Optional: focus (e.g. 'overheads only' or 'supply chain')" cta="Find cost savings" saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
