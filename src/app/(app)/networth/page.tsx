import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { NetWorthBuilder } from "@/components/networth-builder";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/networth");

export default function NetWorth() {
  return (
    <>
      <Topbar title="Net Worth & Balance Sheet" subtitle="What the business is worth after clearing every debt" />
      <PageShell><NetWorthBuilder /></PageShell>
    </>
  );
}
