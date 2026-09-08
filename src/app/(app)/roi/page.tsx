import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { RoiPayback } from "@/components/roi-payback";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/roi");

export default function Roi() {
  return (
    <>
      <Topbar title="ROI & Payback" subtitle="Should you make this investment? Do the math first" />
      <PageShell>
        <RoiPayback />
      </PageShell>
    </>
  );
}
