/*
  The indexes this app needs to survive its own growth.

  THE ONE THAT MATTERS: memberships(user_id).

  `memberships` had NO index other than the primary key and
  `unique (org_id, user_id)`. That unique index leads on org_id, so a lookup
  of the form `where user_id = $1` cannot seek on it — Postgres either scans
  the whole index or the whole table.

  And `where user_id = auth.uid()` is the hottest predicate in the system, for
  a reason that is easy to miss: it is not mainly the application's query. Both

      user_org_ids()  -- rls.sql
      user_org_rank() -- 2026_tenancy.sql

  filter memberships on user_id, and EVERY RLS policy on EVERY tenant table
  calls one of them. So the cost is not paid once per request; it is paid once
  per row-security check, which is once per table touched, on every query the
  app makes. Add the ~12 direct getUserAndOrg() calls a single dashboard render
  performs and the same unindexed scan happens dozens of times per page view.

  This is the most plausible explanation for the 780ms the health check reports
  against a database that is nearly empty — an unindexed scan of a tiny table
  is fast, so the symptom is mild now and grows linearly with the number of
  users on the platform. It is the definition of a problem that only appears
  once you have customers.

  memberships(user_id, org_id) rather than memberships(user_id): both columns
  are in the index, so user_org_ids() is satisfied index-only, without visiting
  the heap at all.

  EVERYTHING ELSE is the pattern the app actually queries. The house shape is
  `.eq("org_id", …).order("created_at", { ascending: false })`, and a plain
  (org_id) index makes Postgres sort the whole tenant every time. Composite
  (org_id, created_at desc) turns that into a range scan already in order.

  All of it is `if not exists`, additive, and safe to run more than once.
  Nothing here changes a policy, a row or a result — only how fast it is found.
*/

do $$
declare
  r record;
  has_col boolean;
begin
  /* ------------------------------------------------------------------ P0 */
  if to_regclass('public.memberships') is not null then
    create index if not exists idx_memberships_user on memberships(user_id, org_id);
    raise notice 'memberships(user_id, org_id) — the RLS hot path';
  end if;

  /*
    The (org_id, created_at desc) family.

    Driven by the actual call sites in src/lib/data.ts, not by guessing: every
    table below is read with .eq("org_id") and ordered by created_at desc.
    Skipped silently if the table or the column is absent, so this file does
    not need to know which migrations a given database has had.
  */
  for r in
    select unnest(array[
      'invoices', 'inventory_items', 'employees', 'purchase_orders',
      'customers', 'invites', 'api_keys', 'report_links', 'sales_pipeline',
      'workflows', 'documents', 'meetings', 'market_reports', 'strategy_docs',
      'email_campaigns', 'campaign_recipients', 'scheduled_reports'
    ]) as tbl
  loop
    if to_regclass('public.' || r.tbl) is null then continue; end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = 'created_at'
    ) into has_col;
    if not has_col then continue; end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = 'org_id'
    ) into has_col;
    if not has_col then continue; end if;

    execute format(
      'create index if not exists idx_%1$s_org_created on %1$I (org_id, created_at desc);',
      r.tbl);
  end loop;

  /*
    integrations had no index at all, and ConnectBanner reads it on every
    dashboard render. One row per provider per workspace, so the table stays
    small — but the scan is per page view, per user.
  */
  if to_regclass('public.integrations') is not null then
    create index if not exists idx_integrations_org on integrations(org_id, provider);
  end if;

  /*
    Unread alerts. (org_id, created_at desc) already exists, but the query is
    `.eq("org_id").eq("is_read", false).order("created_at")` and is_read is not
    in it, so Postgres reads every alert the workspace has ever had and filters.
    A PARTIAL index holds only the unread ones — which is the handful that
    matter, and shrinks as the user reads them.
  */
  if to_regclass('public.alerts') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'alerts' and column_name = 'is_read'
    ) into has_col;
    if has_col then
      create index if not exists idx_alerts_unread
        on alerts (org_id, created_at desc) where is_read = false;
    end if;
  end if;

  /*
    sales_orders filtered by status and created_at — src/lib/ai/tools.ts reads
    `.eq("org_id").eq("status","won").gte("created_at", from)`. The existing
    index is (org_id, order_date), a different column, so it does not apply.
    This one runs on every AI tool call that asks about revenue.
  */
  if to_regclass('public.sales_orders') is not null then
    create index if not exists idx_sales_orders_org_status_created
      on sales_orders (org_id, status, created_at desc);
  end if;

  /*
    credit_ledger is read per request by the credit banner and written on every
    AI call, so it grows faster than anything else here. (org_id, created_at)
    exists; this adds the reason filter used by the usage breakdown.
  */
  if to_regclass('public.credit_ledger') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'credit_ledger' and column_name = 'reason'
    ) into has_col;
    if has_col then
      create index if not exists idx_credit_ledger_org_reason
        on credit_ledger (org_id, created_at desc) where delta < 0;
    end if;
  end if;
end $$;


/*
  Report what exists now, so the run is verifiable rather than hopeful.
*/
select
  tablename,
  indexname,
  case when indexdef like '%UNIQUE%' then 'unique' else '' end as kind
from pg_indexes
where schemaname = 'public'
  and (indexname like 'idx_%_org_created'
       or indexname in ('idx_memberships_user', 'idx_integrations_org',
                        'idx_alerts_unread', 'idx_sales_orders_org_status_created',
                        'idx_credit_ledger_org_reason'))
order by tablename, indexname;
