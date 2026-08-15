-- ============================================================
-- MNB CORTEX — security & billing hardening
-- Safe to run more than once (idempotent).
--
-- 1. RLS on the two tables that were missed (credit_ledger, org_billing_log)
-- 2. Lock down SECURITY DEFINER functions that PostgREST exposes to anon
-- 3. Subscription periods so a paid plan actually expires
-- 4. A shared rate-limit bucket for public/unauthenticated endpoints
--
-- NOTE: the auth signup trigger is deliberately NOT changed here.
-- See 2026_signup_trigger.sql — it needs a manual check first, because this
-- Supabase project is shared with Toppers Hub Academy.
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
do $$
begin
  if to_regclass('public.credit_ledger') is not null then
    execute 'alter table credit_ledger enable row level security';
    execute 'drop policy if exists "tenant read credit_ledger" on credit_ledger';
    execute 'create policy "tenant read credit_ledger" on credit_ledger
               for select using (org_id in (select user_org_ids()))';
  end if;

  if to_regclass('public.org_billing_log') is not null then
    execute 'alter table org_billing_log enable row level security';
    execute 'drop policy if exists "tenant read org_billing_log" on org_billing_log';
    execute 'create policy "tenant read org_billing_log" on org_billing_log
               for select using (org_id in (select user_org_ids()))';
  end if;
end $$;


-- ------------------------------------------------------------
-- 2. Lock down the money-moving RPCs
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and PostgREST
-- happily exposes them. grant_credits() reachable by `authenticated` is a
-- self-serve credit printer; charge_credits/sync_allowance are equally
-- sensitive. All of these are only ever called from the server with the
-- service role, which bypasses these grants.
--
-- api_ingest, api_metrics, public_report and seed_demo_data are intentionally
-- left alone: they ARE called with the anon/user client and do their own
-- key/RLS checks.
-- ------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'charge_credits(uuid,bigint,uuid,text,jsonb)',
    'grant_credits(uuid,bigint,uuid,text,jsonb)',
    'sync_allowance(uuid,bigint,integer)',
    'bump_memory_refs(uuid[])'
  ] loop
    begin
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
    exception when undefined_function or undefined_object then
      null; -- not created on this database yet
    end;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 3. Subscription periods
--
-- Previously a single payment set subscription_status='active' with no end
-- date, so one payment bought the plan forever.
-- ------------------------------------------------------------
alter table organizations add column if not exists subscription_ends_at timestamptz;
alter table organizations add column if not exists subscription_cycle text;  -- 'monthly' | 'annual'

create index if not exists organizations_sub_ends_idx
  on organizations (subscription_ends_at)
  where subscription_status = 'active';

-- Backfill, carefully.
--
-- The cycle was never persisted, so we recover it by matching what the customer
-- actually PAID against the plan catalogue: for any given plan the annual price
-- is ~9.6x the monthly one, so the nearest price wins.
--
-- Deliberately conservative:
--   * only touches orgs that have a real subscription payment on record
--   * an org with no payment row (a manual super-admin grant) keeps a NULL end
--     date, which the app treats as "never expires" — so nobody is locked out
--     by running this
--   * only fills a NULL, so re-running the file can't shorten anyone's period
do $$
begin
  if to_regclass('public.subscriptions') is null then
    raise notice 'subscriptions table absent — skipping period backfill';
    return;
  end if;

  with catalogue(plan, monthly, annual) as (
    values ('solo',      799.0,   7670.0),
           ('starter',  2499.0,  23990.0),
           ('growth',   6999.0,  67190.0),
           ('premium', 17999.0, 172790.0),
           ('business',39999.0, 383990.0)
  ),
  latest as (
    select distinct on (s.org_id)
           s.org_id, s.created_at, s.amount, lower(coalesce(s.plan, '')) as plan
      from subscriptions s
     where s.status = 'active'
     order by s.org_id, s.created_at desc
  ),
  resolved as (
    select l.org_id,
           l.created_at,
           case when c.annual is not null
                     and abs(l.amount - c.annual) < abs(l.amount - c.monthly)
                then 'annual' else 'monthly' end as cycle
      from latest l
      left join catalogue c on c.plan = l.plan
  )
  update organizations o
     set subscription_ends_at = r.created_at
                                + case when r.cycle = 'annual'
                                       then interval '365 days'
                                       else interval '30 days' end,
         subscription_cycle   = coalesce(o.subscription_cycle, r.cycle)
    from resolved r
   where o.id = r.org_id
     and o.subscription_status = 'active'
     and o.subscription_ends_at is null;
end $$;

-- Daily sweep: flip lapsed paid workspaces to 'expired'. Returns how many.
-- A NULL subscription_ends_at means "no period recorded" and is left alone, so
-- a manually-granted workspace is never silently switched off.
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

revoke execute on function expire_lapsed_subscriptions() from public, anon, authenticated;


-- ------------------------------------------------------------
-- 4. Rate limiting for public endpoints
--
-- A shared counter keyed by an arbitrary string (vis:ip:1.2.3.4,
-- vis:email:a@b.com, vis:global). Atomic, so it works across serverless
-- instances — an in-memory limiter would reset on every cold start.
-- ------------------------------------------------------------
create table if not exists rate_limits (
  key          text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);

-- RLS on with NO policies: clients can never read or write it.
-- Only the service role (which bypasses RLS) touches this table.
alter table rate_limits enable row level security;

/**
 * Record one hit against `p_key`. Returns TRUE when the caller is still within
 * the allowance, FALSE when they've exceeded `p_limit` in `p_window_secs`.
 * The window rolls: once it's older than p_window_secs the counter resets.
 */
create or replace function rate_limit_hit(p_key text, p_limit integer, p_window_secs integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare cur integer;
begin
  insert into rate_limits (key, count, window_start)
       values (p_key, 1, now())
  on conflict (key) do update
      set count        = case when rate_limits.window_start < now() - make_interval(secs => p_window_secs)
                              then 1 else rate_limits.count + 1 end,
          window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_secs)
                              then now() else rate_limits.window_start end
  returning count into cur;

  return cur <= p_limit;
end $$;

-- Housekeeping: drop buckets nobody has touched in a day.
create or replace function prune_rate_limits()
returns void language sql security definer set search_path = public as $$
  delete from rate_limits where window_start < now() - interval '1 day';
$$;

-- Without these, anyone could call prune_rate_limits() over PostgREST to wipe
-- every bucket, or burn the global bucket with rate_limit_hit() — which would
-- defeat the entire limiter.
revoke execute on function rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function prune_rate_limits() from public, anon, authenticated;
