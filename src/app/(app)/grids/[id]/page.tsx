import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { GridEditor } from "@/components/grids";

export const dynamic = "force-dynamic";

export default function GridPage({ params }: { params: { id: string } }) {
  return (
    <>
      <Topbar title="Grid" subtitle="Rows are documents, columns are questions. Each cell is answered from its own document, with the quote that supports it." />
      <PageShell><GridEditor id={params.id} /></PageShell>
    </>
  );
}
