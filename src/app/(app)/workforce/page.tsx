import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { WorkforceMap } from "@/components/workforce-map";
import { WorkforceGraph } from "@/components/workforce-graph";
import { getUserAndOrg } from "@/lib/data";
import { getProfile } from "@/lib/memory";
import { agentCount, DEPARTMENTS, agentsForDepartment } from "@/lib/agents/catalog";
import { Network, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Workforce() {
  const { orgId } = await getUserAndOrg();
  const profile = orgId ? await getProfile(orgId) : null;
  const hasBrain = Boolean((profile as any)?.profile_md);

  return (
    <>
      <Topbar title="Cortex Workforce" subtitle="Your AI org chart — an agent for every job, organised by team" />
      <PageShell>
        <Card className="p-4 border-primary/20 bg-primary/5 text-sm flex items-start gap-2">
          <Network className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>Every business runs on the same {DEPARTMENTS.length} functions. Cortex maps working AI agents to each — {agentCount()}+ in all, every one plugged into your second brain. Pick a team to see and run its agents.</span>
        </Card>

        {/* The living map — every agent connected to the central brain; activated ones light up. */}
        <div>
          <div className="eyebrow mb-3">The living workforce map</div>
          <WorkforceGraph />
        </div>

        {/* Clean, category-first departments — the fast way to find and run agents. */}
        <div>
          <div className="eyebrow mb-3">Your teams</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DEPARTMENTS.map((d, i) => {
              const n = agentsForDepartment(d.id).length;
              return (
                <Link key={d.id} href={`/agents?tab=${d.id}`} className="group" style={{ animationDelay: `${i * 30}ms` }}>
                  <Card className="rise-in p-5 h-full hover:border-primary/40 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center text-2xl">{d.emoji}</span>
                      <span className="text-xs text-muted-foreground">{n} agents</span>
                    </div>
                    <div className="font-semibold mt-3 flex items-center gap-1">{d.name}<ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" /></div>
                    <div className="text-sm text-muted-foreground mt-0.5">{d.blurb}</div>
                  </Card>
                </Link>
              );
            })}
            <Link href="/agents" className="group" style={{ animationDelay: `${DEPARTMENTS.length * 30}ms` }}>
              <Card className="rise-in p-5 h-full border-dashed border-primary/40 bg-primary/[0.04] hover:bg-primary/10 transition-all">
                <span className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center text-2xl">🛠️</span>
                <div className="font-semibold mt-3">Browse all agents</div>
                <div className="text-sm text-muted-foreground mt-0.5">By team, by your industry, or build your own.</div>
              </Card>
            </Link>
          </div>
        </div>

        <WorkforceMap totalAgents={agentCount()} hasBrain={hasBrain} />
      </PageShell>
    </>
  );
}
