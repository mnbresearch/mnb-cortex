import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AIPanel } from "@/components/ai-panel";
import { SalesTargetPlanner } from "@/components/sales-target-planner";

export const dynamic = "force-dynamic";

export default function Targets() {
  return (
    <>
      <Topbar title="Sales Target Planner" subtitle="A number your team can actually run against" />
      <PageShell>
        <SalesTargetPlanner />
        <Section title="Make the plan achievable" desc="Ask Cortex how to hit the target">
          <AIPanel mode="strategy" placeholder="e.g. I need 30% growth this year with 6 reps — what's the go-to-market plan?" cta="Build the growth plan" multiline saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
