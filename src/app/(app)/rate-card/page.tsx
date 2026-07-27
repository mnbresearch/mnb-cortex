import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { RateCard } from "@/components/rate-card";

export const dynamic = "force-dynamic";

export default function RateCardPage() {
  return (
    <>
      <Topbar title="Billable Rate Calculator" subtitle="The rate you must charge to hit your income" />
      <PageShell><RateCard /></PageShell>
    </>
  );
}
