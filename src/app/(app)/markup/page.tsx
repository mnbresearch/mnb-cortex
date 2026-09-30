import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { MarkupMargin } from "@/components/markup-margin";

import { getWorkspaceSeed } from "@/lib/workspace-seed";
import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/markup");

export default async function Markup() {
  const seed = await getWorkspaceSeed();
  return (
    <>
      <Topbar title="Markup ↔ Margin" subtitle="Price it right — the two numbers people always confuse" />
      <PageShell><MarkupMargin seed={seed} /></PageShell>
    </>
  );
}
