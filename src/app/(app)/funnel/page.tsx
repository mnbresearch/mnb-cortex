import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { FunnelCalc } from "@/components/funnel-calc";
import { getWorkspaceSeed } from "@/lib/workspace-seed";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/funnel");

export default async function Funnel() {
  const seed = await getWorkspaceSeed();
  return (
    <>
      <Topbar title="Marketing Funnel" subtitle="Turn traffic into a revenue and CAC forecast" />
      <PageShell>
        <FunnelCalc seed={seed} />
      </PageShell>
    </>
  );
}
