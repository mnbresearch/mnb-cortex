import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { InsightCard } from "@/components/insight-card";
import { SimpleBar } from "@/components/charts/bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field, SelectField } from "@/components/forms";
import { getInsights, getSalesOrders } from "@/lib/data";
import { addSalesOrder } from "@/lib/actions";

export const dynamic = "force-dynamic";
const region = [{ name: "West", value: 1.62 }, { name: "South", value: 1.18 }, { name: "North", value: 0.74 }, { name: "East", value: 0.41 }, { name: "Export", value: 0.30 }];
const product = [{ name: "Alpha-100", value: 1.4 }, { name: "Premium-X", value: 1.1 }, { name: "Beta-200", value: 0.9 }, { name: "Gamma-300", value: 0.6 }, { name: "Value-Tier", value: 0.25 }];
const funnel = Array.from({ length: 12 }, (_, m) => ({ month: new Date(2025, m, 1).toLocaleString("en", { month: "short" }), leads: 80 + m * 4, won: 18 + m }));

export default async function Sales() {
  const insights = await getInsights("sales");
  const { rows, live } = await getSalesOrders();
  return (
    <>
      <Topbar title="Sales Intelligence" subtitle="CRM · WhatsApp · Shopify · Zoho · ERP" />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Revenue (MTD)" value="₹4.25 Cr" hint="+12% MoM" tone="text-success" />
          <Stat label="Conversion rate" value="22.4%" hint="+1.8 pts" />
          <Stat label="Avg order value" value="₹2.31 L" hint="+5%" />
          <Stat label="Repeat customers" value="38%" hint="64 of 168" />
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Section title="Region-wise sales" desc="This month (₹ Cr)"><SimpleBar data={region} x="name" y="value" /></Section>
          <Section title="Product-wise sales" desc="This month (₹ Cr)"><SimpleBar data={product} x="name" y="value" color="hsl(280 70% 60%)" /></Section>
        </div>
        <Section title="Lead funnel vs wins" desc="Trailing 12 months">
          <TrendChart data={funnel} keys={[{ k: "leads", label: "Leads", color: "hsl(var(--primary))" }, { k: "won", label: "Won", color: "hsl(var(--success))" }]} />
        </Section>

        <CollapsibleForm title="Add sales order" action={addSalesOrder}>
          <Field name="customer_name" label="Customer" required />
          <Field name="product" label="Product" />
          <Field name="amount" label="Amount (₹)" type="number" />
          <SelectField name="region" label="Region" options={["West","South","North","East","Export"]} />
          <SelectField name="status" label="Status" options={["won","open","lost"]} />
        </CollapsibleForm>
        <DataTable title="Sales orders" rows={rows} live={live} table="sales_orders" path="/sales"
          cols={[{key:"order_no",label:"Order #"},{key:"customer_name",label:"Customer"},{key:"region",label:"Region"},{key:"product",label:"Product"},{key:"amount",label:"Amount",kind:"inr"},{key:"status",label:"Status"},{key:"order_date",label:"Date",kind:"date"}]} />

        <div className="grid md:grid-cols-2 gap-3">{insights.map((i) => <InsightCard key={i.id} ins={i} />)}</div>
      </PageShell>
    </>
  );
}
