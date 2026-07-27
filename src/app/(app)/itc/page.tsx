import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ItcSetoff } from "@/components/itc-setoff";

export const dynamic = "force-dynamic";

export default function Itc() {
  return (
    <>
      <Topbar title="GST ITC Set-off" subtitle="Net cash payable after input-tax-credit set-off" />
      <PageShell><ItcSetoff /></PageShell>
    </>
  );
}
