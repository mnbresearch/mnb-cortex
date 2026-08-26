import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { RfmSegments } from "@/components/rfm-segments";
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

export default async function Rfm() {
  // Segmented "Customer A / Nova Distributors / Zenith Wholesale" for everyone.
  // Now scores the workspace's own customers from their own won orders.
  const seed = (await customerHistory()).sort((a, b) => b.monetary - a.monetary).slice(0, 100);

  return (
    <>
      <Topbar title="Customer Segmentation (RFM)" subtitle="Know who to reward, who to win back, who to let go" />
      <PageShell>
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
