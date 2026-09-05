#!/usr/bin/env node
/**
 * Customer↔order linking tests.  Run: npm run test:customer-match
 *
 * WHY THIS SUITE EXISTS
 *
 * /rfm and /churn used to join a customer to their orders on
 * `name.trim().toLowerCase()`, because sales_orders had no foreign key. That
 * is wrong in two directions and neither one raises an error:
 *
 *   "Acme Pvt. Ltd." vs "Acme Private Limited" — one customer, no match, so a
 *     live account shows zero orders and lands in "Lost" or "at risk". The
 *     owner then calls a customer who never left.
 *   Two different customers sharing a name — merged, revenue summed, and
 *     attributed to whichever record sorts first.
 *
 * THE CENTRAL TEST HERE IS THE PARITY TEST. The rule now exists twice: as
 * cortex_norm_name() in SQL (used by the backfill and both triggers) and as
 * normalizeCustomerName() in TypeScript (used by the runtime name fallback).
 * Two implementations of one rule WILL drift, and when they do, rows get
 * linked by one definition and matched by the other — which produces wrong
 * numbers with nothing in any log. So both are run over the same awkward
 * inputs and compared character by character, against real PostgreSQL.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); }
catch { console.error("Needs a real Postgres:\n  npm i -D @electric-sql/pglite --no-save"); process.exit(2); }

/* ---- Compile the TypeScript rule so we test what actually ships --------- */
const out = mkdtempSync(join(tmpdir(), "cortex-match-"));
try {
  execFileSync(join(ROOT, "node_modules", ".bin", "tsc"), [
    "src/lib/customer-match.ts", "--outDir", out,
    "--module", "esnext", "--target", "es2022", "--moduleResolution", "bundler",
  ], { cwd: ROOT, stdio: "inherit" });
} catch { console.error("Could not compile src/lib/customer-match.ts"); process.exit(1); }
const { normalizeCustomerName, resolveCustomerId, indexCustomers } = await import(join(out, "customer-match.js"));

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

/* ---- Real Postgres, real schema ---------------------------------------- */
const db = await PGlite.create();
await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid language sql stable as $fn$ select null::uuid $fn$;
  create or replace function auth.jwt() returns jsonb language sql stable as $fn$ select null::jsonb $fn$;
`);
for (const r of ["anon", "authenticated", "service_role"]) { try { await db.exec(`create role ${r};`); } catch {} }

const files = [
  join(ROOT, "supabase", "schema.sql"),
  join(ROOT, "supabase", "rls.sql"),
  ...readdirSync(join(ROOT, "supabase")).filter((f) => f.startsWith("migration") && f.endsWith(".sql")).sort().map((f) => join(ROOT, "supabase", f)),
  ...readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => join(ROOT, "supabase", "migrations", f)),
  /*
    seed.sql is NOT picked up by the `migration*` glob above, so until now it
    was never applied by any harness — meaning seed_demo_data(), which the
    "Load a sample dataset" button calls over RPC, went entirely untested. It
    holds only a function definition and comments (no top-level inserts), so
    applying it last is safe and every table it writes to already exists.
  */
  join(ROOT, "supabase", "seed.sql"),
];
const skipped = [];
for (const f of files) {
  try { await db.exec(readFileSync(f, "utf8").replace(/create\s+extension[^;]*;/gi, "")); }
  catch (e) { skipped.push([f.split("/").pop(), String(e.message).split("\n")[0].slice(0, 90)]); }
}

// The migration under test must actually have applied, or every assertion
// below would pass vacuously against a table that never got the column.
const applied = await db.query(`
  select count(*)::int as n from information_schema.columns
   where table_name='sales_orders' and column_name='customer_id'`);
if (!applied.rows[0].n) {
  console.error("\n2026_sales_order_customer_link.sql did not apply — the rest of this suite would be meaningless.");
  for (const [n, why] of skipped) console.error(`  skipped ${n} — ${why}`);
  process.exit(1);
}

const norm = async (v) => (await db.query("select cortex_norm_name($1) as v", [v])).rows[0].v;

/* ======================================================================== */
console.log("\nPARITY: the SQL rule and the TypeScript rule must agree exactly");
/* ======================================================================== */
const INPUTS = [
  "Acme Pvt. Ltd.", "Acme Private Limited", "ACME  PVT   LTD", "acme pvt ltd",
  "Acme Limited", "Acme Ltd", "Acme Ltd.",
  "M/s Acme Traders", "M/S ACME TRADERS", "Acme Traders",
  "Tata & Sons", "Tata and Sons",
  "Reliance Industries Incorporated", "Reliance Industries Inc",
  "Zenith Corporation", "Zenith Corp",
  "Nova Company", "Nova Co",
  "  Leading and trailing  ", "Multiple   inner   spaces",
  "Punctuation!!! ,,, ...", "Hyphen-Ated Name", "Under_score Name",
  "123 Numeric Co", "1private", "private", "Private Acme",
  "", "   ", "!!!", "---", null,
  "Café Ltd", "Ünïcodé Pvt Ltd", "日本 Trading",
  "A", "a.", "  A  ",
];
let parityFails = 0;
for (const input of INPUTS) {
  const sql = await norm(input);
  const ts = normalizeCustomerName(input);
  if (sql !== ts) {
    parityFails++;
    console.log(`  FAIL  ${JSON.stringify(input)} → SQL ${JSON.stringify(sql)} vs TS ${JSON.stringify(ts)}`);
  }
}
if (parityFails === 0) { pass++; console.log(`  ok    all ${INPUTS.length} inputs normalise identically in SQL and TypeScript`); }
else fail += parityFails;

/* ======================================================================== */
console.log("\nThe variants that broke real customers");
/* ======================================================================== */
check("'Acme Pvt. Ltd.' and 'Acme Private Limited' are the SAME customer",
  normalizeCustomerName("Acme Pvt. Ltd.") === normalizeCustomerName("Acme Private Limited"));
check("...and the old rule genuinely did NOT match them (so this fixes something real)",
  "Acme Pvt. Ltd.".trim().toLowerCase() !== "Acme Private Limited".trim().toLowerCase());
check("'M/s Acme Traders' matches 'Acme Traders'",
  normalizeCustomerName("M/s Acme Traders") === normalizeCustomerName("Acme Traders"));
check("'Tata & Sons' matches 'Tata and Sons'",
  normalizeCustomerName("Tata & Sons") === normalizeCustomerName("Tata and Sons"));
check("whitespace and punctuation noise collapses",
  normalizeCustomerName("  ACME   pvt.,  ltd.  ") === normalizeCustomerName("Acme Pvt Ltd"));

console.log("\nThe legal form must NOT be flattened away");
check("'Acme Private Limited' is NOT 'Acme Limited' (different legal entities)",
  normalizeCustomerName("Acme Private Limited") !== normalizeCustomerName("Acme Limited"));
check("'Acme Ltd' is NOT 'Acme Inc'",
  normalizeCustomerName("Acme Ltd") !== normalizeCustomerName("Acme Inc"));
check("an empty-ish name normalises to null, so two blanks never match each other",
  normalizeCustomerName("  ") === null && normalizeCustomerName("!!!") === null && normalizeCustomerName(null) === null);

/* ======================================================================== */
console.log("\nTRIGGER: every writer gets the link, including ones that skip the app");
/* ======================================================================== */
const org = "11111111-1111-1111-1111-111111111111";
const org2 = "22222222-2222-2222-2222-222222222222";
await db.query("insert into organizations (id,name) values ($1,$2),($3,$4)", [org, "Match Co", org2, "Other Co"]);

const cust = async (o, name) =>
  (await db.query("insert into customers (org_id,name) values ($1,$2) returning id", [o, name])).rows[0].id;
const order = async (o, name, amount = 1000, extra = {}) =>
  (await db.query(
    "insert into sales_orders (org_id,customer_name,amount,status,customer_id) values ($1,$2,$3,'won',$4) returning id,customer_id",
    [o, name, amount, extra.customer_id ?? null])).rows[0];

const acme = await cust(org, "Acme Private Limited");

{
  const r = await order(org, "Acme Pvt. Ltd.");
  check("an INSERT links to the customer despite a different spelling", r.customer_id === acme);
}
{
  // This is the case the SQL-only writers hit — a raw insert with no app code.
  const r = await order(org, "  acme   PVT.,  LTD.  ");
  check("...and still links through punctuation and whitespace noise", r.customer_id === acme);
}
{
  const r = await order(org, "Nobody In Particular");
  check("an unknown name links to nothing rather than guessing", r.customer_id === null);
}

console.log("\nTenant isolation");
{
  const r = await order(org2, "Acme Pvt Ltd");
  check("another org's identically-named order does NOT link to this org's customer", r.customer_id === null);
}

console.log("\nAmbiguity must never be guessed at");
{
  const dupOrg = "33333333-3333-3333-3333-333333333333";
  await db.query("insert into organizations (id,name) values ($1,$2)", [dupOrg, "Dup Co"]);
  await cust(dupOrg, "Sharma Traders");
  await cust(dupOrg, "SHARMA  TRADERS");   // same normalised name, different record
  const r = await order(dupOrg, "Sharma Traders");
  check("two customers sharing a name leaves the order UNLINKED, not attributed to one", r.customer_id === null);
}

console.log("\nAn explicit customer_id is never second-guessed");
{
  const other = await cust(org, "Deliberate Choice Ltd");
  const r = await order(org, "Acme Pvt Ltd", 500, { customer_id: other });
  check("a caller-supplied customer_id survives the trigger", r.customer_id === other);
}

console.log("\nOrders imported BEFORE the customer existed get adopted");
{
  const lateOrg = "44444444-4444-4444-4444-444444444444";
  await db.query("insert into organizations (id,name) values ($1,$2)", [lateOrg, "Late Co"]);
  const o1 = await order(lateOrg, "Bharat Steel Pvt. Ltd.");
  check("the order starts unlinked (no customer record yet)", o1.customer_id === null);
  const bharat = await cust(lateOrg, "Bharat Steel Private Limited");
  const after = await db.query("select customer_id from sales_orders where id=$1", [o1.id]);
  check("creating the customer adopts their existing order history", after.rows[0].customer_id === bharat);
}

console.log("\nAdopting must respect ambiguity too");
{
  const ambOrg = "55555555-5555-5555-5555-555555555555";
  await db.query("insert into organizations (id,name) values ($1,$2)", [ambOrg, "Amb Co"]);
  const o1 = await order(ambOrg, "Verma Industries");
  await cust(ambOrg, "Verma Industries");
  const first = await db.query("select customer_id from sales_orders where id=$1", [o1.id]);
  check("one customer adopts the order", first.rows[0].customer_id !== null);
  // A second customer with the same name now appears. The already-made link
  // stands (it was correct when made), but nothing NEW may be adopted blindly.
  await cust(ambOrg, "VERMA  INDUSTRIES.");
  const o2 = await order(ambOrg, "Verma Industries");
  check("a later order under a now-ambiguous name is left unlinked", o2.customer_id === null);
}

/* ======================================================================== */
console.log("\nBACKFILL: existing rows, only where unambiguous");
/* ======================================================================== */
{
  const bfOrg = "66666666-6666-6666-6666-666666666666";
  await db.query("insert into organizations (id,name) values ($1,$2)", [bfOrg, "Backfill Co"]);
  // Bypass the trigger to simulate rows that predate the migration.
  await db.exec("alter table sales_orders disable trigger sales_orders_link_customer");
  await db.exec("alter table customers disable trigger customers_adopt_orders");
  const clean = (await db.query(
    "insert into sales_orders (org_id,customer_name,amount,status) values ($1,'Kumar Exports Pvt Ltd',100,'won') returning id", [bfOrg])).rows[0].id;
  const dup = (await db.query(
    "insert into sales_orders (org_id,customer_name,amount,status) values ($1,'Twin Traders',100,'won') returning id", [bfOrg])).rows[0].id;
  const kumar = await cust(bfOrg, "Kumar Exports Private Limited");
  await cust(bfOrg, "Twin Traders");
  await cust(bfOrg, "twin  traders");
  await db.exec("alter table sales_orders enable trigger sales_orders_link_customer");
  await db.exec("alter table customers enable trigger customers_adopt_orders");

  check("pre-migration rows really did start unlinked",
    (await db.query("select customer_id from sales_orders where id=$1", [clean])).rows[0].customer_id === null);

  // The exact backfill statement from the migration.
  await db.exec(`
    with matches as (
      select o.id as order_id, min(c.id::text)::uuid as customer_id, count(distinct c.id) as candidates
        from sales_orders o
        join customers c on c.org_id = o.org_id
         and cortex_norm_name(c.name) = cortex_norm_name(o.customer_name)
       where o.customer_id is null and cortex_norm_name(o.customer_name) is not null
       group by o.id
    )
    update sales_orders o set customer_id = m.customer_id
      from matches m where m.order_id = o.id and m.candidates = 1;`);

  check("the backfill links the unambiguous row across a spelling difference",
    (await db.query("select customer_id from sales_orders where id=$1", [clean])).rows[0].customer_id === kumar);
  check("the backfill leaves the ambiguous row NULL rather than picking one",
    (await db.query("select customer_id from sales_orders where id=$1", [dup])).rows[0].customer_id === null);
}

/* ======================================================================== */
console.log("\nresolveCustomerId reports ambiguity instead of returning a winner");
/* ======================================================================== */
{
  const idx = indexCustomers([
    { id: "a", name: "Acme Private Limited" },
    { id: "b", name: "Zenith Corp" },
    { id: "c", name: "ZENITH  CORPORATION" },
  ]);
  check("a unique name resolves", resolveCustomerId(idx, "acme pvt. ltd.").status === "matched");
  check("a duplicated name is reported ambiguous", resolveCustomerId(idx, "Zenith Corp").status === "ambiguous");
  check("...and carries both candidates so a human can fix it",
    resolveCustomerId(idx, "Zenith Corp").candidates?.length === 2);
  check("an unknown name resolves to none", resolveCustomerId(idx, "Someone Else").status === "none");
  check("a blank name resolves to none, never to a blank-named customer",
    resolveCustomerId(idx, "   ").status === "none");
}

/* ======================================================================== */
console.log("\nSAMPLE DATASET: the button promises to fill EVERY module");
/* ======================================================================== */
{
  /*
    seed_demo_data created 60 orders naming six buyers and zero customer rows,
    so /customers, /rfm and /churn stayed empty behind a button whose text is
    "Fill every module with a realistic example business" — three of the
    modules a prospect is most likely to open. The sample data also contradicted
    itself, naming buyers that existed nowhere as contacts.
  */
  const demoOrg = "77777777-7777-7777-7777-777777777777";
  await db.query("insert into organizations (id,name) values ($1,$2)", [demoOrg, "Demo Co"]);

  /*
    A MEMBERSHIP, and a signed-in user.

    seed_demo_data() is SECURITY DEFINER and takes the workspace as a parameter.
    It used to check nothing at all, which meant anyone holding the public anon
    key could rewrite a stranger's dashboard — see
    2026_seed_rpc_lockdown.sql. It now requires the caller to be a member with
    write rank, so this harness has to model a real owner seeding their OWN
    workspace rather than an anonymous call into an arbitrary org id.

    This test failed the moment that guard landed, which is the guard working:
    the previous setup was only ever valid because the hole existed.
  */
  const demoUser = "88888888-8888-8888-8888-888888888888";
  /*
    Triggers off for this insert. 2026_signup_trigger.sql fires on auth.users to
    provision a workspace for a brand-new signup — correct in production, wrong
    here, where the workspace already exists and we only need the row the
    memberships FK points at.
  */
  await db.exec("alter table auth.users disable trigger all");
  await db.query("insert into auth.users (id,email) values ($1,'owner@demo.test')", [demoUser]);
  await db.exec("alter table auth.users enable trigger all");
  await db.query("insert into memberships (user_id,org_id,role) values ($1,$2,'owner')", [demoUser, demoOrg]);
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $fn$ select '${demoUser}'::uuid $fn$;`);

  let seeded = true;
  try {
    await db.query("select seed_demo_data($1::uuid)", [demoOrg]);
    await db.query("select seed_demo_customers($1::uuid)", [demoOrg]);
  } catch (e) {
    seeded = false;
    console.log(`  FAIL  the sample dataset could not be seeded — ${String(e.message).split("\n")[0].slice(0, 90)}`);
    fail++;
  }

  if (seeded) {
    const cust = await db.query("select count(*)::int n from customers where org_id=$1 and is_demo", [demoOrg]);
    check("the sample dataset now creates customer records at all", cust.rows[0].n > 0);

    const orders = await db.query("select count(*)::int n from sales_orders where org_id=$1 and is_demo", [demoOrg]);
    const linked = await db.query("select count(*)::int n from sales_orders where org_id=$1 and is_demo and customer_id is not null", [demoOrg]);
    check("the sample orders were created", orders.rows[0].n > 0);
    check("...and EVERY one is attached to a sample customer", linked.rows[0].n === orders.rows[0].n);

    // The demo doubles as a live test of the matcher: "M/s Metro Mart" is how
    // an Indian invoice writes it, and must still find orders booked as
    // "Metro Mart".
    const metro = await db.query(`
      select count(*)::int n from sales_orders o
        join customers c on c.id = o.customer_id
       where o.org_id = $1 and c.name = 'M/s Metro Mart' and o.customer_name = 'Metro Mart'`, [demoOrg]);
    check("'M/s Metro Mart' picks up orders booked as 'Metro Mart'", metro.rows[0].n > 0);

    // Every sample row must be removable, or the seeder leaves permanent
    // contamination — the bug 2026_demo_isolation.sql exists to prevent, which
    // customers was originally left out of.
    const notDemo = await db.query("select count(*)::int n from customers where org_id=$1 and not is_demo", [demoOrg]);
    check("no sample customer is left untagged (so 'Remove sample data' can clear it)", notDemo.rows[0].n === 0);

    await db.query("delete from sales_orders where org_id=$1 and is_demo", [demoOrg]);
    await db.query("delete from customers where org_id=$1 and is_demo", [demoOrg]);
    const after = await db.query("select count(*)::int n from customers where org_id=$1", [demoOrg]);
    check("removing the sample data leaves no customers behind", after.rows[0].n === 0);

    // Re-seeding must replace, not duplicate.
    await db.query("select seed_demo_customers($1::uuid)", [demoOrg]);
    await db.query("select seed_demo_customers($1::uuid)", [demoOrg]);
    const twice = await db.query("select count(*)::int n from customers where org_id=$1 and is_demo", [demoOrg]);
    check("seeding twice replaces rather than duplicates", twice.rows[0].n === 6);
  }
}

console.log("");
if (fail) { console.log(`${fail} FAILED, ${pass} passed\n`); process.exit(1); }
console.log(`all ${pass} passed\n`);
