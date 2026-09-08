import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { TdsCalc } from "@/components/tds-calc";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/tds");

export default function Tds() {
  return (
    <>
      <Topbar title="TDS Calculator" subtitle="Deduct the right tax at source, by section" />
      <PageShell><TdsCalc /></PageShell>
    </>
  );
}
