-- MNB Cortex — 14-day trial enforcement (run once in Supabase SQL editor)

alter table organizations add column if not exists trial_ends_at timestamptz;
alter table organizations add column if not exists subscription_status text default 'trialing'; -- trialing | active | canceled

-- Backfill: 14-day trial from the org's creation date.
update organizations
  set trial_ends_at = coalesce(trial_ends_at, created_at + interval '14 days')
  where trial_ends_at is null;

update organizations set subscription_status = 'trialing' where subscription_status is null;
