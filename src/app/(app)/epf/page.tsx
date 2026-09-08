import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { EpfCalc } from "@/components/epf-calc";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/epf");

export default function Epf() {
  return (
    <>
      <Topbar title="EPF & ESI Calculator" subtitle="Statutory PF, pension and ESI contributions" />
      <PageShell><EpfCalc /></PageShell>
    </>
  );
}
