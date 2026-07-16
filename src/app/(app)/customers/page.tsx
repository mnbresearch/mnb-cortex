import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field, SelectField } from "@/components/forms";
import { getCustomers } from "@/lib/data";
import { leadScore } from "@/lib/utils";
import { addCustomer } from "@/lib/actions";

export const dynamic = "force-dynamic";
export default async function Customers() {
  const raw = await getCustomers();
  const live = raw.live;
  const rows = raw.rows.map((r: any) => ({ ...r, score: leadScore(r) })).sort((a: any, b: any) => b.score - a.score);
  const active = rows.filter((r) => r.status === "active").length;
  const pipeline = rows.reduce((a, r) => a + (Number(r.value) || 0), 0);
  return (
    <>
      <Topbar title="Customers" subtitle="Lightweight CRM — contacts, deals & last touch" />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Contacts" value={`${live ? rows.length : 0}`} />
          <Stat label="Active" value={`${active}`} tone="text-success" />
          <Stat label="Pipeline value" value={pipeline >= 1e5 ? `₹${(pipeline/1e5).toFixed(1)} L` : `₹${pipeline.toLocaleString("en-IN")}`} />
          <Stat label="Leads" value={`${rows.filter((r)=>r.status==="lead").length}`} />
        </div>
        <CollapsibleForm title="Add customer" action={addCustomer}>
          <Field name="name" label="Name" required />
          <Field name="company" label="Company" />
          <Field name="email" label="Email" />
          <Field name="phone" label="Phone" />
          <SelectField name="status" label="Status" options={["lead","active","churned"]} />
          <Field name="value" label="Deal value (₹)" type="number" />
        </CollapsibleForm>
        <DataTable title="Customers" rows={rows} live={live} table="customers" path="/customers"
          cols={[{key:"score",label:"AI score",kind:"score"},{key:"name",label:"Name"},{key:"company",label:"Company"},{key:"status",label:"Status"},{key:"value",label:"Value",kind:"inr"},{key:"email",label:"Email"},{key:"last_touch",label:"Last touch",kind:"date"}]} />
      </PageShell>
    </>
  );
}
