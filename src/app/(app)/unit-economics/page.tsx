import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AIPanel } from "@/components/ai-panel";
import { UnitEconomics } from "@/components/unit-economics";

export const dynamic = "force-dynamic";

export default function UnitEconomicsPage() {
  return (
    <>
      <Topbar title="Unit Economics & Break-even" subtitle="Know exactly what each sale earns you" />
      <PageShell>
        <UnitEconomics />
        <Section title="Improve your unit economics" desc="Ask Cortex how to lift contribution margin">
          <AIPanel mode="pricing" placeholder="e.g. My contribution margin is 38% — how do I get it to 45% without losing volume?" cta="Get margin-improvement plan" multiline saveMode="strategy" />
        </Section>
      </PageShell>
    </>
  );
}
