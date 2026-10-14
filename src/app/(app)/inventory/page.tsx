import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Stat } from "@/components/stat";
import { Section } from "@/components/section";
import { InsightCard } from "@/components/insight-card";
import { DataTable } from "@/components/data-table";
import { CollapsibleForm, Field, SelectField, ActionForm } from "@/components/forms";
import { getInsights, getInventory, getPurchaseOrders, getUserAndOrg, getTableStats } from "@/lib/data";
import { inr } from "@/lib/utils";
import { addInventoryItem, generatePO } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Inventory() {
  const [insights, inv, po, { orgId }, invStats, poStats] = await Promise.all([
    getInsights("inventory"), getInventory(), getPurchaseOrders(), getUserAndOrg(),
    /* KPIs over EVERY item and PO, not the 200-row list the tables show. */
    getTableStats("inventory_items", "id, sku, name, on_hand, reorder_level"),
    getTableStats("purchase_orders", "id, status"),
  ]);
  const signedIn = Boolean(orgId);
  const statsError = invStats.error || poStats.error || inv.error || po.error;

  // Computed from this workspace's own stock, not a fixture.
  const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const atRisk = invStats.rows.filter((i: any) => n(i.reorder_level) > 0 && n(i.on_hand) < n(i.reorder_level));
  /*
    "DEAD STOCK" AND "FAST MOVERS" ARE GONE FROM THE KPI ROW, NOT RELABELLED.

    Both read `inventory_items.movement`, which defaults to 'fast' in
    schema.sql and is written only by the demo seeder. So every real item was
    "fast-moving", "Fast movers" counted the whole catalogue, and dead stock
    was always ₹0 — a reassuring figure computed from a column default. There
    is no reliable sales-to-SKU link to derive movement from (sales_orders.product
    is free text), so the honest answer is to not show them, and to say why.
  */
  const openPOs = poStats.rows.filter((p: any) => ["draft", "sent", "approved"].includes(String(p.status || "").toLowerCase()));
  const riskNames = atRisk.slice(0, 3).map((i: any) => i.sku || i.name).filter(Boolean).join(", ");

  return (
    <>
      <Topbar title="Inventory Intelligence" subtitle="Predict stockouts before they happen" />
      <PageShell>
        {signedIn && statsError ? (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
            <b className="text-danger">Cortex couldn&rsquo;t read your inventory just now</b> ({statsError}). The figures and
            tables below may be incomplete or empty for that reason — reload to try again.
          </div>
        ) : null}
        {signedIn ? (
          <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Items at risk" value={`${atRisk.length} SKU${atRisk.length === 1 ? "" : "s"}`} hint={riskNames || "below reorder level"} tone={atRisk.length ? "text-danger" : undefined} />
            <Stat label="Items on file" value={`${invStats.rows.length}${invStats.truncated ? "+" : ""}`} hint={inv.truncated ? `table below shows the latest ${inv.rows.length}` : "all items"} />
            <Stat label="Open POs" value={`${openPOs.length}`} hint="draft, sent or approved" />
            <Stat label="Below reorder level" value={invStats.rows.length ? `${Math.round((atRisk.length / invStats.rows.length) * 100)}%` : "—"} hint="of all items" />
          </div>
          <p className="text-xs text-muted-foreground">
            Dead stock and fast movers aren&rsquo;t shown: Cortex doesn&rsquo;t record how fast each item sells, so it can&rsquo;t
            tell you which stock is dead — and a ₹0 there would be a guess, not a fact.
          </p>
          </>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Items at risk" value="2 SKUs" hint="sample data" tone="text-danger" />
            <Stat label="Dead stock" value="₹4.2 L" hint="sample data" tone="text-warning" />
            <Stat label="Fast movers" value="2 SKUs" hint="sample data" />
            <Stat label="Open POs" value="2" hint="sample data" />
          </div>
        )}

        <Section title="AI actions" desc="Cortex drafts a real purchase order for you to review">
          <div className="flex flex-wrap gap-2">
            {/* Was labelled "Generate PO for RM-204" for everyone. generatePO()
                now picks whichever of YOUR items is furthest below its reorder
                level, so the label can't name a SKU that isn't yours. */}
            {/* The "(AI)" came off. generatePO() ranks items by on_hand against
                reorder_level and orders back up to the level plus a fortnight of
                consumption — arithmetic, and better for being arithmetic, since
                a reorder quantity should be reproducible and not vary between
                runs. Calling it AI oversold a function that is more trustworthy
                than the label implied. */}
            <ActionForm action={generatePO} label="Draft a purchase order for my lowest stock" primary />
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
