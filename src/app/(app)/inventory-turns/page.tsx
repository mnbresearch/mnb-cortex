import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { InventoryTurns } from "@/components/inventory-turns";

export const dynamic = "force-dynamic";

export default function InventoryTurnsPage() {
  return (
    <>
      <Topbar title="Inventory Turnover" subtitle="How fast stock moves and what holding it costs" />
      <PageShell><InventoryTurns /></PageShell>
    </>
  );
}
