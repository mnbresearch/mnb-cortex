import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";

const ideas = ["New customer onboarding", "Monthly GST filing", "Purchase order approval", "Inventory reorder", "Employee onboarding", "Handling a customer complaint"];

export default function Sops() {
  return (
    <>
      <Topbar title="SOP Builder" subtitle="Turn how-you-do-things into repeatable processes" />
      <PageShell>
        <Section title="Write an SOP" desc="Describe the process — Cortex writes a clear, team-ready procedure">
          <AIPanel mode="sop" placeholder="e.g. How we approve and raise a purchase order for raw materials" cta="Generate the SOP" multiline saveMode="strategy" />
        </Section>
        <Section title="Common SOPs to create" desc="Tap one, paste it above, and generate">
          <div className="flex flex-wrap gap-2">{ideas.map((i) => <Badge key={i} className="border-border text-muted-foreground">{i}</Badge>)}</div>
        </Section>
      </PageShell>
    </>
  );
}
