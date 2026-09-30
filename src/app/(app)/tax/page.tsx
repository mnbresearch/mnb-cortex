import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { TaxEstimator } from "@/components/tax-estimator";

import { getWorkspaceSeed } from "@/lib/workspace-seed";
import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/tax");

export default async function Tax() {
  const seed = await getWorkspaceSeed();
  return (
    <>
      <Topbar title="Income Tax Estimator" subtitle="New vs old regime — see which saves you more" />
      <PageShell><TaxEstimator seed={seed} /></PageShell>
    </>
  );
}
