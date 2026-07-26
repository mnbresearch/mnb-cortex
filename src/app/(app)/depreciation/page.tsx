import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Depreciation } from "@/components/depreciation";

export const dynamic = "force-dynamic";

export default function DepreciationPage() {
  return (
    <>
      <Topbar title="Depreciation Schedule" subtitle="Plan the tax shield on your assets" />
      <PageShell><Depreciation /></PageShell>
    </>
  );
}
