import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { CurrencyConverter } from "@/components/currency-converter";

export const dynamic = "force-dynamic";

export default function Currency() {
  return (
    <>
      <Topbar title="Currency Converter" subtitle="Quick multi-currency conversion for quotes & invoices" />
      <PageShell><CurrencyConverter /></PageShell>
    </>
  );
}
