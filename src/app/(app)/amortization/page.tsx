import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Amortization } from "@/components/amortization";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/amortization");

export default function AmortizationPage() {
  return (
    <>
      <Topbar title="Loan Amortization" subtitle="See exactly where every EMI rupee goes" />
      <PageShell>
        <Amortization />
      </PageShell>
    </>
  );
}
