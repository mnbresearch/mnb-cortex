import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { RateCard } from "@/components/rate-card";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/rate-card");

export default function RateCardPage() {
  return (
    <>
      <Topbar title="Billable Rate Calculator" subtitle="The rate you must charge to hit your income" />
      <PageShell><RateCard /></PageShell>
    </>
  );
}
