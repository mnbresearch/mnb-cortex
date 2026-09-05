/**
 * The three RLS privilege holes, proven against real Postgres.
 *
 * WHY THESE NEEDED A DATABASE AND NOT A GREP.
 *
 * All three are about what a POLICY permits, which is a property of the running
 * database, not of the text of a file. Reading the SQL is how they survived: on
 * the page, `with check (user_org_rank(org_id) >= 2)` looks like a tenancy
 * check, and it is one — it just does not constrain any column other than
 * org_id, which is the whole bug.
 *
 * So this stands up a Postgres with the OLD policies, performs each attack as
 * the actual Postgres role a real attacker would hold, applies the migration,
 * and performs them again.
 *
 * THE THREE HOLES.
 *
 * 1. `invites` was in the generic tenant-policy loop, so an analyst could
 *    INSERT an invite with role='owner' straight through PostgREST. The app
 *    requires admin; PostgREST does not go through the app. Accept the invite
 *    and claimInvites() writes a membership with that role verbatim.
 *
 * 2. `api_keys` and `webhook_endpoints` were readable by every member. A
 *    `viewer` — the role given to accountants, interns and, in Practice mode,
 *    clients — could read the plaintext API key (which api_ingest authorises on
 *    alone, so: write access) and the webhook HMAC secret (so: forge events the
 *    customer's own systems verify as ours).
 *
 * 3. `anon insert leads` was `with check (true)`, so an anonymous caller could
 *    write rows into any workspace's Leads screen.
 *
 * THE THING THIS TEST GUARDS THAT MATTERS MOST.
 *
 * The LEGITIMATE USE block. Tightening RLS is easy; tightening it without
 * locking out the people who are supposed to be there is the hard part, and
 * getting that wrong is worse than the original bug. An admin must still
 * invite, an admin must still read the API key, and the public website form
 * must still capture a lead anonymously.
 */

const {PGlite}=require("/sessions/brave-relaxed-feynman/mnt/mnb-cortex/node_modules/@electric-sql/pglite");
const fs=require("fs");
const M="/sessions/brave-relaxed-feynman/mnt/mnb-cortex/supabase/migrations/2026_rls_privilege_fix.sql";
(async()=>{const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
 grant usage on schema public to anon, authenticated;
 create type member_role as enum ('viewer','analyst','manager','admin','owner');
 create table organizations(id uuid primary key default gen_random_uuid(), name text);
 create table memberships(user_id uuid, org_id uuid, role member_role);
 create table invites(id uuid primary key default gen_random_uuid(), org_id uuid, email text, role member_role, status text);
 create table api_keys(id uuid primary key default gen_random_uuid(), org_id uuid, key text, label text);
 create table webhook_endpoints(id uuid primary key default gen_random_uuid(), org_id uuid, url text, secret text);
 create table leads(id uuid primary key default gen_random_uuid(), org_id uuid, name text);
 create schema if not exists auth;
 create or replace function auth.uid() returns uuid language sql stable as $$
   select nullif(current_setting('app.uid',true),'')::uuid $$;
 -- SECURITY DEFINER, exactly as 2026_tenancy.sql defines them: without it the
 -- helpers re-enter memberships' own RLS policy and recurse.
 create or replace function user_org_ids() returns setof uuid
   language sql stable security definer set search_path=public as $$
   select org_id from memberships where user_id = auth.uid() $$;
 create or replace function user_org_rank(p uuid) returns int
   language sql stable security definer set search_path=public as $$
   select coalesce((select case role when 'owner' then 5 when 'admin' then 4 when 'manager' then 3
     when 'analyst' then 2 else 1 end from memberships where org_id=p and user_id=auth.uid() limit 1),0) $$;
 grant execute on function user_org_ids, user_org_rank to anon, authenticated;
 grant execute on function auth.uid to anon, authenticated;
 grant usage on schema auth to anon, authenticated;
 grant all on all tables in schema public to anon, authenticated;`);
for (const t of ["invites","api_keys","webhook_endpoints"]) {
  await db.exec(`alter table ${t} enable row level security;
   create policy "tenant read ${t}" on ${t} for select using (org_id in (select user_org_ids()));
   create policy "tenant insert ${t}" on ${t} for insert with check (user_org_rank(org_id) >= 2);
   create policy "tenant update ${t}" on ${t} for update using (user_org_rank(org_id) >= 2) with check (user_org_rank(org_id) >= 2);
   create policy "tenant delete ${t}" on ${t} for delete using (user_org_rank(org_id) >= 2);`); }
await db.exec(`alter table leads enable row level security;
 create policy "anon insert leads" on leads for insert to anon with check (true);`);
await db.exec(`alter table memberships enable row level security;
 create policy "admins manage members" on memberships for all using (user_org_rank(org_id) >= 4);`);
const org=(await db.query("insert into organizations (name) values ('Acme') returning id")).rows[0].id;
const A="22222222-2222-2222-2222-222222222222", V="33333333-3333-3333-3333-333333333333",
      AD="44444444-4444-4444-4444-444444444444", OW="55555555-5555-5555-5555-555555555555";
await db.query("insert into memberships (user_id,org_id,role) values ($1,$2,'analyst'),($3,$2,'viewer'),($4,$2,'admin'),($5,$2,'owner')",[A,org,V,AD,OW]);
await db.query("insert into api_keys (org_id,key) values ($1,'mnb_supersecret')",[org]);
await db.query("insert into webhook_endpoints (org_id,url,secret) values ($1,'https://x','hmac_secret')",[org]);
const as=async(uid,role,sql,params=[])=>{ await db.exec(`set role ${role}`);
  await db.query(`select set_config('app.uid',$1,false)`,[uid||""]);
  try{ const r=await db.query(sql,params); await db.exec("reset role"); return {ok:true,n:r.rows.length}; }
  catch(e){ await db.exec("reset role"); return {ok:false,err:e.message}; } };
// sanity: the harness must actually be applying the uid, or every check below
// is trivially "blocked" and proves nothing.
{ await db.exec("set role authenticated");
  await db.query("select set_config('app.uid',$1,false)",[A]);
  const r=await db.query("select auth.uid() u, user_org_rank($1) rank",[org]);
  await db.exec("reset role");
  console.log(`  [harness] uid=${r.rows[0].u} rank=${r.rows[0].rank} (analyst must be 2)`);
  if (Number(r.rows[0].rank)!==2) { console.log("  >>> HARNESS BROKEN"); process.exit(1); } }
const dbg=(l,r)=>console.log(`      [dbg] ${l}: ok=${r.ok} n=${r.n} err=${(r.err||'').slice(0,90)}`);
let bad=0;
// An INSERT that does not throw counts as ALLOWED even though it returns no
// rows; a SELECT counts as allowed only if it actually returned something.
// Getting this backwards made four genuinely-vulnerable BEFORE cases look safe.
let phase = "after";
const show=(label,r,shouldBlock,isSelect=false)=>{
  const allowed = isSelect ? (r.ok && r.n > 0) : r.ok;
  /*
    In the BEFORE phase the expectation is INVERTED. Every one of those calls
    must succeed, because that is the vulnerability. If a BEFORE check starts
    passing, the fixture has stopped reproducing the bug and every AFTER check
    below it is vacuous — so that has to fail loudly rather than look clean.
  */
  const good = phase === "before" ? allowed : (shouldBlock ? !allowed : allowed);
  if(!good) bad++;
  console.log(`  ${good?"  ok  ":"  !!  "} ${allowed?"ALLOWED":"blocked"}: ${label}${good?"":"   <-- WRONG"}`); };
phase = "before"; console.log("BEFORE the fix — each of these MUST reproduce, or the AFTER checks prove nothing:");
show("analyst inserts an OWNER invite", await as(A,"authenticated","insert into invites (org_id,email,role,status) values ($1,'x@y.z','owner','pending')",[org]), true);
show("viewer reads the API key", await as(V,"authenticated","select key from api_keys where org_id=$1",[org]), true, true);
show("viewer reads the webhook secret", await as(V,"authenticated","select secret from webhook_endpoints where org_id=$1",[org]), true, true);
show("anon writes into a victim org", await as("","anon","insert into leads (org_id,name) values ($1,'spam')",[org]), true);
const sql=fs.readFileSync(M,"utf8");
await db.exec(sql); await db.exec(sql);
phase = "after"; console.log("\nAFTER (migration applied twice):");
show("analyst inserts an OWNER invite", await as(A,"authenticated","insert into invites (org_id,email,role,status) values ($1,'x2@y.z','owner','pending')",[org]), true);
show("analyst inserts ANY invite",      await as(A,"authenticated","insert into invites (org_id,email,role,status) values ($1,'x3@y.z','viewer','pending')",[org]), true);
show("viewer reads the API key",        await as(V,"authenticated","select key from api_keys where org_id=$1",[org]), true, true);
show("viewer reads the webhook secret", await as(V,"authenticated","select secret from webhook_endpoints where org_id=$1",[org]), true, true);
show("admin promotes self to owner",    await as(AD,"authenticated","update memberships set role='owner' where user_id=$1 and org_id=$2",[AD,org]), true);
show("anon writes into a victim org",   await as("","anon","insert into leads (org_id,name) values ($1,'spam')",[org]), true);
console.log("\nLEGITIMATE USE must still work:");
show("admin invites an analyst",  await as(AD,"authenticated","insert into invites (org_id,email,role,status) values ($1,'a@y.z','analyst','pending')",[org]), false);
show("admin invites an OWNER",    await as(AD,"authenticated","insert into invites (org_id,email,role,status) values ($1,'b@y.z','owner','pending')",[org]), true);
show("owner invites an owner",    await as(OW,"authenticated","insert into invites (org_id,email,role,status) values ($1,'c@y.z','owner','pending')",[org]), false);
show("admin reads the API key",   await as(AD,"authenticated","select key from api_keys where org_id=$1",[org]), false, true);
show("anon submits a public lead (org_id null)", await as("","anon","insert into leads (org_id,name) values (null,'web form')"), false);
console.log(bad ? `\n>>> ${bad} WRONG` : "\n>>> all correct: 4 holes reproduced before, all closed after, legitimate use unaffected");
process.exit(bad?1:0);
})().catch(e=>{console.error("ERR",e.message);process.exit(1)});
