import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { DebtPlanner } from "@/components/debt-planner";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/debt");

export default function Debt() {
  return (
    <>
      <Topbar title="Debt Payoff Planner" subtitle="The fastest, cheapest way out of your loans" />
      <PageShell><DebtPlanner /></PageShell>
    </>
  );
}
