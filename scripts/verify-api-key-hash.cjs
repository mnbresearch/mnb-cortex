/* The API-key migration, executed: existing keys must keep working, the
   plaintext must be gone, and a wrong key must still be rejected. */
const path=require("path"), fs=require("fs"), crypto=require("crypto");
const R=process.env.CORTEX_ROOT||path.resolve("/sessions/brave-relaxed-feynman/mnt/mnb-cortex");
const {PGlite}=require(path.join(R,"node_modules/@electric-sql/pglite"));
const sha=(s)=>crypto.createHash("sha256").update(s).digest("hex");
(async()=>{
  const db=new PGlite();
  await db.exec(`
    create table organizations(id uuid primary key default gen_random_uuid(), name text);
    create table api_keys(id uuid primary key default gen_random_uuid(),
      org_id uuid not null references organizations(id) on delete cascade,
      label text, key text unique not null, created_at timestamptz default now());
    create table health_metrics(org_id uuid, metric_key text, label text, value numeric, unit text, delta_pct numeric, status text);
    create table sales_orders(org_id uuid, order_no text, customer_name text, region text, product text, amount numeric, status text, order_date date);
    create table invoices(org_id uuid, invoice_no text, party text, amount numeric, status text, type text, due_date date);
    create table inventory_items(org_id uuid, sku text, name text, category text, on_hand numeric, reorder_level numeric, unit_cost numeric, supplier text);
    create table customers(org_id uuid, name text, company text, email text, phone text, status text, value numeric);
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;`);

  const {rows:[org]}=await db.query(`insert into organizations(name) values('Acme') returning id`);
  const LEGACY="mnb_"+"a".repeat(64);
  await db.query(`insert into api_keys(org_id,label,key) values($1,'legacy',$2)`,[org.id,LEGACY]);
  await db.query(`insert into health_metrics values($1,'revenue','Revenue',100,'INR',5,'good')`,[org.id]);

  const sql=fs.readFileSync(path.join(R,"supabase/migrations/2026_zzze_api_key_hash.sql"),"utf8");
  const ddl=sql.slice(0, sql.indexOf("/* ---------------------------------------------------------------- verify"));
  await db.exec(ddl);

  const fail=[];
  const ok=(c,n)=>{ if(!c) fail.push(n); };

  // 1. an EXISTING key still authenticates
  const r1=await db.query(`select api_ingest($1,'invoices','[{"invoice_no":"I-1","amount":500}]'::jsonb) as r`,[LEGACY]);
  ok(r1.rows[0].r.ok===true, "legacy key still ingests: "+JSON.stringify(r1.rows[0].r));
  const r2=await db.query(`select api_metrics($1) as r`,[LEGACY]);
  ok(r2.rows[0].r.ok===true, "legacy key still reads metrics");

  // 2. the plaintext is GONE
  const {rows:[p]}=await db.query(`select count(*)::int n from api_keys where key is not null`);
  ok(p.n===0, "plaintext remaining: "+p.n);
  const {rows:[h]}=await db.query(`select key_hash, key_prefix from api_keys limit 1`);
  ok(h.key_hash===sha(LEGACY), "hash matches sha256 of the plaintext");
  ok(h.key_prefix===LEGACY.slice(0,12), "prefix kept for identification: "+h.key_prefix);

  // 3. a wrong key is still refused
  const r3=await db.query(`select api_ingest($1,'invoices','[]'::jsonb) as r`,["mnb_wrong"]);
  ok(r3.rows[0].r.ok===false, "a wrong key is refused");
  const r4=await db.query(`select api_ingest($1,'organizations','[]'::jsonb) as r`,[LEGACY]);
  ok(r4.rows[0].r.ok===false, "a non-whitelisted table is refused");

  // 4. rows landed in the KEY'S org, not one the caller chose
  const {rows:[inv]}=await db.query(`select org_id from invoices limit 1`);
  ok(inv.org_id===org.id, "ingested row is forced into the key's own org");

  // 5. idempotent
  await db.exec(ddl);
  const {rows:[p2]}=await db.query(`select count(*)::int n from api_keys where key is not null`);
  ok(p2.n===0, "still no plaintext after a second run");

  console.log(fail.length? "FAILED:\n  "+fail.join("\n  ") : "OK — legacy keys work, plaintext gone, wrong keys refused, org forced.");
  if(fail.length) process.exit(1);
})().catch(e=>{console.error("harness error:",e.message);process.exit(1)});
