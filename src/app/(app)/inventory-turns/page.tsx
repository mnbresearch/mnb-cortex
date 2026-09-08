import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { InventoryTurns } from "@/components/inventory-turns";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/inventory-turns");

export default function InventoryTurnsPage() {
  return (
    <>
      <Topbar title="Inventory Turnover" subtitle="How fast stock moves and what holding it costs" />
      <PageShell><InventoryTurns /></PageShell>
    </>
  );
}
