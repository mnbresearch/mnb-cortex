import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { FunnelCalc } from "@/components/funnel-calc";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/funnel");

export default function Funnel() {
  return (
    <>
      <Topbar title="Marketing Funnel" subtitle="Turn traffic into a revenue and CAC forecast" />
      <PageShell>
        <FunnelCalc />
      </PageShell>
    </>
  );
}
