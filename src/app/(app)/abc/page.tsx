import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { AbcAnalysis } from "@/components/abc-analysis";

export const dynamic = "force-dynamic";

export default function Abc() {
  return (
    <>
      <Topbar title="Inventory ABC Analysis" subtitle="Focus your control where the value is" />
      <PageShell>
        <AbcAnalysis />
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
