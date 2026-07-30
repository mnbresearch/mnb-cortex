import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { WorkforceMap } from "@/components/workforce-map";
import { WorkforceGraph } from "@/components/workforce-graph";
import { getUserAndOrg } from "@/lib/data";
import { getProfile } from "@/lib/memory";
import { agentCount, DEPARTMENTS } from "@/lib/agents/catalog";
import { Network } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Workforce() {
  const { orgId } = await getUserAndOrg();
  const profile = orgId ? await getProfile(orgId) : null;
  const hasBrain = Boolean((profile as any)?.profile_md);

  return (
    <>
      <Topbar title="Cortex Workforce" subtitle="Your complete AI org chart — an agent for every job in the business" />
      <PageShell>
        <Card className="p-4 border-primary/20 bg-primary/5 text-sm flex items-start gap-2">
          <Network className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>Every business runs on the same {DEPARTMENTS.length} functions. Cortex maps a working AI agent to each job — {agentCount()}+ in all — every one plugged into your second brain. Pick a department, run an agent, and watch your workforce light up.</span>
        </Card>
        <WorkforceGraph />
        <WorkforceMap totalAgents={agentCount()} hasBrain={hasBrain} />
      </PageShell>
    </>
  );
}
