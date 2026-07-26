import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { GstCalc } from "@/components/gst-calc";

export const dynamic = "force-dynamic";

export default function GstCalcPage() {
  return (
    <>
      <Topbar title="GST Calculator" subtitle="Add or strip GST, with the CGST/SGST/IGST split" />
      <PageShell><GstCalc /></PageShell>
    </>
  );
}
