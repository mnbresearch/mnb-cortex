import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Let the AI read the workspace's actual rows.
 *
 * WHAT IT COULD SEE BEFORE.
 *
 * `getBusinessContext()` returns roughly fifteen lines — `label: value (delta%,
 * status)` — plus a few recalled memories. That is enough to answer "how is my
 * business?" and nothing else. Ask "which five customers owe me the most and
 * who should I chase first?" and the model could not answer, even though
 * /receivables computes exactly that, server-side, on the next page over.
 *
 * So the headline feature of an "AI COO" was the least-informed component in
 * the product. It could describe the summary it had been handed; it could not
 * look anything up.
 *
 * WHY NAMED TOOLS AND NOT SQL.
 *
 * The obvious implementation is to let the model write SQL. That is a bad
 * trade here: the model is reading a multi-tenant financial database, and a
 * generated query is one missing `where org_id =` away from showing one
 * customer another customer's receivables. There is no prompt strong enough to
 * make that safe.
 *
 * Every tool below is a fixed query. `orgId` comes from the SESSION and is
 * applied by this file — never from the model, never from its arguments. The
 * model chooses which question to ask and with what limit; it cannot choose
 * whose data to ask about. Arguments are clamped, and the row cap is hard.
 *
 * Everything is SELECT. There is no tool that writes, and adding one should be
 * a deliberate decision with its own review, not a convenience.
 */

/** Hard ceiling on rows returned to the model, whatever it asks for. */
const MAX_ROWS = 25;

const clampLimit = (n: any, fallback = 5) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), MAX_ROWS);
};

const days = (from: string | null | undefined): number | null => {
  if (!from) return null;
  const t = new Date(from).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((Date.now() - t) / 86_400_000);
};

/**
 * Gemini function declarations.
 *
 * Descriptions are written for the MODEL, not for us: they say when to reach
 * for the tool, because a vague description is how a model answers a
 * receivables question out of the KPI summary instead of looking it up.
 */
export const TOOL_DECLARATIONS = [
  {
    name: "top_receivables",
    description:
      "Who owes this business money right now, largest first, with how many days past due each invoice is. "
      + "Use for any question about money owed to the business, collections, chasing customers, DSO, or 'who should I follow up with'.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "How many invoices to return (1-25, default 5)." },
        only_overdue: { type: "boolean", description: "If true, return only invoices already past their due date." },
      },
    },
  },
  {
    name: "top_payables",
    description:
      "Who this business owes money to, largest first, with days outstanding. "
      + "Use for questions about supplier payments, what is due, cash going out, or MSME 45-day exposure.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many to return (1-25, default 5)." } },
    },
  },
  {
    name: "top_customers",
    description:
      "The biggest customers by total order value, largest first, with order counts and when they last bought. "
      + "Use for questions about best customers, concentration risk, who to retain, or who has gone quiet.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many customers (1-25, default 5)." } },
    },
  },
  {
    name: "recent_orders",
    description: "The most recent sales orders with customer, product, amount and status. Use for questions about recent sales activity or specific recent deals.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many orders (1-25, default 10)." } },
    },
  },
  {
    name: "low_stock",
    description:
      "Inventory items at or below their reorder level, with quantity on hand and supplier. "
      + "Use for questions about stockouts, what to reorder, or purchasing priorities.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many items (1-25, default 10)." } },
    },
  },
  {
    name: "find_party",
    description:
      "Look up one customer or supplier by name and return what this business knows about them: their orders, "
      + "their outstanding invoices and their total value. Use whenever the user names a specific company or person.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "The customer or supplier name, or part of it." } },
      required: ["name"],
    },
  },
  {
    name: "collections_status",
    description:
      "What Cortex has recovered by chasing overdue invoices, what it is still chasing, and how many reminders it has sent. "
      + "Use for questions about collections, chasing, recovery, or 'has Cortex actually got me any money back'.",
    parameters: {
      type: "object",
      properties: { days: { type: "integer", description: "Look back this many days (default 90)." } },
    },
  },
  {
    name: "revenue_by_month",
    description:
      "Monthly revenue from won sales orders for the last N months, oldest first. "
      + "Use for questions about trend, growth, seasonality, or comparing months.",
    parameters: {
      type: "object",
      properties: { months: { type: "integer", description: "How many months back (1-24, default 6)." } },
    },
  },
] as const;

export type ToolResult = { ok: boolean; rows?: any[]; summary?: string; error?: string };

/**
 * Escape LIKE metacharacters before an ilike().
 *
 * `_` matches any character in LIKE and is common in company names and email
 * local-parts, so an unescaped search for "a_b" also matches "axb". The same
 * escaping is applied elsewhere in this codebase for the same reason.
 */
function likeLiteral(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1");
}

/**
 * Execute one tool call.
 *
 * `orgId` is supplied by the caller from the session. It is never read from
 * `args`, which is the whole security model of this file.
 */
export async function runTool(name: string, args: any, orgId: string): Promise<ToolResult> {
  if (!orgId) return { ok: false, error: "No workspace in context." };
  const sb = createClient();

  try {
    switch (name) {
      case "top_receivables": {
        const limit = clampLimit(args?.limit, 5);
        let q = sb.from("invoices")
          .select("invoice_no, party, amount, due_date, status")
          .eq("org_id", orgId).eq("type", "receivable").neq("status", "paid")
          .order("amount", { ascending: false }).limit(MAX_ROWS);
        const { data } = await q;
        let rows = (data as any[] || []).map((r) => {
          const overdueBy = r.due_date ? days(r.due_date) : null;
          return {
            invoice: r.invoice_no, customer: r.party, amount: Number(r.amount) || 0,
            due_date: r.due_date,
            days_past_due: overdueBy !== null && overdueBy > 0 ? overdueBy : 0,
          };
        });
        if (args?.only_overdue) rows = rows.filter((r) => r.days_past_due > 0);
        rows = rows.slice(0, limit);
        const total = rows.reduce((n, r) => n + r.amount, 0);
        return { ok: true, rows, summary: `${rows.length} unpaid invoice(s), ₹${total.toLocaleString("en-IN")} in total.` };
      }

      case "top_payables": {
        const limit = clampLimit(args?.limit, 5);
        const { data } = await sb.from("invoices")
          .select("invoice_no, party, amount, due_date, status, created_at")
          .eq("org_id", orgId).eq("type", "payable").neq("status", "paid")
          .order("amount", { ascending: false }).limit(limit);
        const rows = (data as any[] || []).map((r) => ({
          invoice: r.invoice_no, supplier: r.party, amount: Number(r.amount) || 0,
          due_date: r.due_date,
          days_outstanding: days(r.created_at) ?? null,
        }));
        const total = rows.reduce((n, r) => n + r.amount, 0);
        return { ok: true, rows, summary: `${rows.length} unpaid bill(s), ₹${total.toLocaleString("en-IN")} owed.` };
      }

      case "top_customers": {
        const limit = clampLimit(args?.limit, 5);
        /*
          Aggregated in JS over a bounded read rather than in SQL. PostgREST
          cannot GROUP BY without a database view, and adding one for this is a
          migration; 2000 rows is well within what a request can sort, and the
          alternative — an unbounded read — is the thing worth avoiding.
        */
        const { data } = await sb.from("sales_orders")
          .select("customer_name, amount, status, created_at")
          .eq("org_id", orgId).eq("status", "won")
          .order("created_at", { ascending: false }).limit(2000);
        const by = new Map<string, { total: number; orders: number; last: string | null }>();
        for (const r of (data as any[] || [])) {
          const k = String(r.customer_name || "").trim() || "(unnamed)";
          const cur = by.get(k) || { total: 0, orders: 0, last: null };
          cur.total += Number(r.amount) || 0;
          cur.orders += 1;
          if (!cur.last || (r.created_at && r.created_at > cur.last)) cur.last = r.created_at;
          by.set(k, cur);
        }
        const rows = [...by.entries()]
          .sort((a, b) => b[1].total - a[1].total).slice(0, limit)
          .map(([customer, v]) => ({
            customer, total_value: Math.round(v.total), orders: v.orders,
            days_since_last_order: days(v.last),
          }));
        return { ok: true, rows, summary: `Top ${rows.length} of ${by.size} customers by won-order value.` };
      }

      case "recent_orders": {
        const limit = clampLimit(args?.limit, 10);
        const { data } = await sb.from("sales_orders")
          .select("order_no, customer_name, product, amount, status, created_at")
          .eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
        const rows = (data as any[] || []).map((r) => ({
          order: r.order_no, customer: r.customer_name, product: r.product,
          amount: Number(r.amount) || 0, status: r.status, days_ago: days(r.created_at),
        }));
        return { ok: true, rows, summary: `${rows.length} most recent order(s).` };
      }

      case "low_stock": {
        const limit = clampLimit(args?.limit, 10);
        const { data } = await sb.from("inventory_items")
          .select("sku, name, on_hand, reorder_level, unit_cost, supplier")
          .eq("org_id", orgId).limit(1000);
        const rows = (data as any[] || [])
          .filter((r) => Number(r.on_hand) <= Number(r.reorder_level || 0))
          .sort((a, b) => Number(a.on_hand) - Number(b.on_hand))
          .slice(0, limit)
          .map((r) => ({
            sku: r.sku, item: r.name, on_hand: Number(r.on_hand) || 0,
            reorder_level: Number(r.reorder_level) || 0, supplier: r.supplier,
          }));
        return { ok: true, rows, summary: rows.length ? `${rows.length} item(s) at or below reorder level.` : "Nothing is at or below its reorder level." };
      }

      case "find_party": {
        const raw = String(args?.name || "").trim();
        if (!raw) return { ok: false, error: "No name given." };
        const like = `%${likeLiteral(raw)}%`;
        const [orders, invs, cust] = await Promise.all([
          sb.from("sales_orders").select("order_no, amount, status, created_at")
            .eq("org_id", orgId).ilike("customer_name", like)
            .order("created_at", { ascending: false }).limit(10),
          sb.from("invoices").select("invoice_no, amount, due_date, status, type")
            .eq("org_id", orgId).ilike("party", like).limit(10),
          sb.from("customers").select("name, company, status, value")
            .eq("org_id", orgId).or(`name.ilike.${like},company.ilike.${like}`).limit(3),
        ]);
        const o = (orders.data as any[]) || [];
        const i = (invs.data as any[]) || [];
        const outstanding = i.filter((x) => x.status !== "paid").reduce((n, x) => n + (Number(x.amount) || 0), 0);
        return {
          ok: true,
          rows: [{
            matched: raw,
            profile: (cust.data as any[])?.[0] || null,
            orders: o.map((x) => ({ order: x.order_no, amount: Number(x.amount) || 0, status: x.status, days_ago: days(x.created_at) })),
            invoices: i.map((x) => ({ invoice: x.invoice_no, amount: Number(x.amount) || 0, status: x.status, type: x.type, due_date: x.due_date })),
            total_outstanding: Math.round(outstanding),
          }],
          summary: o.length || i.length
            ? `Found ${o.length} order(s) and ${i.length} invoice(s) for "${raw}".`
            : `Nothing on file for "${raw}".`,
        };
      }

      case "collections_status": {
        const days = Math.min(Math.max(Number(args?.days) || 90, 1), 365);
        const { data, error } = await sb.rpc("cortex_recovery_summary", { p_org: orgId, p_days: days });
        if (error) return { ok: false, error: "Collections is not set up for this workspace yet." };
        const r = (Array.isArray(data) ? data[0] : data) as any;
        const recovered = Number(r?.amount_recovered) || 0;
        return {
          ok: true,
          rows: [{
            days,
            amount_recovered: Math.round(recovered),
            invoices_recovered: Number(r?.invoices_recovered) || 0,
            reminders_sent: Number(r?.messages_sent) || 0,
            still_chasing_amount: Math.round(Number(r?.amount_chasing) || 0),
            still_chasing_count: Number(r?.still_chasing) || 0,
          }],
          summary: recovered > 0
            ? `₹${Math.round(recovered).toLocaleString("en-IN")} recovered after a reminder in the last ${days} days.`
            : `No invoices have been paid after a Cortex reminder in the last ${days} days.`,
        };
      }

      case "revenue_by_month": {
        const months = Math.min(Math.max(Number(args?.months) || 6, 1), 24);
        const from = new Date();
        from.setMonth(from.getMonth() - months);
        const { data } = await sb.from("sales_orders")
          .select("amount, created_at").eq("org_id", orgId).eq("status", "won")
          .gte("created_at", from.toISOString()).limit(5000);
        const by = new Map<string, number>();
        for (const r of (data as any[] || [])) {
          const k = String(r.created_at || "").slice(0, 7);   // YYYY-MM
          if (!k) continue;
          by.set(k, (by.get(k) || 0) + (Number(r.amount) || 0));
        }
        const rows = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, revenue]) => ({ month, revenue: Math.round(revenue) }));
        return { ok: true, rows, summary: `Revenue for ${rows.length} month(s) with activity.` };
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    // A tool failure must never take the answer down — the model is told the
    // lookup failed and can say so, which is better than a broken chat.
    return { ok: false, error: e?.message || "Lookup failed." };
  }
}

/**
 * Names the model is allowed to call.
 *
 * Typed as Set<string> deliberately: TOOL_DECLARATIONS is `as const`, so the
 * inferred element type is the literal union, and a Set of that union refuses
 * `.has(someString)` at compile time — which is backwards. The whole job of
 * this set is to test a name the MODEL supplied, which is an arbitrary string
 * until it has been checked.
 */
export const TOOL_NAMES: Set<string> = new Set(TOOL_DECLARATIONS.map((t) => t.name));
