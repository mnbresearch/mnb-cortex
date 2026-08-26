import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { InsightCard } from "@/components/insight-card";
import { SimpleBar } from "@/components/charts/bar-chart";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field } from "@/components/forms";
import { Card } from "@/components/ui/card";
import { getInsights, getProductionRuns, getUserAndOrg } from "@/lib/data";
import { addProductionRun } from "@/lib/actions";
import Link from "next/link";
import { Factory } from "lucide-react";

export const dynamic = "force-dynamic";

/*
  This page used to print "Avg OEE 77.5% · Reject rate 3.1% · Downtime 14.2 hrs
  · Yield 94.6%" as literals, and a four-machine OEE chart from a hardcoded
  array, to every workspace — including a services business that has no
  machines. The four "AI actions" buttons had no onClick handlers at all.

  All of it is now computed from `production_runs`, a table that has existed
  with exactly the right columns (oee, downtime_min, reject_qty, planned_qty,
  actual_qty) since the first schema and that nothing had ever read.
*/

const colorFor = (v: number) => (v >= 80 ? "hsl(142 71% 40%)" : v >= 70 ? "hsl(38 92% 50%)" : "hsl(0 72% 51%)");
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const one = (n: number) => n.toFixed(1);

export default async function Production() {
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);
  const insights = await getInsights("production");
  const { rows, live } = await getProductionRuns();

  const runs = rows || [];
  const has = live && runs.length > 0;

  // Only the last 30 runs, so a machine that was fixed months ago stops
  // dragging the average down for ever.
  const recent = runs.slice(0, 30);

  const withOee = recent.filter((r) => r.oee !== null && r.oee !== undefined);
  const avgOee = withOee.length ? withOee.reduce((a, r) => a + num(r.oee), 0) / withOee.length : null;

  const planned = recent.reduce((a, r) => a + num(r.planned_qty), 0);
  const actual = recent.reduce((a, r) => a + num(r.actual_qty), 0);
  const rejects = recent.reduce((a, r) => a + num(r.reject_qty), 0);
  const downtimeMin = recent.reduce((a, r) => a + num(r.downtime_min), 0);

  const rejectRate = actual + rejects > 0 ? (rejects / (actual + rejects)) * 100 : null;
  const yieldPct = planned > 0 ? (actual / planned) * 100 : null;

  // Average OEE per machine, so the bar chart describes real equipment.
  const byMachine = new Map<string, { sum: number; n: number }>();
  for (const r of withOee) {
    const k = String(r.machine || "Unnamed");
    const cur = byMachine.get(k) || { sum: 0, n: 0 };
    byMachine.set(k, { sum: cur.sum + num(r.oee), n: cur.n + 1 });
  }
  const oeeChart = [...byMachine.entries()]
    .map(([name, v]) => ({ name, value: +(v.sum / v.n).toFixed(1) }))
    .sort((a, b) => a.value - b.value)
    .map((d) => ({ ...d, fill: colorFor(d.value) }));

  return (
    <>
      <Topbar title="Production Intelligence" subtitle="OEE, downtime, rejects and yield from your own runs" />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Avg OEE"
            value={avgOee === null ? "—" : `${one(avgOee)}%`}
            hint={avgOee === null ? "no OEE recorded" : "last 30 runs · target 85%"}
            tone={avgOee === null ? undefined : avgOee >= 80 ? "text-success" : avgOee >= 70 ? "text-warning" : "text-danger"}
          />
          <Stat
            label="Reject rate"
            value={rejectRate === null ? "—" : `${one(rejectRate)}%`}
            hint={rejectRate === null ? "no quantities recorded" : `${rejects.toLocaleString("en-IN")} rejected`}
            tone={rejectRate === null ? undefined : rejectRate <= 2 ? "text-success" : rejectRate <= 5 ? "text-warning" : "text-danger"}
          />
          <Stat
            label="Downtime"
            value={has ? `${one(downtimeMin / 60)} hrs` : "—"}
            hint={has ? `across ${recent.length} run${recent.length === 1 ? "" : "s"}` : "no runs recorded"}
          />
          <Stat
            label="Yield"
            value={yieldPct === null ? "—" : `${one(yieldPct)}%`}
            hint={yieldPct === null ? "needs planned qty" : `${actual.toLocaleString("en-IN")} of ${planned.toLocaleString("en-IN")}`}
            tone={yieldPct === null ? undefined : yieldPct >= 95 ? "text-success" : yieldPct >= 85 ? "text-warning" : "text-danger"}
          />
        </div>

        {!has && (
          <Card className="p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/15 p-2 shrink-0"><Factory className="h-5 w-5 text-primary" /></div>
              <div>
                <h3 className="font-semibold tracking-tight">No production runs recorded yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                  {signedIn
                    ? <>Log a shift below, or bring your existing records in from a spreadsheet via <Link href="/import" className="text-primary">Import data</Link>. Cortex will then compute OEE, reject rate, downtime and yield from your own numbers — it will not estimate them for you.</>
                    : <>Sign in to record production runs and see OEE, rejects, downtime and yield from your own shop floor.</>}
                </p>
              </div>
            </div>
          </Card>
        )}

        {oeeChart.length > 0 && (
          <Section title="OEE by machine" desc="Average of recorded runs · Green ≥80 · Amber 70–80 · Red <70">
            <SimpleBar data={oeeChart} x="name" y="value" colorField="fill" />
          </Section>
        )}

        {signedIn && (
          <CollapsibleForm title="Log a production run" action={addProductionRun}>
            <Field name="machine" label="Machine" required />
            <Field name="shift" label="Shift" />
            <Field name="run_date" label="Date" type="date" />
            <Field name="planned_qty" label="Planned qty" type="number" />
            <Field name="actual_qty" label="Actual qty" type="number" />
            <Field name="reject_qty" label="Rejected qty" type="number" />
            <Field name="downtime_min" label="Downtime (minutes)" type="number" />
            <Field name="oee" label="OEE % (leave blank to compute)" type="number" />
          </CollapsibleForm>
        )}

        <DataTable
          title="Production runs" rows={runs} live={live} table="production_runs" path="/production"
          cols={[
            { key: "run_date", label: "Date" },
            { key: "machine", label: "Machine" },
            { key: "shift", label: "Shift" },
            { key: "planned_qty", label: "Planned" },
            { key: "actual_qty", label: "Actual" },
            { key: "reject_qty", label: "Rejects" },
            { key: "downtime_min", label: "Downtime (min)" },
            { key: "oee", label: "OEE %" },
          ]}
        />

        <div className="grid md:grid-cols-2 gap-3">{insights.map((i) => <InsightCard key={i.id} ins={i} />)}</div>
      </PageShell>
    </>
  );
}
