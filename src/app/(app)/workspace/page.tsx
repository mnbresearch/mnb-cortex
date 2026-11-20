import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { AgentWorkspace } from "@/components/agent-workspace";
import { TEAMS, CORE_AGENTS } from "@/lib/agents/teams";
import { getUserAndOrg } from "@/lib/data";
import { hasRole } from "@/lib/roles";
import { workspaceAgents } from "@/lib/agents/workspace-agents";
import { Card } from "@/components/ui/card";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

/*
  /workspace — the Agent Workspace.

  Delegate work in plain words; Cortex routes it to the right agent (or has a
  team lead plan it across specialists), the agents work from the workspace's
  own rows through their tools, every action they want to take waits on
  /approvals, and every rupee figure in the answer is checked by Veritas v1.
  The task list, timeline and controls are client-side (components/
  agent-workspace.tsx) because the page itself is the runner while it is open.
*/
export default async function WorkspacePage({ searchParams }: { searchParams?: { team?: string } }) {
  const { orgId } = await getUserAndOrg();
  const [canDelegate, canSchedule] = orgId ? await Promise.all([hasRole("analyst"), hasRole("manager")]) : [false, false];
  /* Agent Studio agents are named in task timelines alongside the built-ins. */
  const own = orgId ? await workspaceAgents(orgId) : [];
  return (
    <>
      <Topbar title="Agent Workspace" subtitle="Delegate the work. Your agents read your books, propose the actions, and show their working." />
      <PageShell>
        {!orgId ? (
          <Card className="p-6 text-sm">
            <p className="font-semibold">Sign in to a workspace to delegate work to your agents.</p>
            <p className="mt-1 text-muted-foreground">Agents work only from your own data, so they need a workspace to read. <Link href="/login" className="underline">Sign in</Link>.</p>
          </Card>
        ) : (
          <AgentWorkspace
            teams={TEAMS.map((t) => ({ id: t.id, name: t.name, solution: t.solution, examples: t.examples }))}
            agents={[...CORE_AGENTS, ...own].map((a) => ({ id: a.id, team: a.team, name: a.name, role: a.role, lead: a.lead }))}
            canDelegate={canDelegate} canSchedule={canSchedule} initialTeam={searchParams?.team}
          />
        )}
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Meet the agents, their tools and what they are allowed to do — or build your own in Agent Studio: <Link href="/workspace/agents" className="underline">Agent teams</Link>. Template agents for writing and design are in the <Link href="/agents" className="underline">agent library</Link>.</p>
      </PageShell>
    </>
  );
}
