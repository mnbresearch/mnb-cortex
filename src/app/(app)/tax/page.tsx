import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { TaxEstimator } from "@/components/tax-estimator";

export const dynamic = "force-dynamic";

export default function Tax() {
  return (
    <>
      <Topbar title="Income Tax Estimator" subtitle="New vs old regime — see which saves you more" />
      <PageShell><TaxEstimator /></PageShell>
    </>
  );
}
