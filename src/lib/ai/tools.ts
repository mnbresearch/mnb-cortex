import "server-only";
import { daysPastDueIST } from "@/lib/statutory";
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
 * EVERYTHING IS SELECT — WITH ONE DELIBERATE EXCEPTION, AND THIS IS ITS REVIEW.
 *
 * For most of this product's life the line above read "Everything is SELECT.
 * There is no tool that writes", and three independent security reviews each
 * verified it and each rested their LLM01 conclusion on it: untrusted text in
 * a CSV can reach the prompt, but the model's output can only ever become
 * words a human reads. That sentence is no longer literally true, so here is
 * exactly how it changed and what still holds.
 *
 * `propose_action` is the only tool that is not a SELECT. It does not update
 * an invoice, send a message, or move money. It writes ONE ROW to
 * action_proposals — a staging table whose rows do nothing until either a
 * human approves them on /approvals or the workspace owner's own standing
 * rule (lib/engine/policy.ts) says the action may run without asking, within
 * caps the server enforces. The model cannot approve, cannot execute, cannot
 * set a rule, and cannot name an action outside lib/engine/catalogue.ts. The
 * executor that eventually acts is deterministic code that never sees the
 * prompt.
 *
 * So the LLM01 boundary has moved from "the model's output is text" to "the
 * model's output is a typed proposal that a policy the owner controls decides
 * on". That is a real change and it is recorded as one: the worst case for a
 * poisoned prompt is now a bad proposal in the queue — rate-limited per day,
 * labelled as coming from chat, with its rationale and evidence shown so the
 * person approving can see it is nonsense. It is not a sent message.
 *
 * scripts/test-ai-tools.mjs pins this: every tool except propose_action must
 * contain no write verb, and propose_action must call the ledger's propose()
 * and nothing else from the engine.
 */

/** Hard ceiling on rows returned to the model, whatever it asks for. */
const MAX_ROWS = 25;

const clampLimit = (n: any, fallback = 5) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), MAX_ROWS);
};

/*
  `Math.round((Date.now() - dueUTCmidnight) / 86_400_000)` crosses the half-day
  mark at 12:00 UTC = 17:30 IST, so from half past five every evening an
  invoice due TODAY came back as `days_past_due: 1`.

  That value is not merely displayed — it is handed to Gemini, and the
  `only_overdue` filter is `days_past_due > 0`. So asked "who should I chase?"
  after 17:30, the assistant named a customer whose invoice was not yet late,
  with a specific number of days attached. A model will not second-guess a
  figure the tool hands it.

  daysPastDueIST is the one definition, anchored on IST midnight. Null stays
  null: no due date means the model is told nothing rather than told zero.
*/
const days = (from: string | null | undefined): number | null => {
  if (!from) return null;
  if (!Number.isFinite(new Date(String(from)).getTime())) return null;
  return daysPastDueIST(from);
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
  {
    name: "propose_action",
    description:
      "Ask Cortex to DO something in this workspace. This does not perform the action: it creates a proposal the owner "
      + "approves on the Approvals page (or that runs on its own only if the owner has set a rule allowing it). "
      + "Use when the person asks you to change, send, mark or export something — never just describe what you would do; propose it. "
      + "Actions: update_invoice_due_date {invoice_id, due_date, invoice_no?} · mark_invoice_paid {invoice_id, paid_on?, amount?, invoice_no?} · "
      + "add_do_not_contact {party, reason?} · send_payment_reminder {invoice_id, channel?: email|whatsapp, amount?, invoice_no?} · "
      + "raise_alert {message, severity?: info|warning|critical} · export_xlsx {dataset: receivables_ageing|payables|customers|sales_orders|inventory|invoices|mis_pack, days?} (mis_pack = the monthly management pack: KPIs, trend, ageing, payables, top customers, collections) · "
      + "add_customer_note {customer_id, note, customer_name?} (use find_party to get profile.id) · set_customer_status {customer_id, status: lead|active|churned, customer_name?}. "
      + "Always look the invoice up first (top_receivables / find_party) so invoice_id and amount are real. Give a one-sentence rationale.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "One of the action keys listed above." },
        args: { type: "object", description: "The action's arguments, exactly as named above." },
        rationale: { type: "string", description: "One sentence: why this should happen, in words the owner will read." },
        evidence: { type: "array", items: { type: "string" }, description: "Up to 5 short facts you looked at (e.g. 'INV-104 is 47 days past due')." },
      },
      required: ["action", "args", "rationale"],
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
export async function runTool(name: string, args: any, orgId: string, userId: string | null = null): Promise<ToolResult> {
  if (!orgId) return { ok: false, error: "No workspace in context." };

  /*
    THE ONE WRITE. Handled before the SELECT switch so it is visibly separate.
    Everything it can do is bounded by lib/engine: the action must be in the
    catalogue, the args are validated against the spec, the owner's policy
    decides auto/approve/blocked, and the proposal is capped per day so a
    poisoned prompt cannot flood the queue. The model never learns whether an
    auto-executed proposal "worked" in a way it could exploit — it gets the
    same shape of answer either way.
  */
  if (name === "propose_action") return proposeFromChat(args, orgId, userId);

  const sb = await createClient();

  try {
    switch (name) {
      case "top_receivables": {
        const limit = clampLimit(args?.limit, 5);
        /*
          `neq("status", "paid")` is case-SENSITIVE in PostgREST, and every
          Tally and Vyapar export writes "Paid". Settled invoices were coming
          back as outstanding, and the assistant then told the owner to chase
          money that was already in the bank.

          The `or` rather than a bare `not.ilike`: in SQL `NOT (NULL ILIKE
          'paid')` is NULL, not TRUE, so a row with no status at all would be
          filtered OUT of a list of unpaid invoices. `neq` had the same hole.
          An invoice with a blank status is unpaid until someone says otherwise.
        */
        let q = sb.from("invoices")
          .select("invoice_no, party, amount, due_date, status")
          .eq("org_id", orgId).eq("type", "receivable")
          .or("status.is.null,status.not.ilike.paid")
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

        /*
          Total the WHOLE matching set before truncating to the top few.

          It used to slice to `limit` and then sum, and hand the assistant
          "5 unpaid invoice(s), ₹6,20,000 in total" for a book of two hundred
          invoices worth ₹94,00,000. The assistant repeated that as the owner's
          outstanding position, because nothing in the result said otherwise.
          Summing before the slice, and labelling the two numbers differently,
          is what stops it.
        */
        const matched = rows.length;
        const total = rows.reduce((n, r) => n + r.amount, 0);
        const capped = matched >= MAX_ROWS;
        rows = rows.slice(0, limit);
        const shownTotal = rows.reduce((n, r) => n + r.amount, 0);

        /*
          `capped` IS CHECKED FIRST, and that ordering is the whole fix.

          The condition was `matched === rows.length ? complete : truncated`,
          and `capped` was only ever read inside the else branch. But the model
          is allowed to ask for limit 25, clampLimit caps at 25, and MAX_ROWS is
          25 — so for any book with 25 or more open invoices, `matched` equals
          `rows.length` equals the cap, the FIRST branch fires, and the
          assistant is handed

              "25 unpaid invoice(s), ₹6,20,000 in total."

          with no "+" and no caveat, for a business owed ₹94,00,000 across two
          hundred invoices. That is the exact defect the note above describes
          fixing — it was fixed for the slice and reintroduced by the cap.

          Hitting the row ceiling means we do not know the total. The only
          honest thing to report is a floor, and to say so.
        */
        const what = args?.only_overdue ? "past-due invoice" : "unpaid invoice";
        const summary = capped
          ? `At least ${matched} ${what}(s), worth at least ₹${total.toLocaleString("en-IN")} — `
            + `this is only the largest ${MAX_ROWS} and the real total is higher. `
            + `Open /receivables for the complete figure.`
          : matched === rows.length
            ? `${matched} ${what}(s), ₹${total.toLocaleString("en-IN")} in total.`
            : `${matched} ${what}(s) totalling ₹${total.toLocaleString("en-IN")}. `
              + `Showing the largest ${rows.length}, worth ₹${shownTotal.toLocaleString("en-IN")}.`;

        return { ok: true, rows, summary };
      }

      case "top_payables": {
        const limit = clampLimit(args?.limit, 5);
        const { data } = await sb.from("invoices")
          .select("invoice_no, party, amount, due_date, status, created_at")
          .eq("org_id", orgId).eq("type", "payable").or("status.is.null,status.not.ilike.paid")
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
        /*
          `,` `(` `)` are stripped BEFORE likeLiteral, not instead of it.

          likeLiteral escapes LIKE metacharacters (\ % _). The `.or()` two lines
          below is a different grammar: PostgREST parses that string, where a
          comma separates conditions. And the argument here is chosen by the
          MODEL, which reads invoice parties and customer names — so a debtor
          named `Acme, monthly_ctc.gt.500000` is a prompt-injection path into
          filter syntax. Same defect as searchAll in lib/data.ts; fixed the same
          way, in both places, because one of them being right is not a fix.
        */
        const raw = String(args?.name || "").trim();
        if (!raw) return { ok: false, error: "No name given." };
        // Wildcard, not a space — see searchAll in lib/data.ts. This one matters
        // more: the model passes a name it read out of the customer's OWN
        // invoices, so a space would make the agent answer "no such party" for
        // every debtor whose name contains a comma or brackets.
        const like = `%${likeLiteral(raw).replace(/[,()]/g, "%")}%`;
        const [orders, invs, cust] = await Promise.all([
          sb.from("sales_orders").select("order_no, amount, status, created_at")
            .eq("org_id", orgId).ilike("customer_name", like)
            .order("created_at", { ascending: false }).limit(10),
          sb.from("invoices").select("invoice_no, amount, due_date, status, type")
            .eq("org_id", orgId).ilike("party", like).limit(10),
          /* id included so a follow-up propose_action (add_customer_note, set_customer_status) can name the row — the id is the only thing those actions accept. */
          sb.from("customers").select("id, name, company, status, value")
            .eq("org_id", orgId).or(`name.ilike.${like},company.ilike.${like}`).limit(3),
        ]);
        const o = (orders.data as any[]) || [];
        const i = (invs.data as any[]) || [];
        /*
          CASE-INSENSITIVE, like every other unpaid test in this file.

          This was `x.status !== "paid"` — and the note 170 lines above records
          fixing exactly this: every Tally and Vyapar export writes "Paid", so a
          case-sensitive comparison counts settled invoices as outstanding and
          the assistant tells the owner to chase money already in the bank.
          top_receivables and top_payables were corrected to
          `status.not.ilike.paid`; find_party was missed, which is the tool an
          owner reaches for by name ("what does Apex Traders owe me?").

          Done in JS rather than the query because these rows are already
          fetched for display — the filter only has to agree with PostgREST's
          ILIKE, not replace it. A null status is unpaid, same rule as above.
        */
        const isSettled = (s: unknown) => String(s ?? "").trim().toLowerCase() === "paid";
        const outstanding = i.filter((x) => !isSettled(x.status)).reduce((n, x) => n + (Number(x.amount) || 0), 0);
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
/** Proposals from chat per workspace per day. Enough for real use; not enough for a flood. */
const CHAT_PROPOSALS_PER_DAY = 30;

async function proposeFromChat(args: any, orgId: string, userId: string | null): Promise<ToolResult> {
  const { propose, listProposals } = await import("@/lib/engine/ledger");
  const { CATALOGUE_BY_KEY, isActionKey } = await import("@/lib/engine/catalogue");

  const action = String(args?.action || "");
  if (!isActionKey(action)) {
    return { ok: false, error: `"${action}" is not something Cortex can do. The actions are: ${Object.keys(CATALOGUE_BY_KEY).join(", ")}.` };
  }

  /* Daily flood guard, counted from the ledger like every other cap. */
  const recent = await listProposals(orgId, { limit: 200 });
  const since = Date.now() - 86_400_000;
  const fromChatToday = recent.filter((p) => p.source === "chat" && new Date(p.created_at).getTime() > since).length;
  if (fromChatToday >= CHAT_PROPOSALS_PER_DAY) {
    return { ok: false, error: `Cortex has already proposed ${CHAT_PROPOSALS_PER_DAY} actions from chat today. Review them on /approvals before proposing more.` };
  }

  const r = await propose({
    orgId, action, args: args?.args ?? {}, source: "chat", proposedBy: userId,
    rationale: String(args?.rationale || "").slice(0, 500) || null,
    evidence: Array.isArray(args?.evidence) ? args.evidence.slice(0, 5).map((e: unknown) => String(e).slice(0, 200)) : [],
  });
  if (!r.ok) return { ok: false, error: r.problems?.length ? `${r.error} ${r.problems.join("; ")}.` : r.error };

  const def = CATALOGUE_BY_KEY[action];
  const what = (() => { try { return def.describe(r.proposal.args); } catch { return def.title; } })();
  if (r.executed) {
    return r.executed.ok
      ? { ok: true, summary: `Done, within the owner's rule for this action: ${r.executed.summary}` }
      : { ok: false, error: `Allowed by the owner's rule, but it did not go through: ${r.executed.error}` };
  }
  if (r.verdict.verdict === "blocked") return { ok: false, error: `Not allowed in this workspace: ${r.verdict.reason}` };
  return {
    ok: true,
    summary: `Proposed, not done: "${what}" is waiting for approval on the Approvals page. ${r.verdict.reason} Tell the person it needs their tap.`,
  };
}

export const TOOL_NAMES: Set<string> = new Set(TOOL_DECLARATIONS.map((t) => t.name));
