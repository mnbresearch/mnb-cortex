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
  return (
    <>
      <Topbar title="HR Intelligence" subtitle="Attrition, performance, hiring" />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Headcount" value={`${live ? rows.length : 86}`} hint="active employees" />
          <Stat label="Attrition (TTM)" value="14%" hint="industry 18%" tone="text-success" />
          <Stat label="At-risk staff" value="3" hint="2 high performers" tone="text-danger" />
          <Stat label="Overtime (wk)" value="138 hrs" hint="Packing heavy" tone="text-warning" />
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
