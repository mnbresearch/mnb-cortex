import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { DebtPlanner } from "@/components/debt-planner";

export const dynamic = "force-dynamic";

export default function Debt() {
  return (
    <>
      <Topbar title="Debt Payoff Planner" subtitle="The fastest, cheapest way out of your loans" />
      <PageShell><DebtPlanner /></PageShell>
    </>
  );
}
