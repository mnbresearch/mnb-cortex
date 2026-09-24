import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CashRunway } from "@/components/cash-runway";
import { getWorkspaceSeed } from "@/lib/workspace-seed";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/runway");

export default async function Runway() {
  const seed = await getWorkspaceSeed();
  return (
    <>
      <Topbar title="Cash Runway & Burn" subtitle="How long your cash lasts — and when to act" />
      <PageShell><CashRunway seed={seed} /></PageShell>
    </>
  );
}
