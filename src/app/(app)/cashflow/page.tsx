import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { CashflowSimulator } from "@/components/cashflow-simulator";

export const dynamic = "force-dynamic";

export default function Cashflow() {
  return (
    <>
      <Topbar title="Cash Flow & Working Capital" subtitle="Free up the cash trapped inside your operations" />
      <PageShell>
        <CashflowSimulator />
        <Section title="Why the cash conversion cycle matters" desc="The single most useful cash metric for an SME">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Your cash conversion cycle (CCC) is how many days cash is locked up between paying for inputs and getting paid by customers: <b>DSO + DIO − DPO</b>. Every day you cut off it releases real cash you can use instead of borrowing.</p>
            <p>The two fastest levers for most SMEs: collect receivables faster (lower DSO) and negotiate longer supplier terms (higher DPO) — without breaking relationships.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
