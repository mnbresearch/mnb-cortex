import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { AdBudgetAllocator } from "@/components/adbudget-allocator";

export const dynamic = "force-dynamic";

export default function AdBudget() {
  return (
    <>
      <Topbar title="Marketing Budget & ROAS" subtitle="Find your best channels and reallocate spend" />
      <PageShell><AdBudgetAllocator /></PageShell>
    </>
  );
}
