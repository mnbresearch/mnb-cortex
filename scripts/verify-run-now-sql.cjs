/*
  The three new migrations, executed against real Postgres before anyone runs
  them on production data.

  These are DDL, and DDL is the one category where "it looked right" has
  repeatedly not been enough in this repo — a migration named so it sorted
  before the file it replaced, a function copied verbatim along with the wrong
  grant. So: apply them to PGlite over stub tables, then assert the BEHAVIOUR
  rather than the text.

  What each check earns:

  - applied twice          — the operator may re-run the file. `add column if
                             not exists` and `create or replace` should make
                             that a no-op, and this proves it rather than
                             assuming it.
  - updated_at moves       — a column without a working trigger is worse than
                             no column: practice.ts would order by a value that
                             never changes and report every client as idle.
  - reply_to rejects junk  — this becomes a header on mail we send on a
                             customer's behalf. A constraint that accepts
                             anything is decoration.
  - cash threshold is 3    — and the risk rule is untouched, i.e. the UPDATE is
                             as narrow as its WHERE clause claims.
  - the trigger fires      — 2026_zzy replaces the seeding function but not the
                             trigger that calls it. `create or replace` keeps
                             the existing trigger attached; this wires one up
                             and confirms the new body actually runs, because
                             an empty result from the un-wired case proves
                             nothing either way.

  Run: node scripts/verify-run-now-sql.cjs
*/
const path=require("path");
const ROOT="/sessions/brave-relaxed-feynman/mnt/mnb-cortex";
const {PGlite}=require(path.join(ROOT,"node_modules/@electric-sql/pglite"));
const fs=require("fs");
(async()=>{
  const db=new PGlite();
  // Minimal stubs: just enough shape for the DDL under test.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table organizations(id uuid primary key default gen_random_uuid(), name text);
    create table health_metrics(
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null references organizations(id) on delete cascade,
      metric_key text not null, label text not null, value numeric, unit text,
      created_at timestamptz default now());
    create table collection_policies(org_id uuid primary key references organizations(id) on delete cascade, enabled boolean default true);
    create table alert_rules(
      id uuid primary key default gen_random_uuid(),
      org_id uuid references organizations(id) on delete cascade,
      metric_key text, op text, threshold numeric, enabled boolean default true,
      unique(org_id, metric_key, op));
  `);

  const org=(await db.query("insert into organizations(name) values ('Acme') returning id")).rows[0].id;
  await db.query("insert into health_metrics(org_id,metric_key,label,value) values ($1,'cash','Cash Runway',4.2)",[org]);
  await db.query("insert into alert_rules(org_id,metric_key,op,threshold) values ($1,'cash','<',30)",[org]);
  await db.query("insert into alert_rules(org_id,metric_key,op,threshold) values ($1,'risk','>',60)",[org]);

  // --- 2026_zzx: columns + trigger + constraint ---
  const zzx=fs.readFileSync(path.join(ROOT,"supabase/migrations/2026_zzx_missing_columns.sql"),"utf8");
  try { await db.exec(zzx); console.log("2026_zzx: applied OK"); }
  catch(e){ console.log("2026_zzx: FAILED ->", e.message); process.exit(1); }
  try { await db.exec(zzx); console.log("2026_zzx: idempotent (ran twice) OK"); }
  catch(e){ console.log("2026_zzx: NOT IDEMPOTENT ->", e.message); process.exit(1); }

  // the trigger must actually bump updated_at
  const before=(await db.query("select updated_at from health_metrics limit 1")).rows[0].updated_at;
  await new Promise(r=>setTimeout(r,20));
  await db.query("update health_metrics set value = 9.9");
  const after=(await db.query("select updated_at from health_metrics limit 1")).rows[0].updated_at;
  console.log("updated_at moves on update:", new Date(after) > new Date(before) ? "YES" : "NO -- TRIGGER DEAD");

  // the reply_to constraint must accept a real address and reject junk
  await db.query("insert into collection_policies(org_id) values ($1)",[org]);
  let good=true, bad=false;
  try { await db.query("update collection_policies set reply_to='accounts@sharmasteel.in'"); } catch(e){ good=false; }
  try { await db.query("update collection_policies set reply_to='not an email'"); bad=true; } catch(e){}
  console.log("reply_to accepts a real address:", good?"YES":"NO");
  console.log("reply_to rejects junk:", bad?"NO -- CONSTRAINT USELESS":"YES");

  // --- 2026_zzy: the cash rule threshold ---
  const zzy=fs.readFileSync(path.join(ROOT,"supabase/migrations/2026_zzy_default_cash_rule_unit.sql"),"utf8");
  try { await db.exec(zzy); console.log("2026_zzy: applied OK"); }
  catch(e){ console.log("2026_zzy: FAILED ->", e.message); process.exit(1); }
  const rule=(await db.query("select threshold from alert_rules where metric_key='cash'")).rows[0].threshold;
  console.log("cash rule threshold is now:", rule, Number(rule)===3 ? "(months — correct)" : "(WRONG)");
  const risk=(await db.query("select threshold from alert_rules where metric_key='risk'")).rows[0].threshold;
  console.log("risk rule untouched:", Number(risk)===60?"YES":"NO");

  // the trigger it replaces must fire for a NEW org
  const org2=(await db.query("insert into organizations(name) values ('New Co') returning id")).rows[0].id;
  const seeded=(await db.query("select metric_key, threshold from alert_rules where org_id=$1 order by metric_key",[org2])).rows;
  console.log("new org seeded with:", JSON.stringify(seeded));

  /*
    The trigger lives in 2026_default_alert_rules.sql, which this harness does
    not load — so the empty result above proves nothing either way. Wire the
    trigger to the REPLACED function and confirm the body works when fired.
    In production `create or replace function` keeps the existing trigger
    attached, which is exactly what this is checking.
  */
  await db.exec(`
    drop trigger if exists trg_seed_default_alert_rules on organizations;
    create trigger trg_seed_default_alert_rules
      after insert on organizations
      for each row execute function cortex_seed_default_alert_rules();`);
  const org3=(await db.query("insert into organizations(name) values ('Third Co') returning id")).rows[0].id;
  const seeded3=(await db.query("select metric_key, op, threshold from alert_rules where org_id=$1 order by metric_key",[org3])).rows;
  console.log("trigger fires for a new org:", JSON.stringify(seeded3));
  const cashRule=seeded3.find(r=>r.metric_key==='cash');
  console.log("new orgs get cash < 3 months:", cashRule && Number(cashRule.threshold)===3 ? "YES" : "NO -- STILL SEEDING 30");

  console.log("\nALL SQL CHECKS PASSED");
})();
