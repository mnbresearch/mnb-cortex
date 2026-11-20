import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { TEAMS, agentsInTeam } from "@/lib/agents/teams";
import { getUserAndOrg } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/server";
import { ShieldCheck, Wrench, Crown, Inbox } from "lucide-react";
import { AgentStudio } from "@/components/agent-studio";

export const dynamic = "force-dynamic";

const TOOL_LABEL: Record<string, string> = {
  top_receivables: "Receivables", top_payables: "Payables", top_customers: "Top customers", recent_orders: "Recent orders",
  low_stock: "Low stock", find_party: "Customer & supplier lookup", collections_status: "Collections", revenue_by_month: "Revenue by month",
  propose_action: "Propose actions (wait for approval)", business_snapshot: "KPI snapshot", msme_exposure: "43B(h) exposure",
  statutory_deadlines: "Statutory calendar", customer_segments: "Customer segments", recall_memory: "Read memory", remember_fact: "Write memory (labelled AI-inferred)",
  search_company_knowledge: "Company mail, chats & documents", list_company_sources: "Connected sources", query_connected_system: "Connected systems (MCP, read-only)",
};

/* Each agent's record in this workspace: steps finished and failed, and credits spent. Read-only, org-scoped. */
async function statsFor(orgId: string | null) {
  const out: Record<string, { done: number; failed: number; credits: number }> = {};
  const sb = serviceClient() as any;
  if (!orgId || !sb) return out;
  try {
    const { data } = await sb.from("agent_task_steps").select("agent_id, status, credits").eq("org_id", orgId).in("kind", ["agent", "synthesis", "plan"]).limit(5000);
    for (const r of ((data as any[]) || [])) {
      const k = String(r.agent_id || ""); if (!k) continue;
      const s = out[k] || (out[k] = { done: 0, failed: 0, credits: 0 });
      if (r.status === "done") s.done++;
      if (r.status === "failed") s.failed++;
      s.credits += Number(r.credits) || 0;
    }
  } catch { /* tables not migrated yet — show the roster without a record */ }
  return out;
}

export default async function AgentTeamsPage() {
  const { orgId } = await getUserAndOrg();
  const stats = await statsFor(orgId);
  return (
    <>
      <Topbar title="Agent teams" subtitle="Who your agents are, what they can look up, and what they are allowed to do — and the ones you build yourself." />
      <PageShell>
        <AgentStudio />
        <Card className="p-5 text-sm flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Every agent follows the same rules</p>
            <p className="text-muted-foreground mt-1">Agents read only this workspace&apos;s data, through named tools — never by writing their own queries. They can only <em>propose</em> actions: each one waits on <Link href="/approvals" className="underline">Approvals</Link> unless you have set an Autopilot rule for it. Customer names and identifiers are masked before anything reaches an AI model, and every rupee figure in an answer is checked against your data by Veritas v1.</p>
          </div>
        </Card>
        {TEAMS.map((team) => (
          <section key={team.id} className="space-y-3" aria-labelledby={`team-${team.id}`}>
            <div>
              <h2 id={`team-${team.id}`} className="text-base font-semibold">{team.solution}</h2>
              <p className="text-sm text-muted-foreground">{team.promise}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {agentsInTeam(team.id).map((a) => {
                const s = stats[a.id];
                return (
                  <Card key={a.id} className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      {a.lead && <Crown className="h-4 w-4 text-primary" aria-label="Team lead" />}
                      <h3 className="font-semibold text-sm">{a.name}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{a.role}</p>
                    <div className="flex flex-wrap gap-1">
                      {a.tools.map((tl) => (
                        <span key={tl} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${tl === "propose_action" ? "border-primary/30 text-primary" : ""}`}>
                          {tl === "propose_action" ? <Inbox className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}{TOOL_LABEL[tl] || tl}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Hands back: {a.outputs.join(" · ")}</p>
                    <p className="text-xs text-muted-foreground">{s ? `${s.done} step${s.done === 1 ? "" : "s"} done${s.failed ? ` · ${s.failed} failed` : ""} · ${s.credits} credits in this workspace` : "Not used in this workspace yet"}</p>
                    <Link href={`/workspace?team=${team.id}`} className="text-xs font-medium text-primary underline">Delegate to {team.name}</Link>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </PageShell>
    </>
  );
}
