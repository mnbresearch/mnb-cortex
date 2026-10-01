import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { QuoteBuilder } from "@/components/quote-builder";
import { listQuotes } from "@/lib/actions";
import { getOrgProfile } from "@/lib/data";

export const dynamic = "force-dynamic";

/*
  THE "FROM" BLOCK WAS A PLACEHOLDER MASQUERADING AS A VALUE.

  It opened on `name: "Your Company Pvt Ltd"` and
  `detail: "GSTIN · Mumbai · contact@company.com"` — not as placeholder
  attributes, which vanish when you type, but as the input's actual VALUE.
  An owner who did not notice sent a customer a quotation headed "Your
  Company Pvt Ltd".

  The workspace has known the real company name since signup. It was simply
  never read here.
*/
export default async function Quote() {
  const [saved, org] = await Promise.all([listQuotes(), getOrgProfile()]);
  return (
    <>
      <Topbar title="Quotation Builder" subtitle="Send a clean, printable quote with validity and terms" />
      <PageShell><QuoteBuilder saved={saved} orgName={org?.name ?? null} /></PageShell>
    </>
  );
}
