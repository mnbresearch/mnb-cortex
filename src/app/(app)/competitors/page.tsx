import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const watch = [
  { name: "Entry-tier rival", move: "Cut prices 8%", threat: "High", note: "Targeting your Value-Tier volume" },
  { name: "Regional challenger", move: "Expanding in West", threat: "Medium", note: "Your strongest region — defend accounts" },
  { name: "New online entrant", move: "D2C on marketplaces", threat: "Low", note: "Different channel, watch for spillover" },
];

const tone: Record<string, string> = {
  High: "bg-danger/10 text-danger border-danger/20",
  Medium: "bg-warning/10 text-warning border-warning/20",
  Low: "bg-success/10 text-success border-success/20",
};

export default function Competitors() {
  return (
    <>
      <Topbar title="Competitor Intelligence" subtitle="Know their next move before they make it" />
      <PageShell>
        <Section title="Watchlist" desc="Competitive threats on your radar">
          <div className="space-y-2">
            {watch.map((w) => (
              <Card key={w.name} className="p-4 flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium text-sm">{w.name}</div>
                  <div className="text-sm text-muted-foreground">{w.move} — {w.note}</div>
                </div>
                <Badge className={tone[w.threat]}>{w.threat} threat</Badge>
              </Card>
            ))}
          </div>
        </Section>
        <Section title="Analyse a competitor" desc="Cortex builds a battlecard and a response plan">
          <AIPanel mode="competitor" placeholder="e.g. A rival just cut entry-tier prices 8%. How should we respond without wrecking margin?" cta="Build competitive battlecard" multiline saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
