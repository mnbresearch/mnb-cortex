import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { TdsWorkspace } from "@/components/tds-workspace";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/tds");

export default function Tds() {
  return (
    <>
      <Topbar title="TDS Calculator & Compliance" subtitle="Section withholding, Section 206AB non-filer rates, and Challan deposit rules" />
      <PageShell><TdsWorkspace /></PageShell>
    </>
  );
}
