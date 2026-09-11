import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CsvImport } from "@/components/csv-import";

export const dynamic = "force-dynamic";

/**
 * Import — the first thing a paying customer does.
 *
 * `?table=invoices` preselects the dataset. That URL shape was already cited as
 * real in lib/paywall.ts and in links from other modules, and did nothing: this
 * page never read searchParams and CsvImport took no props. So every "import
 * your invoices" link in the product dropped the owner on a screen still set to
 * whatever the default was, which is the whole class of bug that made invoices
 * end up in sales_orders.
 */
export default function ImportPage({
  searchParams,
}: {
  searchParams?: { table?: string };
}) {
  return (
    <>
      {/*
        The subtitle no longer offers Excel. The file picker is .csv-only and
        there is no XLSX parser in the bundle, so an owner who clicked "Choose
        CSV" looking for the workbook this line promised could not even see it
        in the dialog.
      */}
      <Topbar title="Import data" subtitle="Bring your real numbers in — CSV, or a Tally, Vyapar or Busy export" />
      <PageShell>
        <CsvImport initialTable={searchParams?.table} />
      </PageShell>
    </>
  );
}
