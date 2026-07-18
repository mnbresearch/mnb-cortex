import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const roles = [
  { role: "Collections / AR executive", roi: "High", why: "₹72 L overdue — pays for itself in weeks", tone: "up" },
  { role: "Regional sales (South)", roi: "High", why: "Whitespace + Premium-X demand", tone: "up" },
  { role: "Procurement specialist", roi: "Medium", why: "Backup suppliers + better RM-204 terms", tone: "flat" },
  { role: "Second packing shift lead", roi: "Medium", why: "Cuts overtime, lifts productivity", tone: "flat" },
];

export default function Hiring() {
  return (
    <>
      <Topbar title="Hiring & Org Advisor" subtitle="Hire only where it creates the most value — tied to your cash" />
      <PageShell>
        <Card className="p-4 border-warning/30 bg-warning/5">
          <div className="text-sm"><b className="text-warning">Cash-aware view:</b> runway is ~5 months, so fund roles that return cash fast (collections, sales) before overhead hires. Consider contractors for spiky work.</div>
        </Card>

        <Section title="Highest-value roles right now" desc="Ranked by return, weighted against runway">
          <div className="space-y-2">
            {roles.map((r) => (
              <Card key={r.role} className="p-4 flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium text-sm">{r.role}</div>
                  <div className="text-sm text-muted-foreground">{r.why}</div>
                </div>
                <Badge className={r.tone === "up" ? "bg-success/10 text-success border-success/20" : "border-border text-muted-foreground"}>ROI: {r.roi}</Badge>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Ask the hiring advisor" desc="Should you hire? Which role? What's the payback?">
          <AIPanel mode="hiring" placeholder="e.g. Should I hire 2 salespeople now, or wait a quarter?" cta="Get hiring advice" multiline saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
