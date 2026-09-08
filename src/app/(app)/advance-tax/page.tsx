import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { AdvanceTax } from "@/components/advance-tax";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/advance-tax");

export default function AdvanceTaxPage() {
  return (
    <>
      <Topbar title="Advance Tax Planner" subtitle="Quarterly instalments and due dates" />
      <PageShell><AdvanceTax /></PageShell>
    </>
  );
}
