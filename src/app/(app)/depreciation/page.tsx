import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Depreciation } from "@/components/depreciation";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/depreciation");

export default function DepreciationPage() {
  return (
    <>
      <Topbar title="Depreciation Schedule" subtitle="Plan the tax shield on your assets" />
      <PageShell><Depreciation /></PageShell>
    </>
  );
}
