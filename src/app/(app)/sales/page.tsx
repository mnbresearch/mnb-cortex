import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { InsightCard } from "@/components/insight-card";
import { SimpleBar } from "@/components/charts/bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field, SelectField } from "@/components/forms";
import { getInsights, getSalesOrders, getUserAndOrg } from "@/lib/data";
import { inr } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { addSalesOrder } from "@/lib/actions";
import { AIPanel } from "@/components/ai-panel";

export const dynamic = "force-dynamic";
// Illustrative only — rendered to logged-out visitors on the public preview.
// These were previously shown to every signed-in workspace as its own sales.
const region = [{ name: "West", value: 1.62 }, { name: "South", value: 1.18 }, { name: "North", value: 0.74 }, { name: "East", value: 0.41 }, { name: "Export", value: 0.30 }];
const product = [{ name: "Alpha-100", value: 1.4 }, { name: "Premium-X", value: 1.1 }, { name: "Beta-200", value: 0.9 }, { name: "Gamma-300", value: 0.6 }, { name: "Value-Tier", value: 0.25 }];
const funnel = Array.from({ length: 12 }, (_, m) => ({ month: new Date(2025, m, 1).toLocaleString("en", { month: "short" }), leads: 80 + m * 4, won: 18 + m }));

export default async function Sales() {
  const insights = await getInsights("sales");
  const { rows, live } = await getSalesOrders();
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);

  // Derived from this workspace's own orders — no fixtures.
  const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const won = rows.filter((r: any) => String(r.status || "").toLowerCase() === "won");
  const revenue = won.reduce((a: number, r: any) => a + n(r.amount), 0);
  const aov = won.length ? revenue / won.length : 0;
  const conversion = rows.length ? (won.length / rows.length) * 100 : 0;
  const byName = new Map<string, number>();
  for (const r of won) byName.set(String(r.customer_name || "—"), (byName.get(String(r.customer_name || "—")) || 0) + 1);
  const repeat = Array.from(byName.values()).filter((c) => c > 1).length;
  const repeatPct = byName.size ? (repeat / byName.size) * 100 : 0;

  const groupTop = (key: string) =>
    Array.from(
      won.reduce((m: Map<string, number>, r: any) => {
        const k = String(r[key] || "Unspecified");
        return m.set(k, (m.get(k) || 0) + n(r.amount));
      }, new Map<string, number>()),
    )
      .map(([name, value]) => ({ name, value: +(value / 1e7).toFixed(2) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

  const realRegion = groupTop("region");
  const realProduct = groupTop("product");

  return (
    <>
      <Topbar title="Sales Intelligence" subtitle="CRM · WhatsApp · Shopify · Zoho · ERP" />
      <PageShell>
        {signedIn ? (
          rows.length ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Won revenue" value={inr(revenue)} hint={`${won.length} won of ${rows.length} orders`} tone="text-success" />
                <Stat label="Win rate" value={`${conversion.toFixed(1)}%`} hint="won ÷ all orders" />
                <Stat label="Avg order value" value={inr(aov)} hint="across won orders" />
                <Stat label="Repeat customers" value={`${repeatPct.toFixed(0)}%`} hint={`${repeat} of ${byName.size} customers`} />
              </div>
              <div className="grid lg:grid-cols-2 gap-6">
                <Section title="Region-wise sales" desc="Your won orders (₹ Cr)">
                  {realRegion.length ? <SimpleBar data={realRegion} x="name" y="value" /> : <Card className="p-6 text-sm text-muted-foreground">No region set on your orders yet.</Card>}
                </Section>
                <Section title="Product-wise sales" desc="Your won orders (₹ Cr)">
                  {realProduct.length ? <SimpleBar data={realProduct} x="name" y="value" color="hsl(280 70% 60%)" /> : <Card className="p-6 text-sm text-muted-foreground">No product set on your orders yet.</Card>}
                </Section>
              </div>
            </>
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No sales orders yet. Add one below, import a CSV, or connect Shopify under Integrations — your figures appear here immediately.
            </Card>
          )
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Revenue (MTD)" value="₹4.25 Cr" hint="+12% MoM" tone="text-success" />
              <Stat label="Conversion rate" value="22.4%" hint="+1.8 pts" />
              <Stat label="Avg order value" value="₹2.31 L" hint="+5%" />
              <Stat label="Repeat customers" value="38%" hint="64 of 168" />
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <Section title="Region-wise sales" desc="Sample data (₹ Cr)"><SimpleBar data={region} x="name" y="value" /></Section>
              <Section title="Product-wise sales" desc="Sample data (₹ Cr)"><SimpleBar data={product} x="name" y="value" color="hsl(280 70% 60%)" /></Section>
            </div>
          </>
        )}
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

        <AIPanel mode="outreach" multiline placeholder="Describe the customer or deal to write outreach for..." cta="Draft outreach (WhatsApp + email)" />
        <div className="grid md:grid-cols-2 gap-3">{insights.map((i) => <InsightCard key={i.id} ins={i} />)}</div>
      </PageShell>
    </>
  );
}
