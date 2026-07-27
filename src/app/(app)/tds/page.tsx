import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { TdsCalc } from "@/components/tds-calc";

export const dynamic = "force-dynamic";

export default function Tds() {
  return (
    <>
      <Topbar title="TDS Calculator" subtitle="Deduct the right tax at source, by section" />
      <PageShell><TdsCalc /></PageShell>
    </>
  );
}
