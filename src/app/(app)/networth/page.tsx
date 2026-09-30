import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { NetWorthBuilder } from "@/components/networth-builder";

import { getWorkspaceSeed } from "@/lib/workspace-seed";
import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/networth");

export default async function NetWorth() {
  const seed = await getWorkspaceSeed();
  return (
    <>
      <Topbar title="Net Worth & Balance Sheet" subtitle="What the business is worth after clearing every debt" />
      <PageShell><NetWorthBuilder seed={seed} /></PageShell>
    </>
  );
}
