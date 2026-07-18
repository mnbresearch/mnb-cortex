import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const vendors = [
  { name: "RM-204 primary supplier", score: "3.2", flag: "Single-source · price +9%", tone: "warn" },
  { name: "Packaging co.", score: "4.1", flag: "Reliable, slight lead-time creep", tone: "ok" },
  { name: "Logistics partner", score: "3.8", flag: "Good rates, occasional delays", tone: "ok" },
];
const tone: Record<string, string> = { warn: "bg-warning/10 text-warning border-warning/20", ok: "bg-success/10 text-success border-success/20" };

export default function Vendors() {
  return (
    <>
      <Topbar title="Vendor Scorecard" subtitle="Grade your suppliers — de-risk your supply chain" />
      <PageShell>
        <Section title="Current suppliers" desc="Weighted on price, quality, reliability, lead time, terms and risk">
          <div className="space-y-2">
            {vendors.map((v) => (
              <Card key={v.name} className="p-4 flex items-center gap-3">
                <div className="flex-1"><div className="font-medium text-sm">{v.name}</div><div className="text-sm text-muted-foreground">{v.flag}</div></div>
                <Badge className={tone[v.tone]}>{v.score} / 5</Badge>
              </Card>
            ))}
          </div>
        </Section>
        <Section title="Score a vendor" desc="Cortex builds a full scorecard and negotiation angle">
          <AIPanel mode="vendor" placeholder="e.g. My RM-204 supplier wants a 9% hike, 21-day lead time, net-15 terms. Score them." cta="Build vendor scorecard" multiline saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
