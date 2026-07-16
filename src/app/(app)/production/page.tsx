import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { InsightCard } from "@/components/insight-card";
import { SimpleBar } from "@/components/charts/bar-chart";
import { getInsights } from "@/lib/data";
import { Wrench, Users, CalendarRange, Bell } from "lucide-react";

export const dynamic = "force-dynamic";
const colorFor = (v: number) => v >= 80 ? "hsl(142 71% 40%)" : v >= 70 ? "hsl(38 92% 50%)" : "hsl(0 72% 51%)";
const oee = [{ name: "M-1", value: 82 }, { name: "M-2", value: 76 }, { name: "M-3", value: 64 }, { name: "M-4", value: 88 }].map(d => ({ ...d, fill: colorFor(d.value) }));

export default async function Production() {
  const insights = await getInsights("production");
  return (
    <>
      <Topbar title="Production Intelligence" subtitle="For manufacturing — OEE, downtime, yield" />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Avg OEE" value="77.5%" hint="target 85%" tone="text-warning" />
          <Stat label="Reject rate" value="3.1%" hint="-0.4 pts" tone="text-success" />
          <Stat label="Downtime (wk)" value="14.2 hrs" hint="M-3 worst" />
          <Stat label="Yield" value="94.6%" hint="stable" />
        </div>
        <Section title="OEE by machine" desc="Green ≥80 · Amber 70–80 · Red <70">
          <SimpleBar data={oee} x="name" y="value" colorField="fill" />
        </Section>
        <div className="grid md:grid-cols-2 gap-3">{insights.map((i) => <InsightCard key={i.id} ins={i} />)}</div>
        <Section title="AI actions">
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border h-10 px-4 text-sm hover:bg-accent"><CalendarRange className="h-4 w-4" /> Generate production plan</button>
            <button className="inline-flex items-center gap-2 rounded-lg border h-10 px-4 text-sm hover:bg-accent"><Wrench className="h-4 w-4" /> Schedule maintenance</button>
            <button className="inline-flex items-center gap-2 rounded-lg border h-10 px-4 text-sm hover:bg-accent"><Users className="h-4 w-4" /> Allocate manpower</button>
            <button className="inline-flex items-center gap-2 rounded-lg border h-10 px-4 text-sm hover:bg-accent"><Bell className="h-4 w-4" /> Create alert</button>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
