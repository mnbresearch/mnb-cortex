import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { BuyVsLease } from "@/components/buy-vs-lease";

export const dynamic = "force-dynamic";

export default function BuyVsLeasePage() {
  return (
    <>
      <Topbar title="Buy vs Lease" subtitle="Present-value comparison for any big asset decision" />
      <PageShell><BuyVsLease /></PageShell>
    </>
  );
}
