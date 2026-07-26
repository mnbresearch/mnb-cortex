import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { AbTestCalc } from "@/components/abtest-calc";

export const dynamic = "force-dynamic";

export default function AbTest() {
  return (
    <>
      <Topbar title="A/B Test Significance" subtitle="Know when a result is real before you ship it" />
      <PageShell><AbTestCalc /></PageShell>
    </>
  );
}
