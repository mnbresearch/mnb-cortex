/* ===========================================================================
   NOTHING IS EVER EMAILED TO SOMEONE WHO SIGNED UP AND DID NOT PAY.

   Every outbound email in this product goes to an existing customer: the
   weekly changelog, the Monday plan, renewal reminders, receipts, alerts.
   There is no welcome, no "you never imported anything", no re-engagement.
   `ensureWorkspace()` contains no sendEmail call at all.

   So the sequence today is: someone signs up, lands on a wizard, hits the
   paywall, closes the tab — and is never contacted again. Given TRIAL_DAYS is
   0, that is EVERY signup who does not pay in their first session.

   Meanwhile first-run.ts already computes, precisely, which of the four setup
   steps each workspace is stuck on. That state is rendered in the app and
   emailed to nobody.

   WHY THIS TABLE

   Exactly-once. The claim-before-send pattern used by renewal_notices and
   weekly_plan_sends, for the same reason: the cron may run twice, two runs may
   overlap, and the one thing worse than never emailing a new customer is
   emailing them the same nudge every morning for a week.

   The primary key IS the lock. `insert ... on conflict do nothing` either
   claims the send or tells you somebody else already has, atomically, without
   a transaction or an advisory lock.

   `stage` rather than a day number, so the schedule can change without
   orphaning history — and so "how many people got the import nudge" stays
   answerable if the timing moves from day 2 to day 3.

   Safe to run, and safe to run twice.
   =========================================================================== */

create table if not exists lifecycle_sends (
  org_id     uuid not null references organizations(id) on delete cascade,
  /* welcome | setup_nudge | import_nudge | last_call — see lib/lifecycle.ts */
  stage      text not null,
  sent_to    text,
  sent_at    timestamptz not null default now(),
  primary key (org_id, stage)
);

/* The cron's own query: "which stages has this workspace already had". */
create index if not exists idx_lifecycle_org on lifecycle_sends(org_id);
/* The operator's: "how many of each stage went out, and when". */
create index if not exists idx_lifecycle_stage_time on lifecycle_sends(stage, sent_at desc);

/*
  RLS ON, NO POLICIES — service-role only.

  Written by the nightly cron with the service client. A tenant reading this
  learns nothing useful about itself and could learn the send cadence of
  others; an anonymous writer could insert a row and permanently suppress a
  real customer's welcome email. Denied to anon and authenticated is the whole
  intent, and no policy is how that is expressed.
*/
alter table lifecycle_sends enable row level security;

/* ---------------------------------------------------------------- verify ---
   Expect: created, rls on, and zero policies.
   -------------------------------------------------------------------------- */
select
  case when to_regclass('public.lifecycle_sends') is not null then 'created' else 'MISSING' end as table_state,
  case when (select relrowsecurity from pg_class where relname = 'lifecycle_sends') then 'rls on' else 'RLS OFF' end as rls,
  (select count(*) from pg_policies where tablename = 'lifecycle_sends') as policies;
