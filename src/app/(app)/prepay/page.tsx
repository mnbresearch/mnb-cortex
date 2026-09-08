import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { PrepayInvest } from "@/components/prepay-invest";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/prepay");

export default function Prepay() {
  return (
    <>
      <Topbar title="Prepay vs Invest" subtitle="Clear the loan, or put the surplus to work?" />
      <PageShell><PrepayInvest /></PageShell>
    </>
  );
}
