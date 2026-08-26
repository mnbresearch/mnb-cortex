import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { InsightCard } from "@/components/insight-card";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field, SelectField } from "@/components/forms";
import { getInsights, getEmployees } from "@/lib/data";
import { addEmployee } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function HR() {
  const insights = await getInsights("hr");
  const { rows, live } = await getEmployees();

  /*
    Only "Headcount" respected `live`. "Attrition 14%", "At-risk staff 3" and
    "Overtime 138 hrs" were literals, so a three-person workspace read
    "Headcount 3 · At-risk staff 3" — and a founder could reasonably conclude
    their whole team was about to quit. Everything is now derived from the
    employees table, and anything that cannot be derived says so.
  */
  const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const staff = live ? rows : [];
  const withRisk = staff.filter((e) => e.attrition_risk !== null && e.attrition_risk !== undefined);
  const avgRisk = withRisk.length ? withRisk.reduce((a, e) => a + n(e.attrition_risk), 0) / withRisk.length : null;
  const atRisk = withRisk.filter((e) => n(e.attrition_risk) >= 0.5);
  const atRiskStrong = atRisk.filter((e) => n(e.performance) >= 4).length;
  const withPerf = staff.filter((e) => e.performance !== null && e.performance !== undefined);
  const avgPerf = withPerf.length ? withPerf.reduce((a, e) => a + n(e.performance), 0) / withPerf.length : null;

  return (
    <>
      <Topbar title="HR Intelligence" subtitle="Attrition, performance, hiring" />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Headcount" value={live ? `${rows.length}` : "—"} hint={live ? "on record" : "sign in to see yours"} />
          <Stat
            label="Avg attrition risk"
            value={avgRisk === null ? "—" : `${(avgRisk * 100).toFixed(0)}%`}
            hint={avgRisk === null ? "not recorded yet" : `across ${withRisk.length} of ${staff.length}`}
            tone={avgRisk === null ? undefined : avgRisk >= 0.35 ? "text-danger" : avgRisk >= 0.2 ? "text-warning" : "text-success"}
          />
          <Stat
            label="At-risk staff"
            value={withRisk.length ? `${atRisk.length}` : "—"}
            hint={withRisk.length ? (atRiskStrong ? `${atRiskStrong} high performer${atRiskStrong === 1 ? "" : "s"}` : "risk ≥ 50%") : "not recorded yet"}
            tone={atRisk.length ? "text-danger" : undefined}
          />
          <Stat
            label="Avg performance"
            value={avgPerf === null ? "—" : `${avgPerf.toFixed(1)} / 5`}
            hint={avgPerf === null ? "not recorded yet" : `across ${withPerf.length} of ${staff.length}`}
            tone={avgPerf === null ? undefined : avgPerf >= 4 ? "text-success" : avgPerf >= 3 ? "text-warning" : "text-danger"}
          />
        </div>

        <CollapsibleForm title="Add employee" action={addEmployee}>
          <Field name="name" label="Name" required />
          <SelectField name="department" label="Department" options={["Production","Sales","Finance","Packing","HR"]} />
          <Field name="role" label="Role" />
          <Field name="monthly_ctc" label="Monthly CTC (₹)" type="number" />
          <Field name="performance" label="Performance (1-5)" type="number" />
        </CollapsibleForm>
        <DataTable title="Employees" rows={rows} live={live} table="employees" path="/hr"
          cols={[{key:"name",label:"Name"},{key:"department",label:"Dept"},{key:"role",label:"Role"},{key:"performance",label:"Perf"},{key:"attrition_risk",label:"Attrition risk"},{key:"monthly_ctc",label:"CTC",kind:"inr"}]} />

        <div className="grid md:grid-cols-2 gap-3">{insights.map((i) => <InsightCard key={i.id} ins={i} />)}</div>
      </PageShell>
    </>
  );
}
