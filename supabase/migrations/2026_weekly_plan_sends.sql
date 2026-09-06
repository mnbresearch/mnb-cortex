/* ===========================================================================
   The Monday plan email, made exactly-once and resumable.

   WHY THIS TABLE EXISTS

   The landing page promises "One email on Monday: the three things worth your
   attention this week", and sendWeeklyPlans() delivers precisely that. Turning
   it on surfaced two problems that only matter once it is actually running:

     1. NO IDEMPOTENCY. The send had no record of itself. A cron retry, a
        duplicate platform invocation, or an operator hitting the manual
        /api/cron/weekly-plan endpoint on a Monday would mail every customer
        the same plan a second time. A duplicate marketing email is annoying;
        a duplicate "here is what to do about your business this week" is
        confusing, because the customer cannot tell whether something changed.

     2. SILENT TRUNCATION AT 60 WORKSPACES. The loop reads 200 organizations
        and then slices the first 60, because buildPriorities() makes one model
        call per workspace and the whole cron shares a 300s budget. The cap is
        sound; the silence is not. Workspace number 61, ordered by whatever
        Postgres felt like returning, would never receive the email it was sold
        — and nothing anywhere would say so.

   This table fixes both with the same fact: which workspaces have already had
   THIS week's plan. Already-sent workspaces are skipped (that is the
   idempotency), and the daily cron keeps working through the remainder for the
   rest of the week (that is the resumability). 60 per day across seven days
   covers 420 workspaces a week, and every workspace gets exactly one email.

   `week` is the ISO-week key computed from Monday IST, so it rolls over on the
   same boundary the cron uses to decide a new week has begun.
   =========================================================================== */

create table if not exists weekly_plan_sends (
  org_id     uuid not null references organizations(id) on delete cascade,
  week       text not null,                       -- e.g. '2026-W37', Monday-based
  recipients integer not null default 0,
  sent_at    timestamptz not null default now(),
  primary key (org_id, week)
);

create index if not exists idx_weekly_plan_sends_week on weekly_plan_sends(week, sent_at desc);

/* Service-role only. No customer needs to read this, and no customer should be
   able to delete a row to make themselves eligible for a second send. RLS on
   with no policies = deny to anon and authenticated, allow to service_role,
   which is the shape used by every other operational table here. */
alter table weekly_plan_sends enable row level security;
