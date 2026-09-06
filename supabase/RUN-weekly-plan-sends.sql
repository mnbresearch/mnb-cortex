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
