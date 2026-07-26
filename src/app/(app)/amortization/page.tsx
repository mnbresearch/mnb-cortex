import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Amortization } from "@/components/amortization";

export const dynamic = "force-dynamic";

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
