/* ===========================================================================
   MNB CORTEX — RUN THIS, IN THIS ORDER, 8 September 2026
   Commit cc79a23

   Paste the WHOLE FILE into the Supabase SQL editor and run it once.

   Safe to run twice. Every statement is either `create or replace`, an
   `add column if not exists`, a narrow `update ... where`, or a revoke —
   nothing here deletes a row and nothing depends on being run only once.

   STEP 1 IS THE URGENT ONE. If you run nothing else today, run step 1.

   Each step ends with a verification query. Read them. Where a step says
   "expect zero rows", a row means that step did not do its job — tell me the
   output rather than assuming it worked.
   =========================================================================== */


/* ===========================================================================
   STEP 1 — CLOSE THE CROSS-TENANT READ.  <-- THE URGENT ONE

   cortex_aggregate() is SECURITY DEFINER, takes the org id as a PARAMETER, and
   checks no membership. Granted to `authenticated`, PostgREST publishes it at
   /rest/v1/rpc/cortex_aggregate to anyone with a free account: post another
   workspace's UUID and you get that business's twelve months of revenue,
   receivables, payables, stock value, headcount and TOTAL MONTHLY PAYROLL,
   with RLS bypassed.

   Org UUIDs are not secret — the org switcher and the Practice console send
   them to the browser as props. So this also defeats revocation: remove a
   departing employee's or a fired accountant's membership and every other path
   locks them out correctly, but they kept the UUID and this function never
   asked.

   Nothing legitimate needs the grant. lib/metrics.ts is the only caller and it
   uses the service-role client.

   These two lines are independent of everything below. Run them first.
   =========================================================================== */

revoke execute on function public.cortex_aggregate(uuid) from public, anon, authenticated;
grant  execute on function public.cortex_aggregate(uuid) to service_role;

-- Verify. Expect ZERO rows. A row means `authenticated` can still call it.
select 'STEP 1' as step, p.proname, 'STILL REACHABLE' as problem
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'cortex_aggregate'
   and (has_function_privilege('anon', p.oid, 'execute')
     or has_function_privilege('authenticated', p.oid, 'execute'));



/* ===========================================================================
   STEP 2 — THE CORRECTNESS FIXES (was already outstanding)
   Source: supabase/RUN-correctness-fixes.sql

   This was outstanding before today. It replaces cortex_aggregate with the
   IST-overdue version and applies the share-link and upsert corrections.

   Its grant line is the one that caused step 1: it used to end with
   `grant execute ... to authenticated`. That line is now a revoke, so running
   this file no longer reopens the hole. Step 1 first anyway, so the hole is
   shut even if this step fails.
   =========================================================================== */

/* ===========================================================================
   RUN THIS IN THE SUPABASE SQL EDITOR.

   Two function replacements. No data is touched, nothing is dropped, and
   running it twice is harmless.

   1. public_report()    — the public share link stops publishing sample data.
   2. cortex_aggregate() — the overdue cutoff becomes IST, matching the app.

   Both are `create or replace`, so they take effect immediately for every
   workspace. Until you run this, the app keeps working exactly as it does now.
   =========================================================================== */


/* ---------------------------------------------------------------------------
   1. THE SHARE LINK MUST NOT PUBLISH SAMPLE DATA

   /r/<token> renders "<Your Company> — Business Snapshot" and is meant to be
   sent to a banker, an investor or a buyer. It had no is_demo filter and no
   date, so a workspace that had clicked "Load a sample dataset" — the first
   thing a new customer is invited to do — could share a link showing ₹4.25 Cr
   revenue and ₹51 L net profit under its own name, indistinguishable from
   live figures.

   Also fixed: `limit 4` on the insights was applied to the aggregate's single
   output row rather than to the rows going into it, so every insight was
   published rather than four.
--------------------------------------------------------------------------- */

create or replace function public.public_report(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_metrics jsonb; v_insights jsonb; v_as_of date;
begin
  select org_id into v_org from report_links where token = p_token;
  if v_org is null then return jsonb_build_object('ok', false); end if;
  select name into v_name from organizations where id = v_org;

  /* coalesce(): rows written before is_demo existed are NULL, and NULL is not
     false. Those predate the sample dataset, so "real" is the correct reading
     — treating unknown provenance as demo would blank genuine snapshots. */
  select jsonb_agg(jsonb_build_object(
           'label', label, 'value', value, 'unit', unit,
           'delta_pct', delta_pct, 'status', status, 'as_of', as_of))
    into v_metrics
    from health_metrics
   where org_id = v_org and coalesce(is_demo, false) = false;

  select max(as_of) into v_as_of
    from health_metrics
   where org_id = v_org and coalesce(is_demo, false) = false;

  select jsonb_agg(jsonb_build_object('title', title, 'detail', detail, 'severity', severity))
    into v_insights
    from (
      select title, detail, severity
        from ai_insights
       where org_id = v_org and coalesce(is_demo, false) = false
       order by created_at desc
       limit 4
    ) i;

  return jsonb_build_object(
    'ok', true,
    'company', coalesce(v_name, 'Company'),
    'as_of', v_as_of,
    'metrics', coalesce(v_metrics, '[]'::jsonb),
    'insights', coalesce(v_insights, '[]'::jsonb));
end $$;

grant execute on function public.public_report(text) to anon, authenticated;


/* ---------------------------------------------------------------------------
   2. THE OVERDUE CUTOFF MUST BE IST

   lib/metrics.ts computes "today" in Asia/Kolkata. This function computed it
   in UTC. Between 18:30 and 24:00 UTC — which is 00:00 to 05:30 IST, the small
   hours of the next day for every customer this product has — those two dates
   differ by one, so an invoice due today counted as overdue on one path and
   not the other.

   Everything except that one line is copied verbatim from
   2026_tenancy_aggregate.sql. The pinned `set timezone = 'UTC'` stays: it
   governs how orders bucket into months, which must remain UTC to match the
   TypeScript. `now() at time zone 'Asia/Kolkata'` is explicit about its own
   conversion and is unaffected by that pin.
--------------------------------------------------------------------------- */

create or replace function public.cortex_aggregate(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set timezone = 'UTC'
as $$
with
  buckets as (
    select (date_trunc('month', (now() at time zone 'utc')) - (i || ' months')::interval)::date as period
    from generate_series(11, 0, -1) i
  ),
  orders as (
    select
      date_trunc('month', coalesce(o.order_date, o.created_at))::date as period,
      lower(coalesce(o.status, '')) as status,
      coalesce(o.amount, 0) as amount
    from sales_orders o
    where o.org_id = p_org
  ),
  orders_windowed as (
    select * from orders
    where period in (select period from buckets)
      and status <> 'lost'
  ),
  revenue_by_month as (
    select b.period,
           coalesce(sum(o.amount) filter (where o.status = 'won'), 0) as revenue,
           coalesce(count(o.*), 0) as orders
    from buckets b
    left join orders_windowed o on o.period = b.period
    group by b.period
  ),
  inv as (
    select
      lower(coalesce(i.status, 'pending')) as status,
      lower(coalesce(i.type, 'receivable')) as type,
      coalesce(i.amount, 0) as amount,
      i.due_date
    from invoices i
    where i.org_id = p_org
  ),
  po as (
    select coalesce(p.amount, 0) as amount
    from purchase_orders p
    where p.org_id = p_org
      and lower(coalesce(p.status, '')) in ('sent', 'received', 'approved')
  ),
  stock as (
    select
      coalesce(it.on_hand, 0) as on_hand,
      coalesce(it.unit_cost, 0) as unit_cost,
      coalesce(it.daily_consumption, 0) as daily_consumption,
      coalesce(it.reorder_level, 0) as reorder_level
    from inventory_items it
    where it.org_id = p_org
  ),
  staff as (
    select
      coalesce(e.performance, 0) as performance,
      coalesce(e.attendance_pct, 0) as attendance_pct,
      coalesce(e.attrition_risk, 0) as attrition_risk,
      coalesce(e.monthly_ctc, 0) as monthly_ctc
    from employees e
    where e.org_id = p_org
  )
select jsonb_build_object(
  'series', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'period', to_char(period, 'YYYY-MM-DD'), 'revenue', revenue, 'orders', orders
    ) order by period), '[]'::jsonb)
    from revenue_by_month
  ),
  'ordersUnset', (select count(*) from orders_windowed where status = ''),
  'salesCount',  (select count(*) from orders),
  'openRecv',    (select coalesce(sum(amount), 0) from inv where status <> 'paid' and type <> 'payable'),
  'overdueRecv', (select coalesce(sum(amount), 0) from inv
                   where status <> 'paid' and type <> 'payable'
                     and (status = 'overdue' or (due_date is not null and due_date < (now() at time zone 'Asia/Kolkata')::date))),
  'openPay',     (select coalesce(sum(amount), 0) from inv where status <> 'paid' and type = 'payable')
                 + (select coalesce(sum(amount), 0) from po),
  'invoiceCount',(select count(*) from inv),
  /* ALL purchase orders, deliberately — this feeds the "no source data" branch
     in metrics.ts, which DELETES health_metrics. Filtering it here would wipe
     the dashboard of a workspace whose only data is draft POs. */
  'poCount',     (select count(*) from purchase_orders where org_id = p_org),
  'stockValue',   (select coalesce(sum(on_hand * unit_cost), 0) from stock),
  'totalDaily',   (select coalesce(sum(daily_consumption), 0) from stock),
  'totalOnHand',  (select coalesce(sum(on_hand), 0) from stock),
  'belowReorder', (select count(*) from stock where reorder_level > 0 and on_hand < reorder_level),
  'itemCount',    (select count(*) from stock),
  'avgPerf',      (select coalesce(avg(performance), 0) from staff),
  'avgAttend',    (select coalesce(avg(attendance_pct), 0) from staff),
  'avgAttrition', (select coalesce(avg(attrition_risk), 0) from staff),
  'payroll',      (select coalesce(sum(monthly_ctc), 0) from staff),
  'staffCount',   (select count(*) from staff)
);
$$;

/*
  NOT `authenticated`. This function is SECURITY DEFINER and takes the org id as
  a parameter with no membership check, so granting it to `authenticated` would
  publish any workspace's revenue, receivables and payroll at
  /rest/v1/rpc/cortex_aggregate to anyone holding that org's UUID — and org
  UUIDs ship to the browser in the org switcher. lib/metrics.ts calls this with
  the service-role client, which does not need the grant.
*/
revoke execute on function public.cortex_aggregate(uuid) from public, anon, authenticated;
grant  execute on function public.cortex_aggregate(uuid) to service_role;


/* --------------------------------------------------------------- verify --- */
select check_name, result, detail from (
  select
    '1. Share link filters out sample data' as check_name,
    case when (select prosrc from pg_proc where proname = 'public_report')
              like '%coalesce(is_demo, false) = false%'
         then 'OK' else 'FAIL' end as result,
    'demo KPIs and insights can no longer be published to a share link' as detail
  union all
  select
    '2. Share link reports a date',
    case when (select prosrc from pg_proc where proname = 'public_report') like '%v_as_of%'
         then 'OK' else 'FAIL' end,
    'the reader is told which date the figures are as at'
  union all
  select
    '3. Overdue cutoff is IST',
    case when (select prosrc from pg_proc where proname = 'cortex_aggregate') like '%Asia/Kolkata%'
         then 'OK' else 'FAIL' end,
    'matches the Asia/Kolkata date used by lib/metrics.ts'
  union all
  select
    '4. No UTC cutoff left behind',
    case when (select prosrc from pg_proc where proname = 'cortex_aggregate')
              like '%due_date < (now() at time zone ''utc'')::date%'
         then 'FAIL' else 'OK' end,
    'the two paths now agree on which invoices are past due'
  union all
  select
    '5. poCount still counts ALL purchase orders',
    case when (select prosrc from pg_proc where proname = 'cortex_aggregate')
              like '%''poCount'',     (select count(*) from purchase_orders where org_id = p_org)%'
         then 'OK' else 'REVIEW' end,
    'filtering this would wipe health_metrics for a draft-PO-only workspace'
) t order by check_name;



/* ===========================================================================
   STEP 3 — COLUMNS THE APP READS AND NO MIGRATION CREATES
   Source: supabase/migrations/2026_zzx_missing_columns.sql

   Three of them, all failing silently behind a catch:

   health_metrics.updated_at      — the Practice console orders by it, the
                                    ordering was rejected, and lastActivity was
                                    always null. So a CA firm was told
                                    "No data yet — import this client's books"
                                    for every client, including the ones who
                                    had imported.

   collection_policies.reply_to   — the chaser email set Reply-To from it. The
                                    column did not exist and nothing wrote it,
                                    so every reminder we sent on a customer's
                                    behalf routed the debtor's reply to US
                                    instead of to the business chasing the
                                    money.
   =========================================================================== */

/* ===========================================================================
   THREE COLUMNS THE APPLICATION READS OR WRITES AND NO MIGRATION CREATES.

   Found by cross-checking every table.column reference in src/ against the
   migration set rather than by anything failing loudly — which is the point.
   All three sit behind `catch {}` or an unchecked result, so each one degrades
   silently and looks like a product decision from the outside.

   -------------------------------------------------------------------------
   1. health_metrics.updated_at
   -------------------------------------------------------------------------
   lib/practice.ts:203 orders by it to compute a client's `lastActivity`. The
   table has created_at and nothing else. PostgREST rejects the ordering, the
   surrounding try/catch swallows it, and lastActivity is ALWAYS null — so the
   Practice console tells a CA firm "No data yet — import this client's books"
   for every client, including the ones who have imported. A firm evaluating
   whether to put 25 clients on Cortex sees a console reporting that none of
   them are using it.

   created_at would be the wrong fix: metrics are upserted on every recompute,
   so created_at is the day the workspace first computed anything, not the last
   time it did. The column has to exist and has to move.

   -------------------------------------------------------------------------
   2. collection_policies.reply_to
   -------------------------------------------------------------------------
   lib/collections/index.ts:399 reads it to set the Reply-To on a chaser email,
   with `catch { /* column not migrated yet */ }` — a comment written against a
   migration that was never written. Nothing wrote the column either, so this
   was dead in both directions and every reminder went out with no Reply-To.

   That is not cosmetic. A collections email is sent through our relay on the
   customer's behalf; the debtor hits reply, and the reply goes to us rather
   than to the business chasing the money. The whole feature is about getting
   paid, and the response path was pointed at the wrong company. The settings
   form now writes this (see saveCollectionsPolicy in lib/actions.ts).

   -------------------------------------------------------------------------
   3. workflow_runs.summary — NOT added here, deliberately.
   -------------------------------------------------------------------------
   lib/workflow-schedule.ts inserted `summary` into a table whose column is
   `log`, so every SCHEDULED workflow wrote no audit row while reporting
   success; the manual path in actions.ts uses `log` correctly. The right fix
   is one word in the TypeScript, not a duplicate column that would leave two
   places to look for the same thing. Fixed in the code.

   Safe to run, and safe to run twice.
   =========================================================================== */

-- ---------------------------------------------------------------------------
-- 1. health_metrics.updated_at, and something to keep it current.
-- ---------------------------------------------------------------------------

alter table health_metrics add column if not exists updated_at timestamptz default now();

/* Backfill so existing rows sort sensibly rather than clustering at the moment
   this migration ran. created_at is the closest truth we have for history. */
update health_metrics set updated_at = created_at where updated_at is null;

create or replace function cortex_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

/*
  A trigger rather than adding the field to every upsert payload in metrics.ts.
  Metrics are written from the recompute path, the demo seeder, and the
  aggregate fast path; a column maintained by three call sites is a column that
  is wrong from whichever one gets added next.
*/
drop trigger if exists trg_health_metrics_touch on health_metrics;
create trigger trg_health_metrics_touch
  before update on health_metrics
  for each row execute function cortex_touch_updated_at();

create index if not exists idx_health_metrics_org_updated
  on health_metrics(org_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 2. collection_policies.reply_to
-- ---------------------------------------------------------------------------

alter table collection_policies add column if not exists reply_to text;

/*
  Validated in the application (saveCollectionsPolicy) AND here. An address
  that is not an address becomes a header on mail we send on a customer's
  behalf, and a malformed Reply-To is the kind of thing that damages a sending
  domain's reputation for everyone on it.
*/
do $$
begin
  alter table collection_policies
    add constraint collection_policies_reply_to_shape
    check (reply_to is null or reply_to ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
exception when duplicate_object then null;
end $$;

/* ---------------------------------------------------------------- verify ---
   Expect one row per column, both present.
   -------------------------------------------------------------------------- */
select table_name, column_name, data_type
  from information_schema.columns
 where (table_name = 'health_metrics'      and column_name = 'updated_at')
    or (table_name = 'collection_policies' and column_name = 'reply_to')
 order by table_name;



/* ===========================================================================
   STEP 4 — THE DEFAULT CASH ALERT FIRES FOR EVERY SOLVENT BUSINESS
   Source: supabase/migrations/2026_zzy_default_cash_rule_unit.sql

   The seeded default is `cash < 30`, documented as "days of runway". The
   metric is emitted in MONTHS. So the shipped default means "warn me when
   runway drops below thirty months", which is true of almost every business
   that has ever existed.

   Every workspace trips it on the first recompute and on every recompute
   after. The first email a new customer gets from an early-warning product is
   a false alarm — which is how people learn to ignore the sender.

   Only rows still holding the exact seeded value (metric 'cash', op '<',
   threshold 30) are changed. Anyone who chose their own number keeps it.
   =========================================================================== */

/* ===========================================================================
   THE DEFAULT CASH ALERT FIRES FOR EVERY WORKSPACE, ON DAY ONE, FOREVER.

   2026_default_alert_rules.sql seeds `cash < 30` and documents it as:

       cash        < 30       Days of runway. Under a month is the point at
                              which an owner needs to be doing something.

   The metric it compares against is not days. lib/metrics.ts:457 emits

       metric_key: "cash", value: months, unit: "months"

   — runway in MONTHS, one decimal place. So the shipped default reads "warn me
   when runway drops below thirty months", which is true of essentially every
   business that has ever existed, including healthy ones. Every workspace that
   emits a runway figure at all trips this rule on the first recompute and on
   every recompute after it.

   WHY THAT IS WORSE THAN A MERELY WRONG NUMBER.

   The migration that introduced it argues the case against itself, at length,
   two paragraphs above the bug:

       "A default that fires constantly is worse than no default: people learn
       to ignore the sender, and then the one that mattered is ignored too."

   That is exactly what shipped. This product's entire proposition is that when
   Cortex emails you, something is actually wrong — and the very first email a
   new customer receives is a false alarm about a company with three years of
   runway. The unit mismatch turns the signature feature into training material
   for ignoring us.

   THE FIX, AND WHY 3 RATHER THAN 1.

   Three months. The original intent was "under a month", but that intent was
   written against a daily figure; on a monthly figure, one month of runway is
   far past the point where an early-warning product has been useful. Three
   months is the horizon at which an owner can still act — negotiate terms,
   chase receivables, delay a purchase — which is what the alert is for.
   metrics.ts already bands this metric at 6/3 (`band(months, 6, 3)`), so 3 is
   the threshold the product's own status colours already call red.

   EXISTING ROWS.

   Updated, but only where the row is still exactly the seeded default
   (metric 'cash', op '<', threshold 30). A customer who deliberately chose a
   different number keeps it. Nobody deliberately chose thirty months.

   Safe to run, and safe to run twice.
   =========================================================================== */

update alert_rules
   set threshold = 3
 where metric_key = 'cash'
   and op = '<'
   and threshold = 30;

/* And for every workspace created from now on. Byte-identical to the function
   in 2026_default_alert_rules.sql apart from the one threshold, including the
   exception handler — a workspace with no default rules is a degraded product,
   a signup that fails is no product. */
create or replace function cortex_seed_default_alert_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into alert_rules (org_id, metric_key, op, threshold, enabled)
  values (new.id, 'receivables', '>', 500000, true),
         (new.id, 'risk',        '>', 60,     true),
         -- MONTHS of runway, matching lib/metrics.ts. Was 30, which is the
         -- same number read as days and fires for every solvent business.
         (new.id, 'cash',        '<', 3,      true)
  on conflict (org_id, metric_key, op) do nothing;
  return new;
exception when others then
  return new;
end $$;

/* The definer sweep in 2026_zzz_definer_final_lockdown.sql runs after this file
   and will restrict the replaced function again — but `create or replace`
   preserves the existing ACL, so this does not reopen anything in between. */

/* ---------------------------------------------------------------- verify ---
   Expect zero rows. Any row is a workspace still holding the months-as-days
   default, which will email its owner about healthy cash every single day.
   -------------------------------------------------------------------------- */
select org_id, metric_key, op, threshold
  from alert_rules
 where metric_key = 'cash' and op = '<' and threshold >= 12
 order by org_id;



/* ===========================================================================
   STEP 5 — SWEEP UP EVERY OTHER DEFINER FUNCTION, LAST
   Source: supabase/migrations/2026_zzz_definer_final_lockdown.sql

   2026_definer_grant_sweep.sql works, but `d` sorts early — so every
   migration added after it that CREATES a SECURITY DEFINER function got that
   function back from Supabase's default-privileges rule, which grants EXECUTE
   to `authenticated` on creation. Five had accumulated; cortex_aggregate was
   the serious one and is handled in step 1.

   This re-runs the sweep at the end of the ordering. It only removes
   privileges. The verification query at the bottom is the real answer:
   expect ZERO rows.
   =========================================================================== */

/* ===========================================================================
   THE SWEEP HAS TO BE THE LAST THING THAT RUNS. IT WASN'T.

   THE MECHANISM, WHICH IS DULLER AND MORE DANGEROUS THAN A BUG IN THE SQL.

   Migrations apply in FILENAME ORDER. 2026_definer_grant_sweep.sql revokes
   EXECUTE from anon and authenticated on every SECURITY DEFINER function in
   public that is not on its allowlist. It works — test-definer-grants.cjs
   proves it against real Postgres.

   But `d` sorts early. Every migration whose name sorts after
   `2026_definer_grant_sweep` and which CREATES a definer function gets that
   function back from Supabase's default-privileges rule:

       alter default privileges in schema public
         grant execute on functions to postgres, anon, authenticated, service_role;

   A newly created function therefore arrives with a DIRECT grant to
   `authenticated`. The sweep already ran. Nothing takes it away.

   So the sweep did not fix a class of bug. It fixed the instances that existed
   on the day it was written, and every file added afterwards reopened the
   class one function at a time. Five had accumulated:

     cortex_aggregate          (2026_zz_aggregate_ist_overdue)  — SERIOUS
     cortex_has_billing_guard  (2026_org_billing_guard)
     cortex_upsert_arbiters_ok (2026_upsert_arbiter_fix)
     cortex_guard_last_owner   (2026_rls_privilege_fix)
     handle_new_user           (2026_signup_trigger)

   cortex_aggregate is the one that mattered, and it is fixed at source in its
   own file — it takes the org id as a parameter and checks no membership, so
   the grant published any workspace's revenue, receivables and total monthly
   payroll to anyone holding that org's UUID. Org UUIDs ship to the browser in
   the org switcher, which means removing someone's membership would not have
   stopped them reading the business's numbers.

   The other four are much smaller, and are closed here rather than argued
   about:

   - cortex_has_billing_guard() and cortex_upsert_arbiters_ok() take no
     arguments and return one boolean each about the PLATFORM's configuration,
     not about any workspace. Harmless to a tenant. But `false` from the first
     one is a precise statement that credits metering is currently bypassable,
     which is a reconnaissance answer we should not hand to a stranger for the
     price of a free signup. lib/health.ts calls both with the SERVICE client,
     so revoking costs nothing.

   - cortex_guard_last_owner() and handle_new_user() both `returns trigger`.
     PostgREST does not expose trigger-returning functions and calling one
     directly raises an error, so neither was reachable in practice. Revoked
     for hygiene: "not exploitable today" is a property of PostgREST's
     behaviour, not of our intent.

   WHY THIS FILE IS NAMED `zzz`.

   So it runs last. That is a convention, not a guarantee — the next person to
   add a definer function in a file named `2027_...` reopens the same class,
   and a comment will not stop them.

   What stops them is scripts/test-definer-final-acl.cjs, added alongside this
   file. It replays every grant and revoke across the whole migrations
   directory in filename order and asserts the FINAL privilege on every definer
   function. A later file that re-grants one fails the suite, which is the
   check that was missing: the old test could only see the file it was pointed
   at, and it passed the entire time cortex_aggregate was open.

   Safe to run, and safe to run twice: it only removes privileges, and the
   allowlist below is byte-identical to the sweep's.
   =========================================================================== */

do $$
declare
  fn record;
  allowed text[] := array[
    -- The RLS helpers. Every tenant policy calls these through the anon+cookie
    -- client; revoking them breaks every read and write in the product. Both
    -- resolve auth.uid() themselves and answer only about the caller.
    'user_org_rank', 'user_org_ids',

    -- Authenticate on a credential they are HANDED rather than on the session:
    -- an API key (api_ingest, api_metrics) or a share token (public_report).
    -- Anon reachability is the feature.
    'api_ingest', 'api_metrics', 'public_report',

    -- Called with the user's client, and both check membership themselves.
    'seed_demo_data', 'seed_demo_customers',

    -- One global boolean, no org parameter, no writes, same answer for all.
    'cortex_collections_enabled',

    -- Pure function over its argument. No table access.
    'cortex_norm_name'
  ];
  revoked int := 0;
begin
  for fn in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.proname <> all (allowed)
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    /*
      `public` as well as the two named roles. `authenticated` holds EXECUTE by
      two routes — the direct grant from the default-privileges rule and the
      implicit one it inherits as a member of PUBLIC. Revoking only the named
      roles leaves the PUBLIC entry and the function stays callable; that exact
      half-fix is what left cortex_collections_trip_check open originally.
    */
    execute format('revoke execute on function public.%I(%s) from public, anon, authenticated',
                   fn.proname, fn.args);
    execute format('grant execute on function public.%I(%s) to service_role',
                   fn.proname, fn.args);
    revoked := revoked + 1;
    raise notice 'locked down after the fact: %(%)', fn.proname, fn.args;
  end loop;

  raise notice 'final definer lockdown: % function(s) restricted to service_role', revoked;
end $$;

/* ---------------------------------------------------------------- report ---
   Run this and read it. An empty result is the pass condition; any row is a
   SECURITY DEFINER function a signed-in stranger can call, and definer rights
   bypass RLS, so for these the grant IS the access control — there is no
   policy underneath to catch the mistake.
   -------------------------------------------------------------------------- */
select p.proname                                   as still_reachable,
       pg_get_function_identity_arguments(p.oid)   as args,
       case when has_function_privilege('anon', p.oid, 'execute')
            then 'anon' else 'authenticated' end   as by_role
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
   and p.proname <> all (array['user_org_rank','user_org_ids','api_ingest','api_metrics',
                               'public_report','seed_demo_data','seed_demo_customers',
                               'cortex_collections_enabled','cortex_norm_name'])
   and (has_function_privilege('anon', p.oid, 'execute')
     or has_function_privilege('authenticated', p.oid, 'execute'))
 order by 1;



/* ===========================================================================
   STEP 6 — THE WEEKLY PLAN LEDGER (was already outstanding)
   Source: supabase/RUN-weekly-plan-sends.sql

   Also outstanding from before. Without weekly_plan_sends the Monday plan
   email falls back to Monday-only and reports ledger:false in the cron
   response — correct behaviour, invisible unless somebody reads that JSON,
   and the landing page sells the feature.
   =========================================================================== */

/* ===========================================================================
   RUN THIS IN THE SUPABASE SQL EDITOR.

   Safe: creates one new table, touches no existing data, and is idempotent —
   running it twice is harmless.

   WHY IT MATTERS MORE THAN THE USUAL MIGRATION

   The landing page promises "One email on Monday: the three things worth your
   attention this week", and the onboarding finish screen repeats it. The code
   that delivers exactly that has existed and worked for a while, gated behind
   an env var (WEEKLY_PLAN_ENABLED) that was never set anywhere — so the answer
   to "what happens without you doing anything else" was, in fact, nothing.

   It is now on by default. This table is what makes that safe: it records
   which workspaces have already had THIS week's plan, so the daily cron sends
   each workspace exactly one email per ISO week and picks up the following day
   wherever the time budget ran out.

   UNTIL YOU RUN THIS, the send falls back to Monday-only and reports
   `ledger: false` in the cron's response. That fallback is deliberate — the
   alternative, sending unrecorded on a daily cron, would mail every customer
   their plan seven times a week.
   =========================================================================== */

create table if not exists weekly_plan_sends (
  org_id     uuid not null references organizations(id) on delete cascade,
  week       text not null,                       -- '2026-W37', Monday-based, IST
  recipients integer not null default 0,
  sent_at    timestamptz not null default now(),
  primary key (org_id, week)
);

create index if not exists idx_weekly_plan_sends_week on weekly_plan_sends(week, sent_at desc);

/* Service-role only. No customer needs to read this, and no customer should be
   able to delete a row to make themselves eligible for a second send. RLS on
   with no policies = deny to anon and authenticated, allow to service_role. */
alter table weekly_plan_sends enable row level security;

/* --------------------------------------------------------------- verify --- */
select
  'weekly_plan_sends exists'                                as check_name,
  case when to_regclass('public.weekly_plan_sends') is not null
       then 'OK' else 'FAIL' end                            as result,
  coalesce((select count(*)::text || ' row(s)' from weekly_plan_sends), '0 rows') as detail
union all
select
  'RLS is on (service-role only)',
  case when (select relrowsecurity from pg_class where relname = 'weekly_plan_sends')
       then 'OK' else 'FAIL' end,
  'no policies = denied to anon and authenticated'
union all
select
  'the primary key is the once-per-week lock',
  case when exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indrelid
    where c.relname = 'weekly_plan_sends' and i.indisprimary
  ) then 'OK' else 'FAIL' end,
  'insert ... on conflict do nothing is what claims a week for a workspace';



/* ===========================================================================
   FINAL CHECK — run this last and read it.

   Expect ZERO rows. Any row is a SECURITY DEFINER function a signed-in
   stranger can call. Definer rights bypass RLS, so for these the grant IS the
   access control — there is no policy underneath to catch a mistake.
   =========================================================================== */

select p.proname                                  as still_reachable,
       pg_get_function_identity_arguments(p.oid)  as args,
       case when has_function_privilege('anon', p.oid, 'execute')
            then 'anon' else 'authenticated' end  as by_role
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
   and p.proname <> all (array['user_org_rank','user_org_ids','api_ingest','api_metrics',
                               'public_report','seed_demo_data','seed_demo_customers',
                               'cortex_collections_enabled','cortex_norm_name'])
   and (has_function_privilege('anon', p.oid, 'execute')
     or has_function_privilege('authenticated', p.oid, 'execute'))
 order by 1;
