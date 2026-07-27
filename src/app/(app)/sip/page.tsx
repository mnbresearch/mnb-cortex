import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { SipCalc } from "@/components/sip-calc";

export const dynamic = "force-dynamic";

export default function Sip() {
  return (
    <>
      <Topbar title="Investment Growth" subtitle="What consistent investing compounds into" />
      <PageShell><SipCalc /></PageShell>
    </>
  );
}
