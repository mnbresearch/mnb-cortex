import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CccCycle } from "@/components/ccc-cycle";
import { getWorkspaceSeed } from "@/lib/workspace-seed";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/ccc");

export default async function Ccc() {
  const seed = await getWorkspaceSeed();
  return (
    <>
      <Topbar title="Cash Conversion Cycle" subtitle="How many days your cash is locked in operations" />
      <PageShell><CccCycle seed={seed} /></PageShell>
    </>
  );
}
