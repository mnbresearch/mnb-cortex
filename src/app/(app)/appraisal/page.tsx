import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { AppraisalPlanner } from "@/components/appraisal-planner";

export const dynamic = "force-dynamic";

export default function Appraisal() {
  return (
    <>
      <Topbar title="Appraisal & Hike Planner" subtitle="Distribute your raise budget across performance bands" />
      <PageShell><AppraisalPlanner /></PageShell>
    </>
  );
}
