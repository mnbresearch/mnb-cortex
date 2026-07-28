import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CccCycle } from "@/components/ccc-cycle";

export const dynamic = "force-dynamic";

export default function Ccc() {
  return (
    <>
      <Topbar title="Cash Conversion Cycle" subtitle="How many days your cash is locked in operations" />
      <PageShell><CccCycle /></PageShell>
    </>
  );
}
