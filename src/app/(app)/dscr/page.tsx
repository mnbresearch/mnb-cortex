import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { DscrCalc } from "@/components/dscr-calc";

import { getWorkspaceSeed } from "@/lib/workspace-seed";
import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/dscr");

export default async function Dscr() {
  const seed = await getWorkspaceSeed();
  return (
    <>
      <Topbar title="DSCR & Loan Eligibility" subtitle="Can the business service more debt — and how much?" />
      <PageShell><DscrCalc seed={seed} /></PageShell>
    </>
  );
}
