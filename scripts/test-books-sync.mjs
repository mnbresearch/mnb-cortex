/**
 * Zoho Books and Odoo pulls, against canned provider responses.
 * lib/sync/books.ts takes its fetch as an argument, so the real pagination,
 * token refresh and mapping run here exactly as they run in production.
 */
const B = await import("../src/lib/sync/books.ts");
let pass = 0; const failures = [];
const check = (c, n, d = "") => (c ? pass++ : failures.push(n + (d ? `\n      ${d}` : "")));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/* ---------------- Zoho ---------------- */
check(B.zohoDc("com") === "com" && B.zohoDc("evil.example") === "in" && B.zohoDc("") === "in" && B.zohoDc(".EU") === "eu", "zoho: data centre is an allow-list, default in");
check(B.zohoStatus("paid") === "paid" && B.zohoStatus("overdue") === "overdue" && B.zohoStatus("partially_paid") === "pending" && B.zohoStatus("draft") === null && B.zohoStatus("void") === null, "zoho: status map (draft/void not imported)");

{
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", auth: init.headers?.Authorization });
    const u = new URL(url);
    if (u.host === "accounts.zoho.in") return json({ access_token: "fresh-token" });
    if (!/^www\.zohoapis\.in$/.test(u.host)) return json({}, 500);
    const page = Number(u.searchParams.get("page"));
    if (u.pathname.endsWith("/invoices")) return json(page === 1
      ? { invoices: [
          { invoice_number: "INV-1", customer_name: "Acme", total: 1000, balance: 0, status: "paid", date: "2026-09-01", due_date: "2026-09-30", currency_code: "INR" },
          { invoice_number: "INV-2", customer_name: "Beta", total: 1000, balance: 400, status: "partially_paid", date: "2026-09-02", due_date: "2026-10-02", currency_code: "INR" },
        ], page_context: { has_more_page: true } }
      : { invoices: [
          { invoice_number: "INV-3", customer_name: "Gamma", total: 500, balance: 500, status: "draft", date: "2026-09-03", currency_code: "INR" },
          { invoice_number: "INV-4", customer_name: "Delta", total: 99, balance: 99, status: "sent", date: "2026-09-04", currency_code: "USD" },
        ], page_context: { has_more_page: false } });
    if (u.pathname.endsWith("/bills")) return json({ bills: [{ bill_number: "B-9", vendor_name: "Steel Co", total: 700, balance: 700, status: "overdue", date: "2026-08-01", due_date: "2026-08-31" }], page_context: { has_more_page: false } });
    if (u.pathname.endsWith("/salesorders")) return json({ salesorders: [{ salesorder_number: "SO-1", customer_name: "Acme", total: 1200, status: "confirmed", date: "2026-09-01" }, { salesorder_number: "SO-2", status: "draft", total: 5 }], page_context: { has_more_page: false } });
    if (u.pathname.endsWith("/contacts")) return json({ contacts: [{ contact_name: "Acme", company_name: "Acme Pvt Ltd", email: "a@acme.in", contact_type: "customer", status: "active" }], page_context: { has_more_page: false } });
    return json({}, 404);
  };
  const out = await B.pullZohoBooks({ client_id: "1000.X", client_secret: "s", refresh_token: "r", organization_id: "60012345", data_center: "in" }, "2026-08-01T00:00:00Z", f);
  check(calls[0].url.startsWith("https://accounts.zoho.in/oauth/v2/token") && calls[0].method === "POST", "zoho: refresh token traded first");
  check(calls.slice(1).every((c) => c.auth === "Zoho-oauthtoken fresh-token"), "zoho: every data call uses the fresh access token");
  check(calls.some((c) => /invoices\?.*page=2/.test(c.url)), "zoho: follows has_more_page");
  check(calls.some((c) => /date_start=2026-08-01/.test(c.url)), "zoho: window passed as date_start");
  const inv = Object.fromEntries(out.invoices.map((i) => [i.invoice_no, i]));
  check(inv["ZB-INV-1"]?.status === "paid" && inv["ZB-INV-1"].amount === 1000, "zoho: paid invoice at total");
  check(inv["ZB-INV-2"]?.status === "pending" && inv["ZB-INV-2"].amount === 400 && inv["ZB-INV-2"].due_date === "2026-10-02", "zoho: part-paid booked at outstanding balance");
  check(!inv["ZB-INV-3"] && !inv["ZB-INV-4"], "zoho: draft and foreign-currency not imported");
  check(inv["ZB-BILL-B-9"]?.type === "payable" && inv["ZB-BILL-B-9"].status === "overdue", "zoho: bills arrive as payables");
  check(out.sales.length === 1 && out.sales[0].order_no === "ZB-SO-SO-1" && out.sales[0].amount === 1200, "zoho: confirmed sales orders only");
  check(out.customers.length === 1 && out.customers[0].name === "Acme" && out.customers[0].status === "active", "zoho: customers");
  check(/USD/.test(out.note || "") && /1 part-paid/.test(out.note || ""), "zoho: note names skipped currency and part-paid count", out.note);
}
{
  let err = "";
  try { await B.pullZohoBooks({ client_id: "x", client_secret: "y", refresh_token: "z", organization_id: "abc" }, "2026-01-01", async () => json({})); } catch (e) { err = e.message; }
  check(/numeric Organization ID/.test(err), "zoho: refuses a non-numeric organization id before any call");
  err = "";
  try { await B.pullZohoBooks({ client_id: "x", client_secret: "y", refresh_token: "z", organization_id: "600123" }, "2026-01-01", async () => json({ error: "invalid_code" }, 400)); } catch (e) { err = e.message; }
  check(/new Self Client code/.test(err), "zoho: a dead refresh token says what to do");
  const legacy = await B.zohoAccessToken({ api_key: "old" }, async () => { throw new Error("must not call"); });
  check(legacy === "old", "zoho: an old one-hour token still works until it expires");
}

/* ---------------- Odoo ---------------- */
check(B.odooBase("https://acme.odoo.com/odoo/action-1") === "https://acme.odoo.com" && B.odooBase("https://erp.acme.in/") === "https://erp.acme.in", "odoo: URL normalised");
let bad = false; try { B.odooBase("http://10.0.0.5"); } catch { bad = true; }
check(bad, "odoo: https only");
check(B.odooStatus({ payment_state: "in_payment" }) === "paid" && B.odooStatus({ payment_state: "not_paid", invoice_date_due: "2026-01-01" }, "2026-10-30") === "overdue" && B.odooStatus({ payment_state: "partial", invoice_date_due: "2026-12-01" }, "2026-10-30") === "pending", "odoo: status map");
{
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, ...body.params });
    if (body.params.service === "common") return json({ result: 7 });
    const [, , , model, method, , opts] = body.params.args;
    if (method !== "search_read") return json({ error: { message: "not allowed" } });
    if (model === "account.move") {
      if (opts.offset === 0) return json({ result: Array.from({ length: B.ODOO_PAGE }, (_, i) => ({ id: i + 1, name: `INV/${i + 1}`, move_type: "out_invoice", state: "posted", partner_id: [3, "Acme"], amount_total: 100, amount_residual: 100, payment_state: "not_paid", invoice_date: "2026-09-01", invoice_date_due: "2099-01-01", currency_id: [20, "INR"] })) });
      return json({ result: [
        { id: 9001, name: "BILL/1", move_type: "in_invoice", state: "posted", partner_id: [4, "Steel"], amount_total: 300, amount_residual: 100, payment_state: "partial", invoice_date: "2026-09-02", invoice_date_due: "2099-01-01", currency_id: [20, "INR"] },
        { id: 9002, name: "INV/X", move_type: "out_invoice", state: "posted", partner_id: [5, "Euro"], amount_total: 50, amount_residual: 0, payment_state: "paid", invoice_date: "2026-09-03", currency_id: [1, "EUR"] },
      ] });
    }
    if (model === "sale.order") return json({ result: [{ id: 1, name: "S0001", state: "sale", partner_id: [3, "Acme"], amount_total: 900, date_order: "2026-09-01 10:00:00", currency_id: [20, "INR"] }] });
    if (model === "res.partner") return json({ result: [{ id: 3, name: "Acme", email: "a@acme.in", parent_id: false }] });
    return json({ result: [] });
  };
  const out = await B.pullOdoo({ url: "https://acme.odoo.com", db: "acme", username: "me@acme.in", api_key: "k" }, "2026-08-01T00:00:00Z", f);
  check(calls[0].service === "common" && calls[0].method === "authenticate", "odoo: authenticates first");
  check(calls.slice(1).every((c) => c.args[4] === "search_read"), "odoo: read-only — search_read is the only model method called");
  check(calls.filter((c) => c.args?.[3] === "account.move").length === 2, "odoo: pages until a short page");
  check(out.invoices.length === B.ODOO_PAGE + 1, "odoo: all INR invoices and bills imported, foreign skipped", String(out.invoices.length));
  const bill = out.invoices.find((i) => i.invoice_no === "ODOO-BILL-BILL/1");
  check(bill?.type === "payable" && bill.amount === 100 && bill.status === "pending", "odoo: vendor bill as payable at residual");
  check(out.sales[0]?.order_no === "ODOO-S0001" && out.sales[0].order_date === "2026-09-01", "odoo: confirmed sales orders");
  check(out.customers[0]?.name === "Acme", "odoo: customers");
  check(/EUR/.test(out.note || ""), "odoo: note names skipped currency", out.note);
  let e2 = ""; try { await B.pullOdoo({ url: "https://acme.odoo.com", db: "a", username: "b", api_key: "c" }, "2026-01-01", async () => json({ result: false })); } catch (e) { e2 = e.message; }
  check(/refused the username/.test(e2), "odoo: bad credentials reported plainly");
}

/* ---------------- wiring ---------------- */
{
  const { readFileSync } = await import("node:fs");
  const sync = readFileSync(new URL("../src/lib/sync/index.ts", import.meta.url), "utf8");
  check(/pull: \(c, since\) => pullOdoo\(c, since, guardedFetch\)/.test(sync) && /guardedFetch: FetchLike = \(url, init = \{\}\) => safeFetch\(/.test(sync), "wiring: Odoo (customer URL) goes through safeFetch");
  check(/pullZohoBooks\(c, since, timedFetch\)/.test(sync) && /AbortSignal\.timeout\(timeoutMs\)/.test(sync), "wiring: Zoho calls have a deadline");
}

if (failures.length) { console.error(`\nbooks sync: ${pass} passed, ${failures.length} failed`); for (const f of failures) console.error("  ✗ " + f); process.exit(1); }
console.log(`books sync: ${pass} passed, 0 failed`);
