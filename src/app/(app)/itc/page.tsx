import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { ItcWorkspace } from "@/components/itc-workspace";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/itc");

export default function Itc() {
  return (
    <>
      <Topbar title="GST ITC Set-off & Reconciliation" subtitle="Rule 88A set-off, Section 16(2)(aa) verification, and Rule 37A supplier risk protection" />
      <PageShell><ItcWorkspace /></PageShell>
    </>
  );
}
