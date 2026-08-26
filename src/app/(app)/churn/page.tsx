import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { ChurnPredictor } from "@/components/churn-predictor";
import { getCustomers, getSalesOrders } from "@/lib/data";

export const dynamic = "force-dynamic";

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const daysSince = (d: any) => {
  const t = new Date(d || 0).getTime();
  return Number.isFinite(t) && t > 0 ? Math.max(0, Math.round((Date.now() - t) / 86_400_000)) : 9999;
};

/** Roll each customer's won orders up into recency / frequency / value. */
async function customerHistory() {
  const [{ rows: custRows, live: custLive }, { rows: soRows, live: soLive }] =
    await Promise.all([getCustomers(), getSalesOrders()]);
  if (!custLive) return [];

  const orders = (soLive ? soRows : []).filter((o) => String(o.status || "").toLowerCase() === "won");
  const byName = new Map<string, { count: number; total: number; last: number }>();
  for (const o of orders) {
    const k = String(o.customer_name || "").trim().toLowerCase();
    if (!k) continue;
    const cur = byName.get(k) || { count: 0, total: 0, last: 0 };
    cur.count += 1;
    cur.total += n(o.amount);
    const t = new Date(o.order_date || o.created_at || 0).getTime();
    if (Number.isFinite(t) && t > cur.last) cur.last = t;
    byName.set(k, cur);
  }

  return (custRows || []).map((c) => {
    const h = byName.get(String(c.name || "").trim().toLowerCase());
    return {
      id: String(c.id),
      name: String(c.name || "Unnamed"),
      // Fall back to the customer's own recorded value when they have no orders
      // yet — better than scoring them as worthless.
      monetary: h ? h.total : n(c.value),
      frequency: h ? h.count : 0,
      recency: h && h.last ? daysSince(h.last) : daysSince(c.created_at),
    };
  });
}

export default async function Churn() {
  /*
    Tickets and sentiment are not data Cortex holds, so they start neutral and
    the owner adjusts them. Value and days-since-last-order ARE real, and they
    are what actually drives the risk score.
  */
  const seed = (await customerHistory())
    .sort((a, b) => b.monetary - a.monetary)
    .slice(0, 100)
    .map((c) => ({
      id: c.id,
      name: c.name,
      value: c.monetary,
      daysSince: c.recency === 9999 ? 0 : c.recency,
      tickets: 0,
      sentiment: "neutral" as const,
    }));

  return (
    <>
      <Topbar title="Customer Churn Predictor" subtitle="Spot the accounts about to leave — before they do" />
      <PageShell>
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
