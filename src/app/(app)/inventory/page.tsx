import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { InsightCard } from "@/components/insight-card";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field, SelectField, ActionForm } from "@/components/forms";
import { getInsights, getInventory, getPurchaseOrders } from "@/lib/data";
import { addInventoryItem, generatePO } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Inventory() {
  const insights = await getInsights("inventory");
  const inv = await getInventory();
  const po = await getPurchaseOrders();
  return (
    <>
      <Topbar title="Inventory Intelligence" subtitle="Predict stockouts before they happen" />
      <PageShell>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Items at risk" value="2 SKUs" hint="RM-204, Value-Tier" tone="text-danger" />
          <Stat label="Dead stock" value="₹4.2 L" hint="Legacy SKU" tone="text-warning" />
          <Stat label="Fast movers" value="2 SKUs" hint="reorder soon" />
          <Stat label="Open POs" value={`${po.live ? po.rows.length : 2}`} hint="incl. AI-drafted" />
        </div>

        <Section title="AI actions" desc="The COO executes — drafts a real purchase order">
          <div className="flex flex-wrap gap-2">
            <ActionForm action={generatePO} label="Generate PO for RM-204 (AI)" primary />
          </div>
        </Section>

        <CollapsibleForm title="Add inventory item" action={addInventoryItem}>
          <Field name="sku" label="SKU" required />
          <Field name="name" label="Name" />
          <SelectField name="category" label="Category" options={["raw","wip","finished"]} />
          <Field name="on_hand" label="On hand" type="number" />
          <Field name="reorder_level" label="Reorder level" type="number" />
          <Field name="unit_cost" label="Unit cost (₹)" type="number" />
          <Field name="supplier" label="Supplier" />
        </CollapsibleForm>
        <DataTable title="Inventory items" rows={inv.rows} live={inv.live} table="inventory_items" path="/inventory"
          cols={[{key:"sku",label:"SKU"},{key:"name",label:"Name"},{key:"category",label:"Category"},{key:"on_hand",label:"On hand"},{key:"reorder_level",label:"Reorder"},{key:"unit_cost",label:"Unit cost",kind:"inr"},{key:"supplier",label:"Supplier"}]} />
        <DataTable title="Purchase orders" rows={po.rows} live={po.live} table="purchase_orders" path="/inventory"
          cols={[{key:"po_no",label:"PO #"},{key:"supplier",label:"Supplier"},{key:"item",label:"Item"},{key:"qty",label:"Qty"},{key:"amount",label:"Amount",kind:"inr"},{key:"status",label:"Status"}]} />

        <div className="grid md:grid-cols-2 gap-3">{insights.map((i) => <InsightCard key={i.id} ins={i} />)}</div>
      </PageShell>
    </>
  );
}
