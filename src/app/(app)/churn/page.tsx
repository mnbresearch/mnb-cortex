import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { ChurnPredictor } from "@/components/churn-predictor";

export const dynamic = "force-dynamic";

export default function Churn() {
  return (
    <>
      <Topbar title="Customer Churn Predictor" subtitle="Spot the accounts about to leave — before they do" />
      <PageShell>
        <ChurnPredictor />
        <Section title="How the score works" desc="A transparent, editable model">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Churn risk blends recency (days since last order), support friction (open tickets), and sentiment. Edit any cell to run your own accounts — the table re-scores and re-ranks instantly, and totals the monthly revenue sitting in high-risk accounts.</p>
            <p>When you ask for a retention plan, Cortex writes a specific play for each at-risk account, prioritised by the revenue you'd lose.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
