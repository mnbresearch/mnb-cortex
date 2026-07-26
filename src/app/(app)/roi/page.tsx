import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { RoiPayback } from "@/components/roi-payback";

export const dynamic = "force-dynamic";

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
