import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ItcSetoff } from "@/components/itc-setoff";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/itc");

export default function Itc() {
  return (
    <>
      <Topbar title="GST ITC Set-off" subtitle="Net cash payable after input-tax-credit set-off" />
      <PageShell><ItcSetoff /></PageShell>
    </>
  );
}
