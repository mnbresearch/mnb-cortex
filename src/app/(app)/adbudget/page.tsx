import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { AdBudgetAllocator } from "@/components/adbudget-allocator";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/adbudget");

export default function AdBudget() {
  return (
    <>
      <Topbar title="Marketing Budget & ROAS" subtitle="Find your best channels and reallocate spend" />
      <PageShell><AdBudgetAllocator /></PageShell>
    </>
  );
}
