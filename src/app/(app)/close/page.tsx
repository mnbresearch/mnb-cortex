import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { MonthEndCloseCockpit } from "@/components/month-end-close";
import { getMonthEndCloseStatus } from "@/lib/actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Month-End Close & Variance Cockpit — MNB Cortex",
  description: "Autonomous continuous close, ledger balance verification, and GST/TDS statutory reconciliation.",
};

export default async function ClosePage() {
  const closeData = await getMonthEndCloseStatus();

  return (
    <>
      <Topbar
        title="Month-End Close & Variance Cockpit"
        subtitle="Continuous close, ledger reconciliation & automated variance analysis"
      />
      <PageShell>
        <MonthEndCloseCockpit
          initialPeriod={closeData.period}
          initialStatus={closeData.status}
          initialItems={closeData.items}
          closedAt={closeData.closed_at}
        />
      </PageShell>
    </>
  );
}
