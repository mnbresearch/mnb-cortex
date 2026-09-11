/* ===========================================================================
   WHICH PARTS OF RUN-2026-09-05.sql ARE ACTUALLY MISSING?

   READ ONLY. This creates nothing, changes nothing, deletes nothing. Paste it,
   read the table, and then decide.

   WHY THIS EXISTS

   /api/health now reports "Schema migrations: degraded — Not applied:
   RUN-2026-09-05.sql". That names the file to run, which is what an operator
   needs, and tells you nothing about what is wrong — the file creates six
   tables and seven functions, so the message covers thirteen objects and the
   real gap could be one of them.

   Running the whole file blind would probably be fine (it is `if not exists`
   and `create or replace` throughout). But "probably fine" on a production
   database holding real invoices is not a standard worth adopting, and a
   half-applied file is the likeliest explanation for the current state — in
   which case knowing WHICH half matters.

   Six tables, seven functions, one grant question.
   =========================================================================== */

with objects as (

  /* ---- the six tables ------------------------------------------------- */
  select 'table'  as kind, 'collection_threads'   as name,
         case when to_regclass('public.collection_threads')   is not null then 'present' else 'MISSING' end as state
  union all select 'table', 'collection_messages',
         case when to_regclass('public.collection_messages')  is not null then 'present' else 'MISSING' end
  union all select 'table', 'collection_policies',
         case when to_regclass('public.collection_policies')  is not null then 'present' else 'MISSING' end
  union all select 'table', 'metric_snapshots',
         case when to_regclass('public.metric_snapshots')     is not null then 'present' else 'MISSING' end
  union all select 'table', 'platform_switches',
         case when to_regclass('public.platform_switches')    is not null then 'present' else 'MISSING' end
  union all select 'table', 'erased_subscriptions',
         case when to_regclass('public.erased_subscriptions') is not null then 'present' else 'MISSING' end

  /* ---- the seven functions -------------------------------------------- */
  /*
     cortex_collections_enabled is the one that matters most. It IS the
     operator kill switch for outbound collections, and until the fix that
     ships alongside this file, /api/health reported the switch as
     "operational" when this function was absent — because supabase-js returns
     `{data: null, error}` rather than throwing, so `null === false` was false
     and the check fell through to green.
  */
  union all select 'function', 'cortex_collections_enabled',
         case when to_regprocedure('public.cortex_collections_enabled()') is not null then 'present' else 'MISSING' end
  union all select 'function', 'cortex_set_collections_switch',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='cortex_set_collections_switch')
              then 'present' else 'MISSING' end
  union all select 'function', 'cortex_collections_stop_on_paid',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='cortex_collections_stop_on_paid')
              then 'present' else 'MISSING' end
  union all select 'function', 'cortex_collections_trip_check',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='cortex_collections_trip_check')
              then 'present' else 'MISSING' end
  union all select 'function', 'cortex_recovery_summary',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='cortex_recovery_summary')
              then 'present' else 'MISSING' end
  union all select 'function', 'cortex_guard_last_owner',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='cortex_guard_last_owner')
              then 'present' else 'MISSING' end
  union all select 'function', 'cortex_seed_default_alert_rules',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='cortex_seed_default_alert_rules')
              then 'present' else 'MISSING' end

  /* ---- the columns later files added to collection_policies ----------- */
  /*
     These are probed by name in health.ts because the TABLE pre-dates them:
     a bare select on collection_policies succeeds while tripped_at,
     whatsapp_template and reply_to are all absent. If the table reads
     "present" above and these read MISSING, the later files are the gap
     rather than this one.
  */
  union all select 'column', 'collection_policies.tripped_at',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='collection_policies' and column_name='tripped_at')
              then 'present' else 'MISSING' end
  union all select 'column', 'collection_policies.tripped_reason',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='collection_policies' and column_name='tripped_reason')
              then 'present' else 'MISSING' end
  union all select 'column', 'collection_policies.whatsapp_template',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='collection_policies' and column_name='whatsapp_template')
              then 'present' else 'MISSING' end
  union all select 'column', 'collection_policies.last_swept_at',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='collection_policies' and column_name='last_swept_at')
              then 'present' else 'MISSING' end
  union all select 'column', 'collection_policies.reply_to',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='collection_policies' and column_name='reply_to')
              then 'present' else 'MISSING' end
)
select kind, name, state
  from objects
 order by case state when 'MISSING' then 0 else 1 end, kind, name;


/* ---------------------------------------------------------------------------
   SECOND QUERY: USE THE AUDIT THAT ALREADY EXISTS.

   This slot used to hold my own "is anything reachable by a stranger" query,
   listing seven function names with the instruction EXPECT ZERO ROWS. It
   returned two, and both were false alarms:

     cortex_recovery_summary    — it is SECURITY INVOKER. It runs with the
                                  CALLER's rights, so RLS on
                                  collection_threads still filters every row;
                                  passing someone else's org id returns zeros.
                                  Granted to `authenticated` deliberately, on
                                  the line right below its definition.

     cortex_collections_enabled — SECURITY DEFINER, but it takes no org
                                  parameter, writes nothing, and returns one
                                  global boolean. Already reviewed and recorded
                                  as acceptable.

   My query ignored `prosecdef`, so it swept up an invoker-rights function, and
   ignored the fact that cortex_definer_audit() below had already done this
   job properly — with the allow-list and the REASON for each exception. Two
   false positives in a security check is how a security check gets ignored.

   So: call the real one. It filters on SECURITY DEFINER, and every row comes
   with a verdict rather than leaving you to judge.

   READ THE `verdict` COLUMN. "OK — …" rows are reviewed and fine. Any row
   reading "REVIEW — definer rights bypass RLS and nothing here checks
   membership" is a genuine finding and worth acting on today.
   --------------------------------------------------------------------------- */
select * from cortex_definer_audit();
