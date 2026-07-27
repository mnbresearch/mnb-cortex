import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CashRunway } from "@/components/cash-runway";

export const dynamic = "force-dynamic";

export default function Runway() {
  return (
    <>
      <Topbar title="Cash Runway & Burn" subtitle="How long your cash lasts — and when to act" />
      <PageShell><CashRunway /></PageShell>
    </>
  );
}
