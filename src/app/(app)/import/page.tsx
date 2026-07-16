import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CsvImport } from "@/components/csv-import";

export const dynamic = "force-dynamic";
export default function ImportPage() {
  return (
    <>
      <Topbar title="Import data" subtitle="Bring your real numbers in from CSV / Excel" />
      <PageShell>
        <CsvImport />
      </PageShell>
    </>
  );
}
