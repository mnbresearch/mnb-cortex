import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { DscrCalc } from "@/components/dscr-calc";

export const dynamic = "force-dynamic";

export default function Dscr() {
  return (
    <>
      <Topbar title="DSCR & Loan Eligibility" subtitle="Can the business service more debt — and how much?" />
      <PageShell><DscrCalc /></PageShell>
    </>
  );
}
