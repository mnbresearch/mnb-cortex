import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CommissionCalc } from "@/components/commission-calc";

export const dynamic = "force-dynamic";

export default function Commission() {
  return (
    <>
      <Topbar title="Sales Commission" subtitle="Design incentives that reward the right behaviour" />
      <PageShell><CommissionCalc /></PageShell>
    </>
  );
}
