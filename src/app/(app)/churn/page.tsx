import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { ChurnPredictor } from "@/components/churn-predictor";
import { Card } from "@/components/ui/card";
import { getCustomerHistory } from "@/lib/customer-history";

export const dynamic = "force-dynamic";

export default async function Churn() {
  /*
    Tickets and sentiment are not data Cortex holds, so they start neutral and
    the owner adjusts them. Value and days-since-last-order ARE real, and they
    are what actually drives the risk score.
  */
  const { rows: hist, unmatched, capped, ambiguousNames, orphanOrders } = await getCustomerHistory();
  const seed = hist
    .filter((c) => c.hasOrders)   // no orders means no churn signal to score
    .sort((a, b) => b.monetary - a.monetary)
    .slice(0, 100)
    .map((c) => ({
      id: c.id,
      name: c.name,
      value: c.monetary,
      // Unknown recency previously mapped to 0 — "ordered today", the LOWEST
      // risk value in the scorer. Exactly inverted. Anyone we cannot date is
      // treated as long-dormant instead.
      daysSince: c.recencyDays ?? 365,
      tickets: 0,
      sentiment: "neutral" as const,
    }));

  return (
    <>
      <Topbar title="Customer Churn Predictor" subtitle="Spot the accounts about to leave — before they do" />
      <PageShell>
        {ambiguousNames.length > 0 && (
          <Card className="p-3 text-xs">
            <b className="text-warning">Duplicate customer names.</b>{" "}
            {ambiguousNames.slice(0, 5).join(", ")}
            {ambiguousNames.length > 5 && ` and ${ambiguousNames.length - 5} more`}
            {" "}appear more than once in your customer list, so unlinked orders are left
            <b> unscored</b> for them rather than guessed at — crediting one customer with
            another&apos;s revenue would change who you call this week. Merge or rename them.
          </Card>
        )}
        {(unmatched > 0 || capped || orphanOrders > 0) && (
          <Card className="p-3 text-xs text-muted-foreground">
            {unmatched > 0 && <>{unmatched} customer{unmatched === 1 ? " is" : "s are"} not scored because they have no orders on record. </>}
            {orphanOrders > 0 && <>{orphanOrders} won order{orphanOrders === 1 ? "" : "s"} could not be attributed to a customer record. </>}
            {capped && <>Only the most recent 20,000 orders were scored.</>}
          </Card>
        )}
        <ChurnPredictor seed={seed} />
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
