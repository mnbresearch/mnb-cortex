import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { QuoteBuilder } from "@/components/quote-builder";
import { listQuotes } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Quote() {
  const saved = await listQuotes();
  return (
    <>
      <Topbar title="Quotation Builder" subtitle="Send a clean, printable quote with validity and terms" />
      <PageShell><QuoteBuilder saved={saved} /></PageShell>
    </>
  );
}
