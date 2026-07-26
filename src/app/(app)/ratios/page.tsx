import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { FinancialRatios } from "@/components/financial-ratios";

export const dynamic = "force-dynamic";

export default function Ratios() {
  return (
    <>
      <Topbar title="Financial Ratios" subtitle="The numbers a banker or investor checks first" />
      <PageShell>
        <FinancialRatios />
        <Section title="What each group tells you" desc="Liquidity · Leverage · Returns">
          <div className="text-sm text-muted-foreground space-y-2">
            <p><b>Liquidity</b> shows whether you can pay short-term bills. <b>Leverage</b> shows how much debt risk you carry and whether profits cover the interest. <b>Returns</b> show how efficiently you turn assets and equity into profit.</p>
            <p>A lender looks at interest coverage and debt/equity first; an investor looks at ROE and margins. This page shows both in one glance.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
