/*
  BOOKS CONNECTORS — Zoho Books and Odoo, pulled on Cortex's own schedule.

  Pure on purpose: no "server-only", no Supabase. Every function takes the
  fetch it should use, so scripts/test-books-sync.mjs drives the real mapping
  and pagination against canned provider responses, and lib/sync/index.ts
  passes the production fetch (plain fetch for Zoho's fixed hosts, safeFetch
  for an Odoo URL the customer typed).

  WHAT EACH ONE MAPS TO (the same three tables every connector writes):
    invoices      receivable from sales invoices, payable from bills
    sales_orders  confirmed sales orders
    customers     customer contacts

  AMOUNTS. A paid invoice is booked at its total. An open one is booked at
  what is still OUTSTANDING (its balance), because Cortex's receivables,
  overdue and working-capital numbers read invoices.amount as money owed —
  booking the full total of a half-paid invoice would overstate every one of
  them. The note says how many were part-paid.

  CURRENCY. Same rule as Stripe and Razorpay: INR is imported, anything else
  is skipped and named in the note. There is no FX feed, and a guessed rate is
  a wrong number in a ledger.
*/

export type FetchLike = (url: string, init?: RequestInit & { timeoutMs?: number }) => Promise<Response>;
export type Pulled = { sales?: any[]; invoices?: any[]; customers?: any[]; note?: string };

const money = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const day = (s: any) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s ?? "")); return m ? m[1] : undefined; };
const isInr = (cur: any) => !cur || String(cur).toUpperCase() === "INR";
const MAX_PAGES = 20;

/* ================================================================ Zoho Books */

/** Zoho runs separate data centres; only these hosts are ever called. */
export const ZOHO_DCS = ["in", "com", "eu", "com.au", "jp", "ca", "sa"] as const;
export function zohoDc(raw: unknown): string {
  const v = String(raw ?? "").trim().toLowerCase().replace(/^\./, "");
  return (ZOHO_DCS as readonly string[]).includes(v) ? v : "in";
}

/**
 * An access token for this pull.
 *
 * Zoho access tokens live about an hour — which is why this connector used to
 * say "not synced yet": a pasted token was dead before the first nightly run.
 * A Self Client (api-console.zoho.in → Self Client) issues a long-lived
 * REFRESH token, and that is what is stored now; each pull trades it for a
 * fresh access token. A workspace that saved only the old one-hour token still
 * works until it expires, and is told why it stopped.
 */
export async function zohoAccessToken(c: Record<string, string>, f: FetchLike): Promise<string> {
  const dc = zohoDc(c.data_center);
  if (c.refresh_token && c.client_id && c.client_secret) {
    const q = new URLSearchParams({ refresh_token: c.refresh_token, client_id: c.client_id, client_secret: c.client_secret, grant_type: "refresh_token" });
    const r = await f(`https://accounts.zoho.${dc}/oauth/v2/token?${q}`, { method: "POST", timeoutMs: 20_000 });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j?.access_token) {
      const why = j?.error === "invalid_code" || j?.error === "invalid_client"
        ? "Zoho refused the refresh token or client — create a new Self Client code and save it again."
        : `Zoho token refresh failed (${j?.error || r.status}). Check the data centre (${dc}) matches your Zoho account.`;
      throw new Error(why);
    }
    return String(j.access_token);
  }
  if (c.api_key) return c.api_key; /* legacy one-hour token */
  throw new Error("Zoho Books needs a Client ID, Client secret and refresh token (Zoho API console → Self Client).");
}

async function zohoList(f: FetchLike, dc: string, token: string, org: string, path: string, key: string, params: Record<string, string>) {
  const out: any[] = [];
  let page = 1, more = true;
  while (more && page <= MAX_PAGES) {
    const q = new URLSearchParams({ organization_id: org, page: String(page), per_page: "200", ...params });
    const r = await f(`https://www.zohoapis.${dc}/books/v3/${path}?${q}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, timeoutMs: 20_000 });
    if (r.status === 401) throw new Error("Zoho Books rejected the access token. If you saved a one-hour token, replace it with a Self Client refresh token.");
    if (!r.ok) throw new Error(`Zoho Books returned ${r.status} for ${path}`);
    const j: any = await r.json();
    out.push(...(Array.isArray(j?.[key]) ? j[key] : []));
    more = Boolean(j?.page_context?.has_more_page);
    page++;
  }
  return { rows: out, truncated: more };
}

/** Zoho invoice/bill status → Cortex. null = do not import (draft, void). */
export function zohoStatus(s: any): "paid" | "pending" | "overdue" | null {
  const v = String(s ?? "").toLowerCase();
  if (v === "paid") return "paid";
  if (v === "overdue") return "overdue";
  if (v === "draft" || v === "void" || v === "rejected") return null;
  return "pending"; /* sent, viewed, partially_paid, open, unpaid */
}

export function mapZoho(raw: { invoices?: any[]; bills?: any[]; salesorders?: any[]; contacts?: any[] }) {
  const foreign = new Set<string>();
  let partly = 0;
  const keep = (cur: any) => { if (isInr(cur)) return true; foreign.add(String(cur).toUpperCase()); return false; };
  const doc = (d: any, type: "receivable" | "payable", no: string, party: string) => {
    const status = zohoStatus(d.status);
    if (!status || !keep(d.currency_code)) return null;
    const total = money(d.total), balance = d.balance === undefined ? total : money(d.balance);
    if (status !== "paid" && balance > 0 && balance < total) partly++;
    return {
      invoice_no: `ZB-${type === "payable" ? "BILL-" : ""}${no}`,
      party: party || (type === "payable" ? "Zoho Books vendor" : "Zoho Books customer"),
      amount: status === "paid" ? total : balance,
      status, type,
      issue_date: day(d.date),
      due_date: day(d.due_date) || day(d.date),
    };
  };
  const invoices = [
    ...(raw.invoices || []).map((d) => doc(d, "receivable", String(d.invoice_number || d.invoice_id || ""), d.customer_name)),
    ...(raw.bills || []).map((d) => doc(d, "payable", String(d.bill_number || d.bill_id || ""), d.vendor_name)),
  ].filter((r): r is NonNullable<typeof r> => Boolean(r && r.invoice_no.replace(/^ZB-(BILL-)?/, "")));
  const sales = (raw.salesorders || [])
    .filter((s) => !["draft", "void"].includes(String(s.status || "").toLowerCase()) && keep(s.currency_code))
    .map((s) => ({
      order_no: `ZB-SO-${s.salesorder_number || s.salesorder_id}`,
      customer_name: s.customer_name || null,
      amount: money(s.total),
      status: "won",
      order_date: day(s.date),
    }));
  const customers = (raw.contacts || [])
    .filter((c) => String(c.contact_type || "customer") === "customer" && String(c.contact_name || "").trim())
    .map((c) => ({
      name: String(c.contact_name).trim(),
      company: c.company_name || null,
      email: c.email || null,
      phone: c.phone || c.mobile || null,
      status: String(c.status || "active") === "active" ? "active" : "churned",
    }));
  return { invoices, sales, customers, foreign: [...foreign], partly };
}

export async function pullZohoBooks(c: Record<string, string>, since: string, f: FetchLike): Promise<Pulled> {
  const org = String(c.organization_id || "").trim();
  if (!/^\d{4,20}$/.test(org)) throw new Error("Zoho Books needs the numeric Organization ID (Zoho Books → Settings → Organization profile).");
  const dc = zohoDc(c.data_center);
  const token = await zohoAccessToken(c, f);
  const from = day(since)!;
  const [inv, bills, sos, contacts] = [
    await zohoList(f, dc, token, org, "invoices", "invoices", { date_start: from }),
    await zohoList(f, dc, token, org, "bills", "bills", { date_start: from }),
    await zohoList(f, dc, token, org, "salesorders", "salesorders", { date_start: from }),
    await zohoList(f, dc, token, org, "contacts", "contacts", { contact_type: "customer" }),
  ];
  const m = mapZoho({ invoices: inv.rows, bills: bills.rows, salesorders: sos.rows, contacts: contacts.rows });
  const truncated = [inv, bills, sos, contacts].some((x) => x.truncated);
  return {
    invoices: m.invoices, sales: m.sales, customers: m.customers,
    note: [
      m.foreign.length ? `Skipped documents in ${m.foreign.join(", ")} — Cortex books in INR only.` : "",
      m.partly ? `${m.partly} part-paid invoice(s) are booked at the amount still outstanding.` : "",
      truncated ? `More than ${MAX_PAGES * 200} records in one list; the rest arrive on the next runs.` : "",
    ].filter(Boolean).join(" ") || undefined,
  };
}

/* ====================================================================== Odoo */

/**
 * Odoo's external API (JSON-RPC over /jsonrpc) with a user's API key —
 * Odoo → Preferences → Account Security → New API key. The URL is the
 * customer's own, so the caller passes safeFetch: a private or metadata
 * address is refused before any credential is sent.
 *
 * Read-only by construction: the only model method called is search_read.
 */
export function odooBase(raw: unknown): string {
  const s = String(raw ?? "").trim().replace(/\/+$/, "").replace(/\/(web|odoo)(\/.*)?$/i, "");
  if (!/^https:\/\/[^/\s]+$/i.test(s)) throw new Error("Odoo URL must be https://yourcompany.odoo.com (or your own https domain).");
  return s;
}

async function odooRpc(f: FetchLike, base: string, service: string, method: string, args: any[]) {
  const r = await f(`${base}/jsonrpc`, {
    method: "POST", headers: { "Content-Type": "application/json" }, timeoutMs: 25_000,
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: Date.now() }),
  });
  if (!r.ok) throw new Error(`Odoo returned ${r.status}`);
  const j: any = await r.json();
  if (j?.error) throw new Error(`Odoo: ${j.error?.data?.message || j.error?.message || "request refused"}`);
  return j?.result;
}

export const ODOO_PAGE = 500;

/** Odoo payment_state → Cortex. */
export function odooStatus(m: any, today = new Date().toISOString().slice(0, 10)): "paid" | "pending" | "overdue" {
  const ps = String(m.payment_state || "").toLowerCase();
  if (ps === "paid" || ps === "in_payment") return "paid";
  const due = day(m.invoice_date_due);
  return due && due < today ? "overdue" : "pending";
}

const m2oName = (v: any) => (Array.isArray(v) ? String(v[1] ?? "") : v ? String(v) : "");

export function mapOdoo(raw: { moves?: any[]; orders?: any[]; partners?: any[] }, today?: string) {
  const foreign = new Set<string>();
  let partly = 0;
  const keep = (cur: any) => { const c = m2oName(cur); if (isInr(c)) return true; foreign.add(c.toUpperCase()); return false; };
  const invoices = (raw.moves || [])
    .filter((m) => String(m.state) === "posted" && ["out_invoice", "in_invoice"].includes(String(m.move_type)) && keep(m.currency_id))
    .map((m) => {
      const status = odooStatus(m, today);
      const total = money(m.amount_total), residual = m.amount_residual === undefined ? total : money(m.amount_residual);
      if (status !== "paid" && residual > 0 && residual < total) partly++;
      const payable = m.move_type === "in_invoice";
      return {
        invoice_no: `ODOO-${payable ? "BILL-" : ""}${m.name || m.id}`,
        party: m2oName(m.partner_id) || (payable ? "Odoo vendor" : "Odoo customer"),
        amount: status === "paid" ? total : residual,
        status, type: payable ? "payable" : "receivable",
        issue_date: day(m.invoice_date),
        due_date: day(m.invoice_date_due) || day(m.invoice_date),
      };
    });
  const sales = (raw.orders || [])
    .filter((o) => ["sale", "done"].includes(String(o.state)) && keep(o.currency_id))
    .map((o) => ({ order_no: `ODOO-${o.name || o.id}`, customer_name: m2oName(o.partner_id) || null, amount: money(o.amount_total), status: "won", order_date: day(o.date_order) }));
  const customers = (raw.partners || [])
    .filter((p) => String(p.name || "").trim())
    .map((p) => ({ name: String(p.name).trim(), company: m2oName(p.parent_id) || null, email: p.email || null, phone: p.phone || p.mobile || null, status: "active" }));
  return { invoices, sales, customers, foreign: [...foreign], partly };
}

export async function pullOdoo(c: Record<string, string>, since: string, f: FetchLike): Promise<Pulled> {
  const base = odooBase(c.url);
  const db = String(c.db || "").trim(), user = String(c.username || "").trim(), key = String(c.api_key || "");
  if (!db || !user || !key) throw new Error("Odoo needs the database name, username and an API key.");
  const uid = await odooRpc(f, base, "common", "authenticate", [db, user, key, {}]);
  if (!uid) throw new Error("Odoo refused the username or API key.");
  const from = day(since)!;
  let truncated = false;
  const read = async (model: string, domain: any[], fields: string[]) => {
    const out: any[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = await odooRpc(f, base, "object", "execute_kw", [db, uid, key, model, "search_read", [domain], { fields, limit: ODOO_PAGE, offset: page * ODOO_PAGE, order: "id asc" }]);
      const got = Array.isArray(rows) ? rows : [];
      out.push(...got);
      if (got.length < ODOO_PAGE) return out;
    }
    truncated = true;
    return out;
  };
  const moves = await read("account.move", [["move_type", "in", ["out_invoice", "in_invoice"]], ["state", "=", "posted"], ["invoice_date", ">=", from]],
    ["name", "move_type", "state", "partner_id", "amount_total", "amount_residual", "payment_state", "invoice_date", "invoice_date_due", "currency_id"]);
  const orders = await read("sale.order", [["state", "in", ["sale", "done"]], ["date_order", ">=", from]], ["name", "state", "partner_id", "amount_total", "date_order", "currency_id"]);
  const partners = await read("res.partner", [["customer_rank", ">", 0]], ["name", "email", "phone", "mobile", "parent_id"]);
  const m = mapOdoo({ moves, orders, partners });
  return {
    invoices: m.invoices, sales: m.sales, customers: m.customers,
    note: [
      m.foreign.length ? `Skipped documents in ${m.foreign.join(", ")} — Cortex books in INR only.` : "",
      m.partly ? `${m.partly} part-paid invoice(s) are booked at the amount still outstanding.` : "",
      truncated ? `More than ${MAX_PAGES * ODOO_PAGE} records in one list; the rest arrive on the next runs.` : "",
    ].filter(Boolean).join(" ") || undefined,
  };
}
