import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { InsightCard } from "@/components/insight-card";
import { TrendChart } from "@/components/charts/trend-chart";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field, SelectField, ActionForm } from "@/components/forms";
import { getInsights, getInvoices, getFinanceSeries } from "@/lib/data";
import { addInvoice, createInvoiceAI, sendReminderAI } from "@/lib/actions";

export const dynamic = "force-dynamic";
const pl = Array.from({ length: 12 }, (_, m) => ({ month: new Date(2025, m, 1).toLocaleString("en", { month: "short" }), revenue: 3.0 + m * 0.11, profit: 0.42 + m * 0.009 }));

export default async function Finance() {
  const insights = await getInsights("finance");
  const { rows, live } = await getInvoices();
  const fin = await getFinanceSeries();
  const chartData = fin.live && fin.series ? fin.series : pl;
  return (
    <>
      <Topbar title="Finance Intelligence" subtitle="Tally · Zoho Books · QuickBooks · GST · Bank" />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Net profit (MTD)" value="₹51.0 L" hint="-7% MoM" tone="text-warning" />
          <Stat label="Gross margin" value="31%" hint="-2 pts" tone="text-warning" />
          <Stat label="Cash runway" value="5 months" hint="watch" tone="text-warning" />
          <Stat label="EBITDA" value="₹62.0 L" hint="14.6% margin" />
        </div>
        <Section title="Revenue vs net profit" desc="Trailing 12 months (₹ Cr)">
          <TrendChart data={chartData} keys={[{ k: "revenue", label: "Revenue", color: "hsl(var(--primary))" }, { k: "profit", label: "Net profit", color: "hsl(var(--success))" }]} />
        </Section>

        <Section title="AI actions" desc="The COO executes — these write real records">
          <div className="flex flex-wrap gap-2">
            <ActionForm action={createInvoiceAI} label="Generate invoice (AI)" primary />
            <ActionForm action={sendReminderAI} label="Send payment reminders" />
          </div>
        </Section>

        <CollapsibleForm title="Add invoice" action={addInvoice}>
          <Field name="party" label="Party" required />
          <Field name="amount" label="Amount (₹)" type="number" />
          <Field name="due_date" label="Due date" type="date" />
          <SelectField name="type" label="Type" options={["receivable","payable"]} />
          <SelectField name="status" label="Status" options={["pending","paid","overdue"]} />
        </CollapsibleForm>
        <DataTable title="Invoices" rows={rows} live={live} table="invoices" path="/finance"
          cols={[{key:"invoice_no",label:"Invoice #"},{key:"party",label:"Party"},{key:"amount",label:"Amount",kind:"inr"},{key:"type",label:"Type"},{key:"status",label:"Status"},{key:"due_date",label:"Due",kind:"date"}]} />

        <div className="grid md:grid-cols-2 gap-3">{insights.map((i) => <InsightCard key={i.id} ins={i} />)}</div>
      </PageShell>
    </>
  );
}
