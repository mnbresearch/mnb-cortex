import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { RfmSegments } from "@/components/rfm-segments";
import { Card } from "@/components/ui/card";
import { getCustomerHistory } from "@/lib/customer-history";

export const dynamic = "force-dynamic";

export default async function Rfm() {
  // Segmented "Customer A / Nova Distributors / Zenith Wholesale" for everyone.
  // Now scores the workspace's own customers from their own won orders.
  const { rows: hist, unmatched, capped, ambiguousNames, orphanOrders } = await getCustomerHistory();
  /*
    ONLY CUSTOMERS WHO HAVE ORDERED ARE SEGMENTED.

    A customer with no orders used to take its recency from created_at (the
    day it was typed in) and its monetary from the customer record's `value`,
    so a contact added yesterday with a big deal value scored as a CHAMPION.
    No orders means no RFM — they are counted below as "No orders yet".

    Frequency and monetary are the TRAILING 12 MONTHS, because the table heads
    them per year; they used to be lifetime totals under a "/yr" label.
  */
  const noOrders = hist.filter((c) => !c.hasOrders).length;
  const seed = hist
    .filter((c) => c.hasOrders)
    .map((c) => ({
      id: c.id, name: c.name, monetary: c.monetary12m, frequency: c.frequency12m,
      // The scorer needs a number. 9999 means "order on record but undated",
      // which is correctly the WORST recency score rather than the best.
      recency: c.recencyDays ?? 9999,
    }))
    .sort((a, b) => b.monetary - a.monetary)
    .slice(0, 100);

  return (
    <>
      <Topbar title="Customer Segmentation (RFM)" subtitle="Know who to reward, who to win back, who to let go" />
      <PageShell>
        {ambiguousNames.length > 0 && (
          <Card className="p-3 text-xs">
            <b className="text-warning">Duplicate customer names.</b>{" "}
            {ambiguousNames.slice(0, 5).join(", ")}
            {ambiguousNames.length > 5 && ` and ${ambiguousNames.length - 5} more`}
            {" "}appear more than once in your customer list. Orders that aren&apos;t linked to a
            specific record are left <b>unscored</b> for these rather than guessed at, because
            crediting one customer with another&apos;s revenue would quietly change who you chase.
            Merge or rename the duplicates and they&apos;ll score normally.
          </Card>
        )}
        {(unmatched > 0 || capped || orphanOrders > 0) && (
          <Card className="p-3 text-xs text-muted-foreground">
            {unmatched > 0 && <><b>No orders yet:</b> {noOrders || unmatched} customer{(noOrders || unmatched) === 1 ? " has" : "s have"} no orders on record, so {(noOrders || unmatched) === 1 ? "it is" : "they are"} not segmented. </>}
            {orphanOrders > 0 && <>{orphanOrders} won order{orphanOrders === 1 ? "" : "s"} could not be attributed to a customer record. </>}
            {capped && <>Only the most recent 20,000 orders were scored.</>}
          </Card>
        )}
        <RfmSegments seed={seed} />
        <Section title="What RFM tells you" desc="Recency · Frequency · Monetary">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>RFM scores each customer on how <b>recently</b> they bought, how <b>often</b>, and how <b>much</b> — the three signals that best predict future value. It turns a flat customer list into clear action groups.</p>
            <p>Champions deserve loyalty perks; At-risk high-value accounts need a call this week; Lost customers rarely justify heavy spend. Focus your time where the RFM score says the money is.</p>
          </div>
        </Section>
      </PageShell>
    </>
  );
}
