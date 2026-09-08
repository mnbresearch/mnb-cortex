import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { GratuityCalc } from "@/components/gratuity-calc";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/gratuity");

export default function Gratuity() {
  return (
    <>
      <Topbar title="Gratuity Calculator" subtitle="What an employee is owed under the Gratuity Act" />
      <PageShell><GratuityCalc /></PageShell>
    </>
  );
}
