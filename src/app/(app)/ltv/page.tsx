import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { LtvCalc } from "@/components/ltv-calc";
import { getWorkspaceSeed } from "@/lib/workspace-seed";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/ltv");

export default async function Ltv() {
  const seed = await getWorkspaceSeed();
  return (
    <>
      <Topbar title="Customer Lifetime Value" subtitle="What a customer is worth — and if acquisition pays back" />
      <PageShell><LtvCalc seed={seed} /></PageShell>
    </>
  );
}
