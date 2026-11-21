import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { GridsList } from "@/components/grids";

export const dynamic = "force-dynamic";

export default function GridsPage() {
  return (
    <>
      <Topbar title="Grids" subtitle="Ask the same questions across many documents at once — every answer quoted from its document and checked." />
      <PageShell><GridsList /></PageShell>
    </>
  );
}
