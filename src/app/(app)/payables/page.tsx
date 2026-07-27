import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { PayablesDpo } from "@/components/payables-dpo";

export const dynamic = "force-dynamic";

export default function Payables() {
  return (
    <>
      <Topbar title="Payables & DPO" subtitle="What you owe, how long you take, and when to pay early" />
      <PageShell><PayablesDpo /></PageShell>
    </>
  );
}
