/* ===========================================================================
   RUN THIS ONCE IN THE SUPABASE SQL EDITOR.

   Paste the whole file, press Run, and read the last table. Every statement is
   idempotent (`if not exists` throughout, plus a caught duplicate_object for
   the one constraint), so running it a second time is harmless — if these
   migrations were already applied, this file changes nothing and simply tells
   you so.

   WHAT IT COVERS, AND WHY IT MATTERS RIGHT NOW

   Three features are already deployed and are INERT without these tables:

     funnel_events    — every analytics call in the product writes here. Without
                        it the funnel numbers are permanently zero and the
                        instrumentation added to measure the acquisition work
                        measures nothing.
     lifecycle_sends  — the claim-before-send lock for the welcome / setup /
                        import / last-call emails. Without it the nightly cron
                        has nowhere to record what it sent, which means either
                        no email goes out at all or the same nudge goes out
                        every morning. The second failure is worse than the
                        first, and it is the one that annoys a new customer
                        into leaving.
     leads.company/note/score
                      — the Business Health Check already collects a score out
                        of 100, the named weak areas and the business name.
                        Without these columns all of it is discarded on write
                        and the CRM row records only a name and an email.

   So until this runs, three shipped things quietly do nothing. The code is
   already live; it is waiting on the schema.

   ORDER: lead columns, then funnel_events, then lifecycle_sends. They are
   independent — nothing here depends on anything else here — but this is the
   order the migration files carry, so the repo and the database stay in step.
   =========================================================================== */


/* ═══════════════════════════════════════════════════════ 1. leads detail ══ */
/* From supabase/migrations/2026_zzza_lead_detail.sql */

alter table leads add column if not exists company text;
alter table leads add column if not exists note    text;
alter table leads add column if not exists score   int;

/*
  A score is 0-100 or absent. Constrained because this feeds a "call the
  at-risk ones first" sort, and a stray 10000 from a future caller would put a
  healthy business at the top of that list permanently.
*/
do $$
begin
  alter table leads add constraint leads_score_range
    check (score is null or (score >= 0 and score <= 100));
exception when duplicate_object then null;
end $$;

/* The operator's working query is "worst first, newest first". */
create index if not exists idx_leads_score_created on leads(score, created_at desc);


/* ════════════════════════════════════════════════════ 2. funnel_events ══ */
/* From supabase/migrations/2026_zzzb_funnel_events.sql

   No raw IP, no user agent, no cookie, no cross-site identifier, no personal
   data. `visitor` is a salted SHA-256 of the IP truncated to 16 hex characters
   — enough to tell two visits apart within a day, useless for identifying
   anyone, and it rotates because the salt includes the date. That is a real
   trade: people can be counted per day but not followed across days. For
   funnel counts that is sufficient, and it is the version that does not
   require asking a stranger for permission to be watched.                   */

create table if not exists funnel_events (
  id          bigserial primary key,
  event       text not null,
  path        text,
  visitor     text,
  org_id      uuid references organizations(id) on delete set null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

/*
  The two queries this table exists to answer:
    "how many of each step, per day"    -> (event, created_at)
    "how many distinct people per step" -> (event, visitor)
*/
create index if not exists idx_funnel_event_time    on funnel_events(event, created_at desc);
create index if not exists idx_funnel_event_visitor on funnel_events(event, visitor);

/*
  RLS ON, NO POLICIES. Service-role only.

  Written by server routes with the service client, read by the superadmin
  console. A tenant has no business reading it — it is cross-tenant by nature —
  and an anonymous visitor writing directly to it would make every number in it
  a lie. No policy means denied to anon and authenticated, which is the intent.
*/
alter table funnel_events enable row level security;

/*
  A RETENTION RULE, WRITTEN DOWN RATHER THAN ASSUMED. An events table with no
  ceiling is the one that quietly becomes the largest thing in the database.
  90 days is long enough to compare a month against the month before it.

  A function rather than a trigger: a delete on every insert would make the
  write path pay for it. Called from the nightly cron sweep.
*/
create or replace function cortex_prune_funnel_events(p_days int default 90)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from funnel_events where created_at < now() - (p_days || ' days')::interval;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.cortex_prune_funnel_events(int) from public, anon, authenticated;
grant  execute on function public.cortex_prune_funnel_events(int) to service_role;


/* ══════════════════════════════════════════════════ 3. lifecycle_sends ══ */
/* From supabase/migrations/2026_zzzc_lifecycle_sends.sql

   Exactly-once. The same claim-before-send pattern as renewal_notices and
   weekly_plan_sends, for the same reason: the cron may run twice, two runs may
   overlap, and the one thing worse than never emailing a new customer is
   emailing them the same nudge every morning for a week.

   THE PRIMARY KEY IS THE LOCK. `insert ... on conflict do nothing` either
   claims the send or tells you somebody else already has — atomically, with no
   transaction and no advisory lock.

   `stage` rather than a day number, so the schedule can change without
   orphaning history, and so "how many people got the import nudge" stays
   answerable if the timing moves from day 2 to day 3.                       */

create table if not exists lifecycle_sends (
  org_id     uuid not null references organizations(id) on delete cascade,
  stage      text not null,
  sent_to    text,
  sent_at    timestamptz not null default now(),
  primary key (org_id, stage)
);

create index if not exists idx_lifecycle_org        on lifecycle_sends(org_id);
create index if not exists idx_lifecycle_stage_time on lifecycle_sends(stage, sent_at desc);

/*
  RLS ON, NO POLICIES — service-role only.

  An anonymous writer could insert a row here and permanently suppress a real
  customer's welcome email.
*/
alter table lifecycle_sends enable row level security;


/* ═══════════════════════════════════════════════════════════ VERIFY ══════

   ONE TABLE, TEN ROWS, EVERY `state` SHOULD READ OK.

   Anything reading MISSING, RLS OFF, or REACHABLE means that line did not take
   effect — send me the output rather than guessing, because a half-applied
   schema is harder to reason about than an unapplied one.
   ======================================================================== */

with checks as (

  -- 1-3. the three lead columns
  select 'leads.company' as object,
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='leads' and column_name='company')
              then 'OK' else 'MISSING' end as state
  union all
  select 'leads.note',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='leads' and column_name='note')
              then 'OK' else 'MISSING' end
  union all
  select 'leads.score',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='leads' and column_name='score')
              then 'OK' else 'MISSING' end

  -- 4. the 0-100 guard on score
  union all
  select 'leads.score 0-100 constraint',
         case when exists (select 1 from pg_constraint where conname='leads_score_range')
              then 'OK' else 'MISSING' end

  -- 5-6. funnel_events exists, and is not readable by tenants
  union all
  select 'funnel_events table',
         case when to_regclass('public.funnel_events') is not null then 'OK' else 'MISSING' end
  union all
  select 'funnel_events RLS',
         case when coalesce((select relrowsecurity from pg_class where relname='funnel_events'), false)
              then 'OK' else 'RLS OFF' end

  -- 7. the prune function must NOT be callable by a stranger
  union all
  select 'cortex_prune_funnel_events locked down',
         case when exists (
                select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='cortex_prune_funnel_events'
                   and (has_function_privilege('anon', p.oid, 'execute')
                     or has_function_privilege('authenticated', p.oid, 'execute')))
              then 'REACHABLE'
              when to_regprocedure('public.cortex_prune_funnel_events(int)') is null
              then 'MISSING'
              else 'OK' end

  -- 8-10. lifecycle_sends exists, RLS on, and the PK that does the locking
  union all
  select 'lifecycle_sends table',
         case when to_regclass('public.lifecycle_sends') is not null then 'OK' else 'MISSING' end
  union all
  select 'lifecycle_sends RLS',
         case when coalesce((select relrowsecurity from pg_class where relname='lifecycle_sends'), false)
              then 'OK' else 'RLS OFF' end
  union all
  -- The primary key IS the exactly-once lock. Without it the cron can send the
  -- same nudge every night, so this is checked explicitly rather than assumed.
  select 'lifecycle_sends (org_id, stage) primary key',
         case when exists (
                select 1 from pg_constraint
                 where conrelid = to_regclass('public.lifecycle_sends')
                   and contype = 'p')
              then 'OK' else 'MISSING' end
)
select object, state from checks
order by case state when 'OK' then 1 else 0 end, object;
