import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { EpfCalc } from "@/components/epf-calc";

export const dynamic = "force-dynamic";

export default function Epf() {
  return (
    <>
      <Topbar title="EPF & ESI Calculator" subtitle="Statutory PF, pension and ESI contributions" />
      <PageShell><EpfCalc /></PageShell>
    </>
  );
}
