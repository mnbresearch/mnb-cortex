import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { AbTestCalc } from "@/components/abtest-calc";

import { calcMetadata } from "@/lib/calculator-seo";

export const dynamic = "force-dynamic";
export const metadata = calcMetadata("/abtest");

export default function AbTest() {
  return (
    <>
      <Topbar title="A/B Test Significance" subtitle="Know when a result is real before you ship it" />
      <PageShell><AbTestCalc /></PageShell>
    </>
  );
}
