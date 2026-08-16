import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { PlanBoard } from "@/components/plan-board";

export const dynamic = "force-dynamic";

export default function Plan() {
  return (
    <>
      <Topbar title="My Plan" subtitle="The few things that matter this week — chosen from 120+ modules, for your business." />
      <PageShell>
        <PlanBoard />
      </PageShell>
    </>
  );
}
