import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CouncilChamber } from "@/components/council-chamber";
import { getBusinessContext } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CouncilPage() {
  const context = await getBusinessContext().catch(() => "");

  return (
    <>
      <Topbar
        title="Executive Council Chamber"
        subtitle="Autonomous multi-agent C-Suite counsel — Fractional CFO, COO, CRO & Statutory Counsel"
      />
      <PageShell>
        <CouncilChamber initialContext={context} />
      </PageShell>
    </>
  );
}
