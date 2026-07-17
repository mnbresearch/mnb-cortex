import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { SimpleBar } from "@/components/charts/bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { Card } from "@/components/ui/card";
import { getLeads, getActivity, getUsage } from "@/lib/data";

export const dynamic = "force-dynamic";
export default async function Analytics() {
  const leads = await getLeads();
  const act = await getActivity();
  const usage = await getUsage();
  const totalRecords = Object.values(usage.counts || {}).reduce((a: number, b: any) => a + (b as number), 0);

  // leads per day (last 14)
  const days: { day: string; leads: number }[] = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); const key = d.toISOString().slice(0, 10);
    days.push({ day: d.toLocaleDateString("en", { day: "numeric", month: "short" }), leads: leads.rows.filter((l: any) => String(l.created_at).slice(0, 10) === key).length }); }
  // activity by type
  const byType: Record<string, number> = {}; for (const a of act.rows) byType[a.type] = (byType[a.type] || 0) + 1;
  const actData = Object.entries(byType).map(([name, value]) => ({ name, value }));
  const usageData = Object.entries(usage.counts || {}).map(([name, value]) => ({ name: name.replace("_", " "), value: value as number }));

  return (
    <>
      <Topbar title="Analytics" subtitle="Your workspace at a glance" />
      <PageShell>
        {!leads.live && <Card className="p-5 bg-warning/10 border-warning/20 text-sm"><a href="/login" className="text-primary underline">Sign in</a> to see your workspace analytics.</Card>}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Leads captured" value={`${leads.rows.length}`} />
          <Stat label="Activity events" value={`${act.rows.length}`} />
          <Stat label="Total records" value={`${totalRecords}`} />
          <Stat label="AI actions" value={`${act.rows.filter((a:any)=>a.type==="ai").length}`} tone="text-primary" />
        </div>
        <Section title="Leads — last 14 days"><TrendChart data={days} keys={[{ k: "leads", label: "Leads", color: "hsl(var(--primary))" }]} /></Section>
        <div className="grid lg:grid-cols-2 gap-6">
          <Section title="Activity by type">{actData.length ? <SimpleBar data={actData} x="name" y="value" /> : <p className="text-sm text-muted-foreground">No activity yet.</p>}</Section>
          <Section title="Records by module">{usageData.length ? <SimpleBar data={usageData} x="name" y="value" color="hsl(280 70% 60%)" /> : <p className="text-sm text-muted-foreground">No data yet.</p>}</Section>
        </div>
      </PageShell>
    </>
  );
}
