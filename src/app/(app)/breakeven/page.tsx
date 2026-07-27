import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { BreakevenMix } from "@/components/breakeven-mix";

export const dynamic = "force-dynamic";

export default function Breakeven() {
  return (
    <>
      <Topbar title="Break-even (Product Mix)" subtitle="How many units across your range to cover fixed costs" />
      <PageShell><BreakevenMix /></PageShell>
    </>
  );
}
