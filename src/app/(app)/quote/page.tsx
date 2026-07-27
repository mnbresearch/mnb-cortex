import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { QuoteBuilder } from "@/components/quote-builder";

export const dynamic = "force-dynamic";

export default function Quote() {
  return (
    <>
      <Topbar title="Quotation Builder" subtitle="Send a clean, printable quote with validity and terms" />
      <PageShell><QuoteBuilder /></PageShell>
    </>
  );
}
