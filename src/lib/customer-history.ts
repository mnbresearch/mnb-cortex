import { getUserAndOrg } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { normalizeCustomerName, indexCustomers } from "@/lib/customer-match";

/**
 * Roll each customer's won orders into recency / frequency / value.
 *
 * SHARED because /rfm and /churn previously each carried their own verbatim
 * copy of this function. Two copies of a matching rule is two places for it to
 * be wrong, and it already was: both joined orders to customers on
 * `name.trim().toLowerCase()`, so "Acme Pvt. Ltd." and "Acme Private Limited"
 * were different customers, and two real customers sharing a name were one.
 *
 * Matching is now, in order of trust:
 *
 *   1. sales_orders.customer_id -- a real foreign key, set on write and
 *      backfilled by 2026_sales_order_customer_link.sql.
 *   2. Normalised name, for rows predating the link that were ambiguous at
 *      backfill time, via the same rule the migration used.
 *
 * Both are combined per customer, because a customer can easily have some
 * linked orders and some older unlinked ones.
 *
 * Reads orders DIRECTLY rather than through getSalesOrders(), which caps at the
 * 200 most recent rows. Computing lifetime value from the last 200 orders of a
 * 5,000-order business is not a smaller answer, it is a wrong one.
 */

const n = (v: any) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const daysSince = (d: any) => {
  const t = new Date(d || 0).getTime();
  return Number.isFinite(t) && t > 0 ? Math.max(0, Math.round((Date.now() - t) / 86_400_000)) : null;
};

export type CustomerHistoryRow = {
  id: string; name: string; monetary: number; frequency: number;
  recencyDays: number | null; hasOrders: boolean;
};

export type CustomerHistory = {
  rows: CustomerHistoryRow[];
  matched: number;
  unmatched: number;
  capped: boolean;
  /** Customers sharing a normalised name — their unlinked orders are NOT guessed at. */
  ambiguousNames: string[];
  /** Won orders that reached neither a foreign key nor an unambiguous name. */
  orphanOrders: number;
};

type Agg = { count: number; total: number; last: number };
const blank = (): Agg => ({ count: 0, total: 0, last: 0 });
function absorb(a: Agg, amount: any, when: any) {
  a.count += 1;
  a.total += n(amount);
  const t = new Date(when || 0).getTime();
  if (Number.isFinite(t) && t > a.last) a.last = t;
}

export async function getCustomerHistory(): Promise<CustomerHistory> {
  const { orgId } = await getUserAndOrg();
  const empty: CustomerHistory = { rows: [], matched: 0, unmatched: 0, capped: false, ambiguousNames: [], orphanOrders: 0 };
  if (!orgId) return empty;

  const sb = createClient();
  const CAP = 20000;

  /*
    DEPLOY ORDERING. This selects customer_id, which only exists after
    2026_sales_order_customer_link.sql has been applied. If the code ships
    before the migration runs, PostgREST rejects the whole select for an
    unknown column — and the natural `data || []` would then turn that into
    "nobody has any orders", i.e. every customer silently scored at zero and
    dumped into Lost. That is the exact failure this file exists to remove, so
    it must not be reintroduced by the deploy window itself.

    Fall back to the pre-migration shape and keep working on names alone.
  */
  const orderCols = "customer_id,customer_name,amount,status,order_date,created_at";
  const [{ data: custData }, ordersRes] = await Promise.all([
    sb.from("customers").select("id,name,value,created_at").eq("org_id", orgId).limit(2000),
    sb.from("sales_orders").select(orderCols).eq("org_id", orgId).eq("status", "won").limit(CAP),
  ]);

  let orderRows = (ordersRes.data as any[]) || [];
  if (ordersRes.error) {
    const legacy = await sb.from("sales_orders")
      .select("customer_name,amount,status,order_date,created_at")
      .eq("org_id", orgId).eq("status", "won").limit(CAP);
    orderRows = (legacy.data as any[]) || [];
    if (!legacy.error) {
      console.warn("[customer-history] sales_orders.customer_id is missing — apply 2026_sales_order_customer_link.sql. Matching by name only until then.");
    }
  }

  const customers = (custData as any[]) || [];
  const orders = orderRows;

  // Which normalised names are shared by more than one customer? Those cannot
  // be resolved by name, so their unlinked orders are left unattributed and
  // reported rather than folded into an arbitrary one of them.
  const byNorm = indexCustomers(customers.map((c) => ({ id: String(c.id), name: c.name })));
  const ambiguous = new Set<string>();
  for (const [key, ids] of byNorm) if (ids.length > 1) ambiguous.add(key);

  const byId = new Map<string, Agg>();
  const byName = new Map<string, Agg>();
  let orphanOrders = 0;

  for (const o of orders) {
    if (o.customer_id) {
      const id = String(o.customer_id);
      const a = byId.get(id) || blank();
      absorb(a, o.amount, o.order_date || o.created_at);
      byId.set(id, a);
      continue;
    }
    const key = normalizeCustomerName(o.customer_name);
    if (!key || ambiguous.has(key) || !byNorm.has(key)) { orphanOrders++; continue; }
    const a = byName.get(key) || blank();
    absorb(a, o.amount, o.order_date || o.created_at);
    byName.set(key, a);
  }

  let matched = 0;
  const rows: CustomerHistoryRow[] = customers.map((c) => {
    const key = normalizeCustomerName(c.name);
    const linked = byId.get(String(c.id));
    const named = key && !ambiguous.has(key) ? byName.get(key) : undefined;

    // A customer can hold both: newer orders carrying the foreign key and
    // older ones still matched by name.
    let h: Agg | undefined;
    if (linked && named) {
      h = { count: linked.count + named.count, total: linked.total + named.total, last: Math.max(linked.last, named.last) };
    } else h = linked || named;

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

  const ambiguousNames = customers
    .filter((c) => { const k = normalizeCustomerName(c.name); return k && ambiguous.has(k); })
    .map((c) => String(c.name || "Unnamed"));

  return {
    rows,
    matched,
    unmatched: customers.length - matched,
    capped: orders.length >= CAP,
    ambiguousNames: [...new Set(ambiguousNames)],
    orphanOrders,
  };
}
