import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { SipCalc } from "@/components/sip-calc";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/sip");

export default function Sip() {
  return (
    <>
      <Topbar title="Investment Growth" subtitle="What consistent investing compounds into" />
      <PageShell><SipCalc /></PageShell>
    </>
  );
}
