import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { GstLateFee } from "@/components/gst-latefee";

export const dynamic = "force-dynamic";

export default function GstLateFeePage() {
  return (
    <>
      <Topbar title="GST Late Fee & Interest" subtitle="What a late GSTR-3B will actually cost you" />
      <PageShell><GstLateFee /></PageShell>
    </>
  );
}
