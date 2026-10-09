/*
  PUBLIC API INGEST, EXECUTED ON REAL POSTGRES (PGlite).

  The Tally bridge and every API integrator write through api_ingest(). An
  audit found it plain-INSERTed against unique natural keys (so any re-send
  failed), threw away order dates, invented random keys that collided inside
  one batch, and was callable by anon (bypassing the route's limits). This
  runs 2026_zzzt_api_ingest_upsert.sql against minimal real tables carrying
  the same unique indexes as production and attacks each of those.

  Run: node scripts/test-api-ingest.mjs
*/
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

let pass = 0; const fails = [];
const check = (c, n, d = "") => (c ? pass++ : fails.push(`${n}${d ? `\n      ${d}` : ""}`));

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table organizations (id uuid primary key default gen_random_uuid());
  create table api_keys (org_id uuid, key_hash text);
  create table sales_orders (id uuid primary key default gen_random_uuid(), org_id uuid, order_no text, customer_name text, region text, product text, amount numeric, status text, order_date date, is_repeat boolean default false, customer_id uuid);
  create table invoices (id uuid primary key default gen_random_uuid(), org_id uuid, invoice_no text, party text, amount numeric, due_date date, status text, type text, issue_date date, created_at timestamptz default now());
  create table customers (id uuid primary key default gen_random_uuid(), org_id uuid, name text, company text, email text, phone text, status text, value numeric, created_at timestamptz default now());
  create table inventory_items (id uuid primary key default gen_random_uuid(), org_id uuid, sku text, name text, category text, on_hand numeric, reorder_level numeric, unit_cost numeric, supplier text);
  create unique index sales_orders_org_orderno_key on sales_orders (org_id, order_no);
  create unique index invoices_org_invoiceno_key on invoices (org_id, invoice_no);
  create unique index customers_org_name_key on customers (org_id, name);
  create function api_metrics(p_key text) returns jsonb language sql as $$ select '{}'::jsonb $$;
  insert into organizations(id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
  insert into api_keys values ('11111111-1111-4111-8111-111111111111', encode(sha256(convert_to('KEY-A','UTF8')),'hex')),
                              ('22222222-2222-4222-8222-222222222222', encode(sha256(convert_to('KEY-B','UTF8')),'hex'));
`);
await db.exec(readFileSync("supabase/migrations/2026_zzzt_api_ingest_upsert.sql", "utf8").replace(/notify pgrst[^;]*;/g, ""));
const call = async (key, table, rows) => (await db.query(`select api_ingest($1, $2, $3::jsonb) as r`, [key, table, JSON.stringify(rows)])).rows[0].r;
const count = async (t, org = "11111111-1111-4111-8111-111111111111") => Number((await db.query(`select count(*) n from ${t} where org_id = $1`, [org])).rows[0].n);

/* 1. Idempotent re-send */
const orders = [{ order_no: "SO-1", customer_name: "Acme", amount: 1000, order_date: "2026-04-15" }, { order_no: "SO-2", customer_name: "Beta", amount: 500, order_date: "2026-05-01" }];
let r = await call("KEY-A", "sales_orders", orders);
check(r.ok && r.written === 2, "first send writes both orders", JSON.stringify(r));
r = await call("KEY-A", "sales_orders", orders.map((o) => ({ ...o, amount: o.amount + 1 })));
check(r.ok === true, "a second send of the same orders SUCCEEDS (was: duplicate key)", JSON.stringify(r));
check(await count("sales_orders") === 2, "…and does not duplicate them");
check(Number((await db.query(`select amount from sales_orders where order_no='SO-1'`)).rows[0].amount) === 1001, "…and updates the changed amount");

/* 2. Dates kept */
const d = (await db.query(`select order_date::text d from sales_orders where order_no='SO-1'`)).rows[0].d;
check(d === "2026-04-15", `order_date comes from the payload, not current_date (${d})`);
const reg = (await db.query(`select region from sales_orders where order_no='SO-1'`)).rows[0].region;
check(reg === null, `no invented region (${reg})`);

/* 3. No invented keys; duplicates inside one batch do not sink it */
r = await call("KEY-A", "sales_orders", [{ customer_name: "NoNumber", amount: 9 }, { order_no: "SO-3", amount: 1 }, { order_no: "SO-3", amount: 2 }]);
check(r.ok && r.skipped_no_key === 1 && /order_no/.test(r.note), "a row with no order_no is refused and counted, never given a random number", JSON.stringify(r));
check(await count("sales_orders") === 3, "a repeated key inside one batch is written once, not a batch failure");

/* invoices + customers */
r = await call("KEY-A", "invoices", [{ invoice_no: "S-1", party: "Acme", amount: 100, due_date: "2026-06-30" }]);
r = await call("KEY-A", "invoices", [{ invoice_no: "S-1", party: "Acme", amount: 150, due_date: "2026-06-30", status: "paid" }]);
check(r.ok && await count("invoices") === 1, "invoices re-send upserts");
check((await db.query(`select status from invoices where invoice_no='S-1'`)).rows[0].status === "paid", "…and a status change lands (paid)");
r = await call("KEY-A", "customers", [{ name: "Acme", email: "a@x.in" }]);
r = await call("KEY-A", "customers", [{ name: "Acme", phone: "98" }]);
const c = (await db.query(`select email, phone from customers where name='Acme'`)).rows[0];
check(r.ok && await count("customers") === 1 && c.email === "a@x.in" && c.phone === "98", "customers re-send upserts without blanking known fields", JSON.stringify(c));

/* 4. Bounds and tenancy */
r = await call("KEY-A", "sales_orders", Array.from({ length: 10001 }, (_, i) => ({ order_no: `X${i}` })));
check(r.ok === false && /10000/.test(r.error), "the 10,000-row cap is enforced inside the function", JSON.stringify(r));
r = await call("BAD", "sales_orders", orders);
check(r.ok === false && /invalid api key/.test(r.error), "a bad key writes nothing");
r = await call("KEY-B", "sales_orders", [{ order_no: "SO-1", amount: 5 }]);
check(r.ok && await count("sales_orders", "22222222-2222-4222-8222-222222222222") === 1 && await count("sales_orders") === 3, "the same order_no in another workspace is a separate row");
r = await call("KEY-A", "employees", [{}]);
check(r.ok === false && /not allowed/.test(r.error), "tables outside the list are refused");

/* 4b. 2026_zzzv redefines it: lowercased status, constrained type, and leads */
{
  await db.exec(`create table if not exists leads (id uuid primary key default gen_random_uuid(), org_id uuid, name text, email text, phone text, company text, plan text, note text, source text, created_at timestamptz default now());`);
  const zv = readFileSync("supabase/migrations/2026_zzzv_media_sales_watch.sql", "utf8");
  const fnSql = zv.slice(zv.indexOf("create or replace function public.api_ingest"), zv.indexOf("notify pgrst", zv.indexOf("create or replace function public.api_ingest")));
  await db.exec(fnSql);
  let q = await call("KEY-A", "sales_orders", [{ order_no: "SO-CASE", amount: 100, status: " Won " }]);
  const st = (await db.query(`select status from sales_orders where order_no = 'SO-CASE'`)).rows[0]?.status;
  check(q.ok && st === "won", "zzzv: 'Won' arrives as 'won', so it counts as revenue", JSON.stringify({ q, st }));
  q = await call("KEY-A", "invoices", [{ invoice_no: "INV-T", amount: 5, status: "PAID", type: "Purchase" }]);
  const iv = (await db.query(`select status, type from invoices where invoice_no = 'INV-T'`)).rows[0];
  check(iv?.status === "paid" && iv?.type === "receivable", "zzzv: invoice status lowercased, unknown type becomes receivable", JSON.stringify(iv));
  q = await call("KEY-A", "leads", [{ name: "Ravi", email: "Ravi@Acme.in", phone: "98765 43210", source: "website" }, { name: "Dup", email: "ravi@acme.in" }, { name: "NoKey" }, { name: "Ph", phone: "+91-90000-11111" }]);
  check(q.ok && q.skipped_no_key === 1 && await count("leads") === 2, "zzzv: leads accepted, keyed by email/phone, duplicates in a batch merged, keyless refused", JSON.stringify(q));
  q = await call("KEY-A", "leads", [{ name: "Again", email: "RAVI@acme.in" }, { name: "Ph again", phone: "9000011111" }]);
  check(q.ok && await count("leads") === 2, "zzzv: a lead already on file (same email or phone) is not duplicated");
  check(await count("leads", "22222222-2222-4222-8222-222222222222") === 0, "zzzv: leads land only in the key's workspace");
  q = await call("KEY-A", "employees", [{}]);
  check(q.ok === false && /not allowed/.test(q.error), "zzzv: other tables are still refused");
  await db.exec(readFileSync("supabase/migrations/2026_zzzv_media_sales_watch.sql", "utf8").match(/revoke all on function public\.api_ingest[\s\S]*?to service_role;/)[0]);
}

/* 5. Grants: service_role only */
const acl = (await db.query(`select p.proname, r.rolname from pg_proc p cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee where p.proname in ('api_ingest','api_metrics')`)).rows;
check(!acl.some((x) => ["anon", "authenticated", "public"].includes(x.rolname)), "anon/authenticated cannot call either API function directly", JSON.stringify(acl));
check(acl.filter((x) => x.rolname === "service_role").length === 2, "service_role can call both");

/* 6. The routes call them with the service client */
for (const route of ["src/app/api/v1/ingest/route.ts", "src/app/api/v1/metrics/route.ts"]) {
  const src = readFileSync(route, "utf8");
  check(/serviceClient\(\)/.test(src) && /svc\.rpc\("api_(ingest|metrics)"/.test(src) && !/createClient\(\)[\s\S]{0,80}\.rpc\("api_/.test(src), `${route} calls the RPC with the service client`);
  check(/enforce\(\[\{ key: `(ingest|metrics):\$\{bucket\}`/.test(src), `${route} rate-limits per key before calling`);
}

console.log(`\napi ingest: ${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
