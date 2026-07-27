import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { MarkupMargin } from "@/components/markup-margin";

export const dynamic = "force-dynamic";

export default function Markup() {
  return (
    <>
      <Topbar title="Markup ↔ Margin" subtitle="Price it right — the two numbers people always confuse" />
      <PageShell><MarkupMargin /></PageShell>
    </>
  );
}
