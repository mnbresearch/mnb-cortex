import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { CapacityPlanner } from "@/components/capacity-planner";

export const dynamic = "force-dynamic";

export default function Capacity() {
  return (
    <>
      <Topbar title="Team Capacity & Utilisation" subtitle="Balance the load before someone burns out" />
      <PageShell>
        <CapacityPlanner />
        <Section title="The two failure modes" desc="Both cost you money">
          <div className="text-sm text-muted-foreground space-y-2">
            <p><b>Over-booked people</b> don't just burn out — delivery slips, quality drops, and the client notices. Anyone consistently above 100% is a resignation risk you can see coming.</p>
            <p><b>Idle capacity</b> is silent: you pay for the hours whether or not they're sold. The "idle value" figure is revenue you could have billed with the team you already have — usually cheaper to fix with sales than with hiring.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
