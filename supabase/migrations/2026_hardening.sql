-- ============================================================
-- MNB CORTEX — security & billing hardening
-- Safe to run more than once (idempotent).
--
-- 1. RLS on the two tables that were missed (credit_ledger, org_billing_log)
-- 2. Subscription periods so a paid plan actually expires
-- 3. A shared rate-limit bucket for public/unauthenticated endpoints
-- 4. Stop the auth signup trigger creating a Cortex workspace for users of the
--    OTHER products that share this Supabase project (e.g. Toppers Hub Academy)
-- ============================================================


-- ------------------------------------------------------------
-- 1. RLS — credit_ledger + org_billing_log
--
-- These two tables were created without RLS. With Supabase's default grants to
-- `anon`/`authenticated`, that meant any signed-in user of ANY app on this
-- project could read (and write) every workspace's billing history.
-- Reads are scoped to workspace membership; all writes stay server-side via the
-- service role, which bypasses RLS.
-- ------------------------------------------------------------
alter table credit_ledger enable row level security;
drop policy if exists "tenant read credit_ledger" on credit_ledger;
create policy "tenant read credit_ledger" on credit_ledger
  for select using (org_id in (select user_org_ids()));

alter table org_billing_log enable row level security;
drop policy if exists "tenant read org_billing_log" on org_billing_log;
create policy "tenant read org_billing_log" on org_billing_log
  for select using (org_id in (select user_org_ids()));


-- ------------------------------------------------------------
-- 2. Subscription periods
--
-- Previously a single payment set subscription_status='active' with no end
-- date, so one payment bought the plan forever. Track when the paid period ends.
-- ------------------------------------------------------------
alter table organizations add column if not exists subscription_ends_at timestamptz;
alter table organizations add column if not exists subscription_cycle text;  -- 'monthly' | 'annual'

-- Backfill: give every CURRENTLY active workspace a fair 30-day window from now
-- rather than expiring them the moment this migration lands.
update organizations
   set subscription_ends_at = now() + interval '30 days',
       subscription_cycle   = coalesce(subscription_cycle, 'monthly')
 where subscription_status = 'active'
   and subscription_ends_at is null;

create index if not exists organizations_sub_ends_idx
  on organizations (subscription_ends_at)
  where subscription_status = 'active';

-- Daily sweep: flip lapsed paid workspaces to 'expired'. Returns how many.
-- A NULL subscription_ends_at is treated as "no period recorded" and is left
-- alone, so a manually-granted workspace is never silently switched off.
create or replace function expire_lapsed_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with lapsed as (
    update organizations
       set subscription_status = 'expired'
     where subscription_status = 'active'
       and subscription_ends_at is not null
       and subscription_ends_at < now()
    returning id
  )
  select count(*) into n from lapsed;
  return coalesce(n, 0);
end $$;


-- ------------------------------------------------------------
-- 3. Rate limiting for public endpoints
--
-- A shared counter keyed by an arbitrary string (ip:1.2.3.4, email:a@b.com,
-- global:visibility). Atomic, so it works across serverless instances — an
-- in-memory limiter would reset on every cold start and protect nothing.
-- ------------------------------------------------------------
create table if not exists rate_limits (
  key         text primary key,
  count       integer not null default 0,
  window_start timestamptz not null default now()
);

-- RLS on, with NO policies: clients can never read or write it.
-- Only the service role (which bypasses RLS) touches this table.
alter table rate_limits enable row level security;

/**
 * Record one hit against `p_key`. Returns TRUE when the caller is still within
 * the allowance, FALSE when they've exceeded `p_limit` in `p_window_secs`.
 * The window rolls: once it's older than p_window_secs the counter resets.
 */
create or replace function rate_limit_hit(p_key text, p_limit integer, p_window_secs integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare cur integer; started timestamptz;
begin
  insert into rate_limits (key, count, window_start)
       values (p_key, 1, now())
  on conflict (key) do update
      set count        = case when rate_limits.window_start < now() - make_interval(secs => p_window_secs)
                              then 1 else rate_limits.count + 1 end,
          window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_secs)
                              then now() else rate_limits.window_start end
  returning count, window_start into cur, started;

  return cur <= p_limit;
end $$;

-- Housekeeping: drop buckets nobody has touched in a day.
create or replace function prune_rate_limits()
returns void language sql security definer set search_path = public as $$
  delete from rate_limits where window_start < now() - interval '1 day';
$$;


-- ------------------------------------------------------------
-- 4. Signup trigger — stop leaking workspaces across products
--
-- This Supabase project also backs Toppers Hub Academy, and the old
-- handle_new_user() created a Cortex organization + owner membership for EVERY
-- auth.users insert — so every Toppers Hub signup silently produced an empty
-- "My Company" Cortex workspace.
--
-- The profile row is still created (harmless and shared). Workspace creation is
-- now owned entirely by the app: ensureWorkspace() in src/lib/workspace.ts runs
-- after sign-in on Cortex only, is idempotent, and names the workspace properly.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
       values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;
