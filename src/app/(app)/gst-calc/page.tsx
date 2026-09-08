import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { GstCalc } from "@/components/gst-calc";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/gst-calc");

export default function GstCalcPage() {
  return (
    <>
      <Topbar title="GST Calculator" subtitle="Add or strip GST, with the CGST/SGST/IGST split" />
      <PageShell><GstCalc /></PageShell>
    </>
  );
}
