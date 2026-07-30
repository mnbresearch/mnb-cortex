import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { GratuityCalc } from "@/components/gratuity-calc";

export const dynamic = "force-dynamic";

export default function Gratuity() {
  return (
    <>
      <Topbar title="Gratuity Calculator" subtitle="What an employee is owed under the Gratuity Act" />
      <PageShell><GratuityCalc /></PageShell>
    </>
  );
}
