import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { ReorderOptimizer } from "@/components/reorder-optimizer";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default function Reorder() {
  return (
    <>
      <Topbar title="Inventory Reorder Optimizer" subtitle="Never stock out, never over-order" />
      <PageShell>
        <Card className="p-4 border-danger/30 bg-danger/5">
          <div className="text-sm flex items-start gap-2"><AlertTriangle className="h-4 w-4 text-danger mt-0.5" /><span><b className="text-danger">RM-204 alert:</b> current cover is ~9 days vs a 12-day lead time — you're below the reorder point. Use the optimizer to size the order (AI already drafted PO-4471).</span></div>
        </Card>
        <ReorderOptimizer />
        <Section title="How to read this" desc="The two numbers that matter">
          <div className="text-sm text-muted-foreground space-y-2">
            <p><b>Economic order quantity (EOQ)</b> is the order size that minimises the combined cost of ordering and holding stock. <b>Reorder point</b> is the stock level that should trigger a new order, accounting for lead time and a safety buffer for demand swings.</p>
            <p>Raise the service level for critical inputs (like RM-204) to build a bigger safety stock; lower it for cheap, fast-moving items to free up cash.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
