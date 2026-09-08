import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { MarkupMargin } from "@/components/markup-margin";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/markup");

export default function Markup() {
  return (
    <>
      <Topbar title="Markup ↔ Margin" subtitle="Price it right — the two numbers people always confuse" />
      <PageShell><MarkupMargin /></PageShell>
    </>
  );
}
