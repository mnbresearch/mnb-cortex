import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { GoalsTracker } from "@/components/goals-tracker";

export const dynamic = "force-dynamic";

export default function Goals() {
  return (
    <>
      <Topbar title="Goals & OKRs" subtitle="Set targets — Cortex tracks them and tells you how to hit them" />
      <PageShell>
        <GoalsTracker />
        <Section title="How OKRs work in Cortex" desc="Objectives and Key Results, wired to your live data">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Set a target for any metric that matters — margin, revenue, receivables, runway, headcount. Cortex measures progress against your live numbers and, when you ask, generates the single highest-leverage move for each goal.</p>
            <p>Goals with a green ring are on track; amber means at risk; red means off track and needing attention this week.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
