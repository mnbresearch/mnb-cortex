import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeCustomerName } from "@/lib/customer-match";
import { rScore, fScore, mScore, segmentOf, type SegmentName } from "@/lib/rfm";
import { listMemories } from "@/lib/memory";
import { istTodayISO } from "@/lib/statutory";
import { pageAll } from "@/lib/page-all";

/*
  CUSTOMER 360 — everything the workspace knows about one party, on one page.

  The product holds a customer in five places that never met: the customers
  row, sales_orders (by customer_id where it was resolved, by name where it
  was not), invoices (by party name — invoices carry no customer_id), the
  collections threads for those invoices, and memories tagged with the name.
  This joins them the way the rest of the product joins names: through
  normalizeCustomerName(), the same rule the importer and /rfm use, so a
  party that is "Acme Pvt. Ltd." on one invoice and "ACME PRIVATE LIMITED"
  on another is one customer here too.

  Reads with the session client under RLS; a table that is not migrated yet
  yields an empty section, never a broken page. Every number shown is a sum
  over rows the page also lists, so the reader can check it.
*/

export type Customer360 = {
  customer: { id: string; name: string; company: string | null; email: string | null; phone: string | null; status: string | null; value: number | null; last_touch: string | null; notes: string | null; created_at: string | null };
  orders: Array<{ id: string; order_no: string | null; amount: number; status: string | null; order_date: string | null; product: string | null }>;
  invoices: Array<{ id: string; invoice_no: string | null; amount: number; due_date: string | null; status: string | null; issue_date: string | null; daysOverdue: number }>;
  threads: Array<{ id: string; invoice_id: string; amount: number; status: string; attempts: number; last_sent_at: string | null; next_due_at: string | null }>;
  memories: Array<{ id: string; kind: string; title: string | null; content: string; created_at: string }>;
  doNotContact: boolean;
  totals: {
    lifetime: number;        // won orders
    orders: number;
    lastOrder: string | null;
    openReceivable: number;  // pending + overdue invoices
    overdue: number;
    oldestOverdueDays: number;
    firstSeen: string | null;
  };
  rfm: { segment: SegmentName; recencyDays: number | null; r: number; f: number; m: number } | null;
  /** How the rows were matched, so the page can say it. */
  matchedBy: { customerId: number; name: number };
  /** True when the workspace was too large to read completely — the page says so. */
  incomplete: boolean;
};

const dayDiff = (iso: string | null, today: string) => iso ? Math.round((Date.parse(today) - Date.parse(iso.slice(0, 10))) / 86_400_000) : 0;

export async function getCustomer360(orgId: string, customerId: string): Promise<Customer360 | null> {
  const sb = await createClient();
  const { data: c } = await sb.from("customers").select("*").eq("org_id", orgId).eq("id", customerId).maybeSingle();
  if (!c) return null;
  const norm = normalizeCustomerName((c as any).name) || normalizeCustomerName((c as any).company);
  const today = istTodayISO();

  /* Every row, paged — a .limit(2000) was silently capped at 1000 by PostgREST
     and the oldest invoices crowded out the open ones. */
  const [ordersRes, invoicesRes, policyRes] = await Promise.all([
    pageAll<any>((a, b) => sb.from("sales_orders").select("id, order_no, customer_id, customer_name, amount, status, order_date, product").eq("org_id", orgId).order("order_date", { ascending: false }).order("id").range(a, b)),
    pageAll<any>((a, b) => sb.from("invoices").select("id, invoice_no, party, amount, due_date, status, type, issue_date").eq("org_id", orgId).eq("type", "receivable").order("due_date", { ascending: true }).order("id").range(a, b)),
    sb.from("collection_policies").select("do_not_contact").eq("org_id", orgId).maybeSingle(),
  ]);

  const allOrders = ordersRes.rows;
  const byId = allOrders.filter((o) => o.customer_id === customerId);
  const byName = norm ? allOrders.filter((o) => o.customer_id !== customerId && normalizeCustomerName(o.customer_name) === norm) : [];
  const orders = [...byId, ...byName].map((o) => ({ id: o.id, order_no: o.order_no, amount: Number(o.amount) || 0, status: o.status, order_date: o.order_date, product: o.product }));

  const invoices = invoicesRes.rows
    .filter((i) => norm && normalizeCustomerName(i.party) === norm)
    .map((i) => {
      const open = String(i.status ?? "").trim().toLowerCase() !== "paid";
      const over = open && i.due_date ? Math.max(0, dayDiff(i.due_date, today)) : 0;
      return { id: i.id, invoice_no: i.invoice_no, amount: Number(i.amount) || 0, due_date: i.due_date, status: (String(i.status ?? "").trim().toLowerCase() || null), issue_date: i.issue_date, daysOverdue: over };
    });

  let threads: Customer360["threads"] = [];
  if (invoices.length) {
    try {
      const { data } = await sb.from("collection_threads").select("id, invoice_id, amount, status, attempts, last_sent_at, next_due_at")
        .eq("org_id", orgId).in("invoice_id", invoices.map((i) => i.id)).limit(200);
      threads = ((data as any[]) || []).map((t) => ({ ...t, amount: Number(t.amount) || 0 }));
    } catch { threads = []; }
  }

  const memories = (await listMemories(orgId, { entity: String((c as any).name || ""), limit: 10 })).map((m: any) => ({ id: m.id, kind: m.kind, title: m.title, content: String(m.content || ""), created_at: m.created_at }));

  const dnc = ((policyRes.data as any)?.do_not_contact as string[] | undefined) || [];
  const doNotContact = Boolean(norm) && dnc.some((p) => normalizeCustomerName(p) === norm);

  const won = orders.filter((o) => (o.status || "won") === "won");
  const lifetime = won.reduce((s, o) => s + o.amount, 0);
  const lastOrder = orders.map((o) => o.order_date).filter(Boolean).sort().reverse()[0] || null;
  const firstSeen = [...orders.map((o) => o.order_date), ...invoices.map((i) => i.issue_date), (c as any).created_at?.slice(0, 10)].filter(Boolean).sort()[0] || null;
  const open = invoices.filter((i) => String(i.status ?? "").trim().toLowerCase() !== "paid");
  const openReceivable = open.reduce((s, i) => s + i.amount, 0);
  const overdueRows = open.filter((i) => i.daysOverdue > 0);
  const overdue = overdueRows.reduce((s, i) => s + i.amount, 0);
  const oldestOverdueDays = overdueRows.reduce((m, i) => Math.max(m, i.daysOverdue), 0);

  let rfm: Customer360["rfm"] = null;
  if (won.length) {
    const recencyDays = lastOrder ? dayDiff(lastOrder, today) : null;
    const r = recencyDays === null ? 1 : rScore(recencyDays);
    const f = fScore(won.length);
    const m = mScore(lifetime);
    const value = Math.max(1, Math.min(5, Math.round((f + m) / 2)));
    rfm = { segment: segmentOf(r, value), recencyDays, r, f, m };
  }

  return {
    customer: {
      id: (c as any).id, name: (c as any).name, company: (c as any).company ?? null, email: (c as any).email ?? null, phone: (c as any).phone ?? null,
      status: (c as any).status ?? null, value: (c as any).value === null || (c as any).value === undefined ? null : Number((c as any).value),
      last_touch: (c as any).last_touch ?? null, notes: (c as any).notes ?? null, created_at: (c as any).created_at ?? null,
    },
    orders, invoices, threads, memories, doNotContact,
    totals: { lifetime, orders: won.length, lastOrder, openReceivable, overdue, oldestOverdueDays, firstSeen },
    rfm,
    matchedBy: { customerId: byId.length, name: byName.length + invoices.length },
    incomplete: ordersRes.truncated || invoicesRes.truncated,
  };
}
