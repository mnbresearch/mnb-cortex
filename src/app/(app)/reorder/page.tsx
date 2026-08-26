import { getUserAndOrg, getInventory } from "@/lib/data";
import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { ReorderOptimizer } from "@/components/reorder-optimizer";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

export default async function Reorder() {
  const { orgId } = await getUserAndOrg();
  const signedIn = Boolean(orgId);

  /*
    This page used to print a fixed red alarm — "RM-204 alert: current cover is
    ~9 days… (AI already drafted PO-4471)" — styled as a live system warning.
    A workspace with healthy stock saw a stockout alarm for a SKU it had never
    heard of, and a workspace with a genuine shortage saw the wrong item.

    generatePO() has always computed the truly-lowest item correctly. This page
    now uses the same rule, so the warning and the button agree.
  */
  const { rows, live } = await getInventory();
  const below = (live ? rows : [])
    .filter((i) => n(i.reorder_level) > 0 && n(i.on_hand) < n(i.reorder_level))
    .sort((a, b) => n(a.on_hand) / n(a.reorder_level) - n(b.on_hand) / n(b.reorder_level));

  const worst = below[0];
  const worstCover = worst && n(worst.daily_consumption) > 0
    ? n(worst.on_hand) / n(worst.daily_consumption)
    : null;

  return (
    <>
      <Topbar title="Inventory Reorder Optimizer" subtitle="Never stock out, never over-order" />
      <PageShell>
        {signedIn && below.length > 0 && (
          <Card className="p-4 border-danger/30 bg-danger/5">
            <div className="text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
              <span>
                <b className="text-danger">{[worst.sku, worst.name].filter(Boolean).join(" — ") || "An item"} is below its reorder level:</b>{" "}
                {n(worst.on_hand).toLocaleString("en-IN")} on hand against a reorder level of {n(worst.reorder_level).toLocaleString("en-IN")}
                {worstCover !== null && <> — about {worstCover.toFixed(1)} days of cover left</>}.
                {below.length > 1 && <> {below.length - 1} other item{below.length - 1 === 1 ? " is" : "s are"} also below level.</>}{" "}
                <Link href="/inventory" className="text-primary">Review inventory</Link> or use the optimizer below to size the order.
              </span>
            </div>
          </Card>
        )}
        {signedIn && live && below.length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground">
            {rows.length
              ? <>Every item with a reorder level set is currently above it. Nothing needs ordering right now.</>
              : <>No inventory recorded yet — <Link href="/inventory" className="text-primary">add items</Link> or <Link href="/import" className="text-primary">import them</Link> and this page will watch your real cover levels.</>}
          </Card>
        )}
        {signedIn && (
          <Card className="p-4 text-sm text-muted-foreground">
            The optimizer below is a calculator — change the inputs to model any item. The alert above is your live data.
          </Card>
        )}
        <ReorderOptimizer />
        <Section title="How to read this" desc="The two numbers that matter">
          <div className="text-sm text-muted-foreground space-y-2">
            <p><b>Economic order quantity (EOQ)</b> is the order size that minimises the combined cost of ordering and holding stock. <b>Reorder point</b> is the stock level that should trigger a new order, accounting for lead time and a safety buffer for demand swings.</p>
            <p>Raise the service level for critical inputs to build a bigger safety stock; lower it for cheap, fast-moving items to free up cash.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
