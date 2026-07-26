import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { FunnelCalc } from "@/components/funnel-calc";

export const dynamic = "force-dynamic";

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
