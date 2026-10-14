import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field, SelectField } from "@/components/forms";
import { getCustomers, getTableStats } from "@/lib/data";
import { leadScore } from "@/lib/utils";
import { addCustomer } from "@/lib/actions";

export const dynamic = "force-dynamic";
export default async function Customers() {
  const [raw, all] = await Promise.all([getCustomers(), getTableStats("customers", "id, status, value")]);
  const live = raw.live;
  const rows = raw.rows.map((r: any) => ({ ...r, score: leadScore(r) })).sort((a: any, b: any) => b.score - a.score);
  /* The headline counts cover EVERY customer (paged), not the newest 200 the
     table lists — the header used to say "N records" over a 200-row slice. */
  const st = (r: any) => String(r.status || "").toLowerCase();
  const active = all.rows.filter((r) => st(r) === "active").length;
  const pipeline = all.rows.reduce((a, r) => a + (Number(r.value) || 0), 0);
  const readError = raw.error || all.error;
  return (
    <>
      <Topbar title="Customers" subtitle="Lightweight CRM — contacts, deals & last touch" />
      <PageShell>
        {readError ? (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
            <b className="text-danger">Cortex couldn&rsquo;t read your customers just now</b> ({readError}). An empty list below
            does not mean you have none — reload to try again.
          </div>
        ) : null}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Contacts" value={`${live ? all.rows.length : 0}${all.truncated ? "+" : ""}`} hint={raw.truncated ? `table shows the latest ${rows.length}` : undefined} />
          <Stat label="Active" value={`${active}`} tone="text-success" />
          <Stat label="Pipeline value" value={pipeline >= 1e5 ? `₹${(pipeline/1e5).toFixed(1)} L` : `₹${pipeline.toLocaleString("en-IN")}`} />
          <Stat label="Leads" value={`${all.rows.filter((r)=>st(r)==="lead").length}`} />
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
          cols={[{key:"score",label:"Score (rule-based)",kind:"score"},{key:"name",label:"Name",linkTo:"/customers"},{key:"company",label:"Company"},{key:"status",label:"Status"},{key:"value",label:"Value",kind:"inr"},{key:"email",label:"Email"},{key:"last_touch",label:"Last touch",kind:"date"}]} />
      </PageShell>
    </>
  );
}
