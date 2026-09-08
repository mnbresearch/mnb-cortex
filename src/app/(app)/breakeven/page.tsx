import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { BreakevenMix } from "@/components/breakeven-mix";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/breakeven");

export default function Breakeven() {
  return (
    <>
      <Topbar title="Break-even (Product Mix)" subtitle="How many units across your range to cover fixed costs" />
      <PageShell><BreakevenMix /></PageShell>
    </>
  );
}
