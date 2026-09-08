import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { RentVsBuy } from "@/components/rent-vs-buy";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/rentvsbuy");

export default function RentVsBuyPage() {
  return (
    <>
      <Topbar title="Rent vs Buy" subtitle="Office or property — rent or own over your horizon" />
      <PageShell><RentVsBuy /></PageShell>
    </>
  );
}
