import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { getUserAndOrg } from "@/lib/data";
import { serviceClient } from "@/lib/supabase/server";
import { DEPARTMENTS } from "@/lib/agents/catalog";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

async function counts(orgId: string) {
  const sb = serviceClient();
  if (!sb) return null;
  const c = async (table: string, extra?: (q: any) => any) => {
    try { let q = sb.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId); if (extra) q = extra(q); const { count } = await q; return count || 0; }
    catch { return 0; }
  };
  const [memories, runs, metrics, customers, members, integrations, alerts] = await Promise.all([
    c("memories"), c("agent_runs"), c("health_metrics"), c("customers"), c("memberships"), c("integrations"), c("alerts"),
  ]);
  let profile = false, deptsCovered = 0, sub = "trialing";
  try { const { data } = await sb.from("memory_profile").select("org_id").eq("org_id", orgId).maybeSingle(); profile = Boolean(data); } catch {}
  try {
    const { data } = await sb.from("agent_runs").select("agent_id").eq("org_id", orgId).limit(2000);
    const ids = new Set(((data as any[]) || []).map((r) => String(r.agent_id)));
    deptsCovered = DEPARTMENTS.filter((d) => Array.from(ids).some((id) => id.startsWith(d.id + "."))).length;
  } catch {}
  try { const { data } = await sb.from("organizations").select("subscription_status").eq("id", orgId).single(); sub = String((data as any)?.subscription_status || "trialing"); } catch {}
  return { memories, runs, metrics, customers, members, integrations, alerts, profile, deptsCovered, sub };
}

export default async function Roadmap() {
  const { orgId } = await getUserAndOrg();
  const d = orgId ? await counts(orgId) : null;

  const steps = [
    { t: "Build your second brain", desc: "Capture facts or let Cortex learn from your data, so every agent knows your business.", href: "/memory", cta: "Open Cortex Memory", done: Boolean(d && (d.profile || d.memories > 0)) },
    { t: "Load your business data", desc: "Import sales, finance, inventory or customers so the AI works off real numbers.", href: "/import", cta: "Import data", done: Boolean(d && (d.metrics > 0 || d.customers > 0)) },
    { t: "Run your first agent", desc: "Pick any agent, fill the inputs, and get finished work in your voice.", href: "/agents", cta: "Open AI Agents", done: Boolean(d && d.runs > 0) },
    { t: "Activate every department", desc: "Run at least one agent in each of the 7 departments to light up your whole workforce.", href: "/workforce", cta: "Open Workforce", done: Boolean(d && d.deptsCovered >= DEPARTMENTS.length), progress: d ? `${d.deptsCovered}/${DEPARTMENTS.length} departments` : undefined },
    { t: "Set up an alert or the Autopilot", desc: "Let Cortex watch your KPIs and brief you daily without being asked.", href: "/alerts", cta: "Set up alerts", done: Boolean(d && d.alerts > 0) },
    { t: "Invite your team", desc: "Bring in the people who'll run agents and act on the insights.", href: "/admin", cta: "Invite teammates", done: Boolean(d && d.members > 1) },
    { t: "Connect a tool", desc: "Wire in Tally, Razorpay, WhatsApp, Slack and more so data flows automatically.", href: "/integrations", cta: "Connect integrations", done: Boolean(d && d.integrations > 0) },
    { t: "Upgrade to keep going", desc: "Pick a plan to unlock your full monthly credits and higher limits.", href: "/pricing", cta: "See plans", done: Boolean(d && d.sub === "active") },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <>
      <Topbar title="Your Roadmap" subtitle="Set up your AI workforce, step by step — first, second, third" />
      <PageShell>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Setup progress</div>
            <div className="text-sm text-muted-foreground">{doneCount} of {steps.length} done</div>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden"><div className="h-full brand-gradient" style={{ width: `${pct}%` }} /></div>
          <div className="text-xs text-muted-foreground mt-1">{pct}% complete — each step makes every agent sharper.</div>
        </Card>

        <div className="space-y-3">
          {steps.map((s, i) => (
            <Card key={s.t} className={`p-4 ${s.done ? "border-success/30 bg-success/5" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">{s.done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Step {i + 1}</span>
                    <span className="font-medium">{s.t}</span>
                    {s.progress && <span className="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{s.progress}</span>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">{s.desc}</div>
                </div>
                <Link href={s.href} className="shrink-0 inline-flex items-center gap-1 text-sm text-primary hover:underline">{s.cta} <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </Card>
          ))}
        </div>
      </PageShell>
    </>
  );
}
