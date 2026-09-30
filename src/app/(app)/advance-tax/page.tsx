import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { AdvanceTax } from "@/components/advance-tax";

import { getWorkspaceSeed } from "@/lib/workspace-seed";
import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/advance-tax");

export default async function AdvanceTaxPage() {
  const seed = await getWorkspaceSeed();
  return (
    <>
      <Topbar title="Advance Tax Planner" subtitle="Quarterly instalments and due dates" />
      <PageShell><AdvanceTax seed={seed} /></PageShell>
    </>
  );
}
