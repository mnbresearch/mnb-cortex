import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { InsightCard } from "@/components/insight-card";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field, SelectField, ActionForm } from "@/components/forms";
import { getInsights, getInventory, getPurchaseOrders, getUserAndOrg } from "@/lib/data";
import { inr } from "@/lib/utils";
import { addInventoryItem, generatePO } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Inventory() {
  const insights = await getInsights("inventory");
  const inv = await getInventory();
  const po = await getPurchaseOrders();
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);

  // Computed from this workspace's own stock, not a fixture.
  const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const atRisk = inv.rows.filter((i: any) => n(i.reorder_level) > 0 && n(i.on_hand) < n(i.reorder_level));
  const dead = inv.rows.filter((i: any) => String(i.movement || "").toLowerCase() === "dead");
  const deadValue = dead.reduce((a: number, i: any) => a + n(i.on_hand) * n(i.unit_cost), 0);
  const fast = inv.rows.filter((i: any) => String(i.movement || "").toLowerCase() === "fast");
  const riskNames = atRisk.slice(0, 3).map((i: any) => i.sku || i.name).filter(Boolean).join(", ");

  return (
    <>
      <Topbar title="Inventory Intelligence" subtitle="Predict stockouts before they happen" />
      <PageShell>
        {signedIn ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Items at risk" value={`${atRisk.length} SKU${atRisk.length === 1 ? "" : "s"}`} hint={riskNames || "below reorder level"} tone={atRisk.length ? "text-danger" : undefined} />
            <Stat label="Dead stock" value={inr(deadValue)} hint={`${dead.length} SKU${dead.length === 1 ? "" : "s"} marked dead`} tone={deadValue > 0 ? "text-warning" : undefined} />
            <Stat label="Fast movers" value={`${fast.length} SKU${fast.length === 1 ? "" : "s"}`} hint="marked fast-moving" />
            <Stat label="Open POs" value={`${po.rows.length}`} hint="incl. AI-drafted" />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Items at risk" value="2 SKUs" hint="sample data" tone="text-danger" />
            <Stat label="Dead stock" value="₹4.2 L" hint="sample data" tone="text-warning" />
            <Stat label="Fast movers" value="2 SKUs" hint="sample data" />
            <Stat label="Open POs" value="2" hint="sample data" />
          </div>
        )}

        <Section title="AI actions" desc="The COO executes — drafts a real purchase order">
          <div className="flex flex-wrap gap-2">
            {/* Was labelled "Generate PO for RM-204" for everyone. generatePO()
                now picks whichever of YOUR items is furthest below its reorder
                level, so the label can't name a SKU that isn't yours. */}
            <ActionForm action={generatePO} label="Draft a purchase order for my lowest stock (AI)" primary />
          </div>
          {signedIn && !atRisk.length && (
            <p className="text-xs text-muted-foreground mt-2">Nothing is below its reorder level right now, so there's no PO to draft.</p>
          )}
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
