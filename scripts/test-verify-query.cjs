/*
  Proves supabase/VERIFY-state.sql can actually FAIL.

  A verification query is the last thing anyone checks and the first thing
  nobody re-reads. If one of its CASE arms is wrong, it reports OK forever and
  is worse than having no check at all — this repo has already produced four
  tests that could not fail, and one of them was hiding a live cross-tenant
  read for weeks.

  So the query is executed against real Postgres twice: once over a schema
  where everything is correct, and once (MUTATE=1) with the bugs deliberately
  put back — the cortex_aggregate grant restored, an unrevoked definer function
  added, and the cash rule set to 30. The checks that should flip must flip.

  Run:  node scripts/test-verify-query.cjs
        MUTATE=1 node scripts/test-verify-query.cjs
*/
const path=require("path");const ROOT="/sessions/brave-relaxed-feynman/mnt/mnb-cortex";
const {PGlite}=require(path.join(ROOT,"node_modules/@electric-sql/pglite"));const fs=require("fs");
(async()=>{const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
 create table organizations(id uuid primary key default gen_random_uuid(), name text);
 create table alert_rules(id serial primary key, org_id uuid, metric_key text, op text, threshold numeric);
 create table weekly_plan_sends(org_id uuid, wk date, primary key(org_id,wk));
 create table health_metrics(id serial primary key, org_id uuid, updated_at timestamptz default now());
 create table collection_policies(org_id uuid primary key, reply_to text);
 create function cortex_aggregate(p uuid) returns jsonb language sql security definer as $q$ select '{}'::jsonb $q$;
 create table kpi(is_demo boolean default false);
 create function public_report(t text) returns jsonb language sql security definer as $q$ select '{}'::jsonb from kpi where coalesce(is_demo, false) = false $q$;
 create function cortex_seed_default_alert_rules() returns trigger language plpgsql as $q$ begin
   insert into alert_rules (org_id, metric_key, op, threshold)
   values (new.id, 'receivables', '>', 500000),
          (new.id, 'risk',        '>', 60),
          (new.id, 'cash',        '<', 3); return new; end $q$;
 create function cortex_touch_updated_at() returns trigger language plpgsql as $q$ begin new.updated_at=now(); return new; end $q$;
 create trigger trg_health_metrics_touch before update on health_metrics for each row execute function cortex_touch_updated_at();
 revoke execute on function public.cortex_aggregate(uuid) from public, anon, authenticated;`);
if (process.env.MUTATE === "1") {
  // Put the bug back: re-grant, and add an unrelated definer function nobody revoked.
  await db.exec(`grant execute on function public.cortex_aggregate(uuid) to authenticated;
    create function some_new_definer_fn(p uuid) returns void language plpgsql security definer as $q$ begin end $q$;
    grant execute on function public.some_new_definer_fn(uuid) to authenticated;
    update alert_rules set threshold = 30 where metric_key='cash';
    insert into alert_rules(org_id, metric_key, op, threshold) values (gen_random_uuid(),'cash','<',30);`);
}
try{ const r=await db.query(fs.readFileSync("/tmp/vq/verify.sql","utf8"));
  console.table(r.rows.map(x=>({n:x["#"],check:x.check_name,result:x.result})));
  console.log("\nQUERY PARSES AND RUNS. Rows returned:", r.rows.length);
}catch(e){ console.log("SYNTAX ERROR ->", e.message); process.exit(1); }
})();
