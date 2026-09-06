/* ===========================================================================
   DIAGNOSTIC ONLY — reads pg_indexes / pg_class. Changes nothing.

   RUN-scale.sql ends with two SELECTs, and the Supabase SQL editor shows only
   the last result set — so the index listing was swallowed by the cron_cursors
   check and I never actually saw whether the indexes landed. cron_cursors
   coming back OK proves the second half of the file ran, which makes it very
   likely, but "very likely" is not the standard for the one index that sits in
   front of every RLS check in the product.

   Run this on its own. Every row must read OK.
   =========================================================================== */

select
  check_name,
  case when ok then 'OK' else 'MISSING' end as result,
  detail
from (
  /* THE ONE THAT MATTERS. user_org_ids() and user_org_rank() both filter
     memberships on user_id, and every RLS policy on every tenant table calls
     one of them. Without this index that is a scan per table per query. */
  select
    '1. memberships(user_id, org_id) — the RLS hot path' as check_name,
    exists (select 1 from pg_indexes where schemaname='public'
              and tablename='memberships' and indexname='idx_memberships_user') as ok,
    coalesce((select indexdef from pg_indexes where schemaname='public'
                and indexname='idx_memberships_user'), 'not found') as detail

  union all
  /* Both columns in the index, so the lookup is answered without touching the
     heap. If this says MISSING but check 1 says OK, the index exists on
     user_id alone and is doing half the job. */
  select
    '2. ...and it is covering (org_id present)',
    exists (select 1 from pg_indexes where schemaname='public'
              and indexname='idx_memberships_user' and indexdef like '%org_id%'),
    'index-only scan requires org_id in the index'

  union all
  select
    '3. integrations(org_id) — read on every dashboard render',
    exists (select 1 from pg_indexes where schemaname='public'
              and indexname='idx_integrations_org'),
    coalesce((select indexdef from pg_indexes where indexname='idx_integrations_org'), 'not found')

  union all
  select
    '4. alerts partial index on unread',
    exists (select 1 from pg_indexes where schemaname='public'
              and indexname='idx_alerts_unread'),
    coalesce((select indexdef from pg_indexes where indexname='idx_alerts_unread'), 'not found')

  union all
  select
    '5. sales_orders(org_id, status, created_at)',
    exists (select 1 from pg_indexes where schemaname='public'
              and indexname='idx_sales_orders_org_status_created'),
    coalesce((select indexdef from pg_indexes where indexname='idx_sales_orders_org_status_created'), 'not found')

  union all
  /* The (org_id, created_at desc) family. The migration skips any table that
     does not exist or lacks the columns, so a partial count is expected and
     fine — the detail column names which ones landed. */
  select
    '6. the (org_id, created_at desc) family',
    (select count(*) from pg_indexes where schemaname='public'
       and indexname like 'idx_%_org_created') >= 8,
    (select count(*)::text || ' created: ' ||
            coalesce(string_agg(replace(replace(indexname,'idx_',''),'_org_created',''), ', '
                     order by indexname), 'none')
       from pg_indexes where schemaname='public' and indexname like 'idx_%_org_created')

  union all
  /* cron_cursors must be RLS-enabled with no policy: platform state, service
     role only. Left open it is one more table PostgREST serves to the anon key
     that ships in our browser bundle. */
  select
    '7. cron_cursors is locked to the service role',
    coalesce((select relrowsecurity from pg_class where relname='cron_cursors'), false)
      and (select count(*) from pg_policies where tablename='cron_cursors') = 0,
    'rls=' || coalesce((select relrowsecurity::text from pg_class where relname='cron_cursors'), 'no table')
      || ', policies=' || (select count(*)::text from pg_policies where tablename='cron_cursors')

  union all
  select
    '8. cron_cursor_advance is not callable by the anon key',
    not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
      where p.proname = 'cron_cursor_advance'
        and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
    coalesce((select 'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
                     || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
               where p.proname='cron_cursor_advance' limit 1), 'function not found')
) t
order by check_name;
