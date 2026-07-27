import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ReceivablesAging } from "@/components/receivables-aging";

export const dynamic = "force-dynamic";

export default function Receivables() {
  return (
    <>
      <Topbar title="Receivables & DSO" subtitle="Who owes you, how old it is, and who to chase first" />
      <PageShell><ReceivablesAging /></PageShell>
    </>
  );
}
