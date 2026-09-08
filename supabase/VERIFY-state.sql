/* ===========================================================================
   ONE QUERY, EVERY CHECK. Run this on its own and paste the whole table back.

   Every row must read OK. Any FAIL is a step that did not land — and because
   the SQL editor shows only the last statement's result, this is the only way
   to see all of them at once.
   =========================================================================== */
with checks as (

  /* ---- 1. THE URGENT ONE. Cross-tenant read of revenue/receivables/payroll. */
  select 1 as n, 'cortex_aggregate is service-role only' as check_name,
         case when exists (
           select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname='public' and p.proname='cortex_aggregate'
              and (has_function_privilege('anon', p.oid,'execute')
                or has_function_privilege('authenticated', p.oid,'execute')))
              then 'FAIL' else 'OK' end as result,
         'any signed-in user could read any workspace''s financials' as why

  /* ---- 2. Every other SECURITY DEFINER function, after the final sweep. */
  union all
  select 2, 'no other definer function is reachable by strangers',
         case when (select count(*) from pg_proc p
                      join pg_namespace ns on ns.oid = p.pronamespace
                     where ns.nspname='public' and p.prosecdef
                       and p.proname <> all (array['user_org_rank','user_org_ids','api_ingest',
                             'api_metrics','public_report','seed_demo_data','seed_demo_customers',
                             'cortex_collections_enabled','cortex_norm_name'])
                       and (has_function_privilege('anon', p.oid,'execute')
                         or has_function_privilege('authenticated', p.oid,'execute'))) > 0
              then 'FAIL' else 'OK' end,
         'definer rights bypass RLS, so the grant IS the access control'

  /* ---- 3. The columns the app reads and no migration created. */
  union all
  select 3, 'health_metrics.updated_at exists',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='health_metrics'
                              and column_name='updated_at') then 'OK' else 'FAIL' end,
         'without it the Practice console says "no data yet" for every client'

  union all
  select 4, '...and its trigger keeps it current',
         case when exists (select 1 from pg_trigger
                            where tgname='trg_health_metrics_touch' and not tgisinternal)
              then 'OK' else 'FAIL' end,
         'a column that never moves is worse than no column'

  union all
  select 5, 'collection_policies.reply_to exists',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='collection_policies'
                              and column_name='reply_to') then 'OK' else 'FAIL' end,
         'without it a debtor''s reply comes to us, not to the business chasing'

  /* ---- 4. The default alert rule that fires for every solvent business. */
  union all
  select 6, 'no workspace still holds the months-as-days cash rule',
         case when exists (select 1 from alert_rules
                            where metric_key='cash' and op='<' and threshold >= 12)
              then 'FAIL' else 'OK' end,
         'cash<30 was read as days; the metric is months, so it fired for everyone'

  union all
  select 7, 'new workspaces are seeded with cash < 3 months',
         case when (select prosrc from pg_proc where proname='cortex_seed_default_alert_rules')
                   like '%''cash'',        ''<'', 3%' then 'OK' else 'FAIL' end,
         'the trigger body, not the existing rows'

  /* ---- 5. The two already-outstanding runbooks. */
  union all
  select 8, 'weekly_plan_sends ledger exists',
         case when to_regclass('public.weekly_plan_sends') is not null then 'OK' else 'FAIL' end,
         'without it the Monday plan email falls back to Monday-only, silently'

  union all
  select 9, 'share links exclude demo data',
         case when (select prosrc from pg_proc where proname='public_report')
                   like '%coalesce(is_demo, false) = false%' then 'OK' else 'FAIL' end,
         'a published report must not carry invented numbers'

  /* ---- 6. The two controls the app can only report on, not enforce. */
  union all
  select 10, 'billing guard trigger is installed',
         case when exists (select 1 from pg_trigger
                            where tgname='cortex_org_billing_guard'
                              and tgrelid='public.organizations'::regclass and not tgisinternal)
              then 'OK' else 'FAIL' end,
         'without it an owner can PATCH credits_allowance = -1 and disable metering'

  union all
  select 11, 'upsert arbiters are present and usable',
         case when (select count(*) from pg_index i join pg_class c on c.oid=i.indexrelid
                     where c.relname in ('invoices_org_invoiceno_key',
                                         'sales_orders_org_orderno_key',
                                         'customers_org_name_key')
                       and i.indisunique and i.indpred is null) = 3
              then 'OK' else 'FAIL' end,
         'without all three, saving an invoice and every store sync fails'
)
select n as "#", check_name, result,
       case when result='OK' then '' else why end as if_it_failed
  from checks order by n;
