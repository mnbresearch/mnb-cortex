import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { ValuationCalculator } from "@/components/valuation-calculator";

export const dynamic = "force-dynamic";

export default function Valuation() {
  return (
    <>
      <Topbar title="Business Valuation" subtitle="What the business is plausibly worth — and how to raise it" />
      <PageShell>
        <ValuationCalculator />
        <Section title="What actually moves an SME valuation" desc="Beyond the multiple">
          <div className="text-sm text-muted-foreground space-y-2">
            <p><b>Owner dependence</b> is the biggest discount in Indian SME deals. If the business can't run for a month without you, buyers price that risk in heavily.</p>
            <p><b>Customer concentration</b> follows close behind — one client at 40% of revenue can cut the multiple significantly.</p>
            <p><b>Clean, provable books</b> raise the multiple on their own. Earnings a buyer's diligence can verify are worth more than earnings you have to explain.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
