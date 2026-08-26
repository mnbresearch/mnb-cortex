import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { RfmSegments } from "@/components/rfm-segments";
import { getUserAndOrg } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";


const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const daysSince = (d: any) => {
  const t = new Date(d || 0).getTime();
  return Number.isFinite(t) && t > 0 ? Math.max(0, Math.round((Date.now() - t) / 86_400_000)) : null;
};

/**
 * Roll each customer's won orders into recency / frequency / value.
 *
 * Reads orders DIRECTLY rather than through getSalesOrders(), which caps at the
 * 200 most recent rows. Computing a customer's lifetime value from the last 200
 * orders of a 5,000-order business is not a smaller answer, it is a wrong one —
 * and it would have been presented as the customer's real book with no cap
 * shown anywhere.
 *
 * Matching is by name because sales_orders carries no customer foreign key.
 * That is a real limitation: two customers with the same name merge, and a
 * spelling variation scores a genuine customer at zero. Surfaced to the page as
 * `matched` so it can say so rather than quietly mis-segmenting somebody.
 */
async function customerHistory(): Promise<{ rows: CustomerHistoryRow[]; matched: number; unmatched: number; capped: boolean }> {
  const { orgId } = await getUserAndOrg();
  if (!orgId) return { rows: [], matched: 0, unmatched: 0, capped: false };

  const sb = createClient();
  const CAP = 20000;
  const [{ data: custData }, { data: orderData }] = await Promise.all([
    sb.from("customers").select("id,name,value,created_at").eq("org_id", orgId).limit(2000),
    sb.from("sales_orders").select("customer_name,amount,status,order_date,created_at")
      .eq("org_id", orgId).eq("status", "won").limit(CAP),
  ]);

  const customers = (custData as any[]) || [];
  const orders = (orderData as any[]) || [];

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

  let matched = 0;
  const rows = customers.map((c) => {
    const h = byName.get(String(c.name || "").trim().toLowerCase());
    if (h) matched++;
    return {
      id: String(c.id),
      name: String(c.name || "Unnamed"),
      // No orders found: fall back to the value recorded on the customer
      // record, which is at least something the owner typed deliberately.
      monetary: h ? h.total : n(c.value),
      frequency: h ? h.count : 0,
      // null means "we genuinely do not know", NOT "today" and NOT "never".
      recencyDays: h && h.last ? daysSince(h.last) : daysSince(c.created_at),
      hasOrders: Boolean(h),
    };
  });

  return { rows, matched, unmatched: customers.length - matched, capped: orders.length >= CAP };
}

type CustomerHistoryRow = {
  id: string; name: string; monetary: number; frequency: number;
  recencyDays: number | null; hasOrders: boolean;
};

export default async function Rfm() {
  // Segmented "Customer A / Nova Distributors / Zenith Wholesale" for everyone.
  // Now scores the workspace's own customers from their own won orders.
  const { rows: hist, unmatched, capped } = await customerHistory();
  const seed = hist
    .map((c) => ({
      id: c.id, name: c.name, monetary: c.monetary, frequency: c.frequency,
      // The scorer needs a number. 9999 means "no order on record", which is
      // correctly the WORST recency score rather than the best.
      recency: c.recencyDays ?? 9999,
    }))
    .sort((a, b) => b.monetary - a.monetary)
    .slice(0, 100);

  return (
    <>
      <Topbar title="Customer Segmentation (RFM)" subtitle="Know who to reward, who to win back, who to let go" />
      <PageShell>
        {(unmatched > 0 || capped) && (
          <Card className="p-3 text-xs text-muted-foreground">
            {unmatched > 0 && <>{unmatched} customer{unmatched === 1 ? " has" : "s have"} no matching orders — orders are matched to customers <b>by name</b>, so a spelling difference will score somebody at zero. </>}
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
