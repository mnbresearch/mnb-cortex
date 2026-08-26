import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AbcAnalysis } from "@/components/abc-analysis";
import { getInventory } from "@/lib/data";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

export default async function Abc() {
  // Classing "Product A / Product B / Bulk-B2B" by value told the customer
  // nothing about their own stock. Value = on_hand x unit_cost, the same basis
  // metrics.ts uses for stockValue.
  const { rows, live } = await getInventory();
  const seed = (live ? rows : [])
    .map((i) => ({ id: String(i.id), name: String(i.sku || i.name || "Item"), value: n(i.on_hand) * n(i.unit_cost) }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 100);

  return (
    <>
      <Topbar title="Inventory ABC Analysis" subtitle="Focus your control where the value is" />
      <PageShell>
        <AbcAnalysis seed={seed} />
        <Section title="The 80/20 of inventory" desc="Not all SKUs deserve equal attention">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>A small set of items usually drives most of your inventory value. Class A gets tight forecasting, safety stock and your best supplier terms; Class C runs on autopilot or gets pruned.</p>
            <p>Managing every SKU the same way wastes working capital on the trivial many while under-protecting the vital few.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
