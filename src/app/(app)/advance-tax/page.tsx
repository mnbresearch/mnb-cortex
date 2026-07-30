import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { AdvanceTax } from "@/components/advance-tax";

export const dynamic = "force-dynamic";

export default function AdvanceTaxPage() {
  return (
    <>
      <Topbar title="Advance Tax Planner" subtitle="Quarterly instalments and due dates" />
      <PageShell><AdvanceTax /></PageShell>
    </>
  );
}
