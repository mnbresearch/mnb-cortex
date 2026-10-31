/*
  2026_zzzz_k_demo_workspaces_backfill.sql — demo workspaces stop at 7 days,
  including the ones created before the table existed.

  WHY. 2026_demo_workspaces.sql was never run in production, so every demo the
  super-admin "7-day demo" creator made has no demo_workspaces row. Without the
  row, an expired demo is treated like any lapsed workspace: it keeps working
  for as long as its starting credits last. With the row, the app locks it at
  its end date (billing.ts compulsoryUpgrade) and the server refuses AI calls
  (credits.ts), whatever is left in the balance.

  WHAT THIS DOES — nothing is stopped today:
    1. Creates demo_workspaces if it is missing (same table and safe policy as
       the fixed 2026_demo_workspaces.sql). Idempotent.
    2. Finds every demo the creator provisioned — an `enterprise` workspace
       with the demo's gold accent or a "… (Demo)" name — that is STILL on its
       trial (not paid, not cancelled) and has no row yet.
    3. Records it with expires_at = the moment it was provisioned + its demo
       length (read from its trial clock; 7 days by default), and sets the
       workspace's trial_ends_at to that same moment, so it runs normally until
       then and locks automatically at it.
  A demo that already became a paying customer (status active) is not touched.

  Re-runnable: a workspace that already has a row is skipped.
*/

-- 1 ── the table (identical to the fixed 2026_demo_workspaces.sql)
create table if not exists demo_workspaces (
  org_id uuid primary key references organizations(id) on delete cascade,
  email text not null,
  name text,
  company text,
  preset text not null default 'enterprise_full',
  features text[] not null default '{}',
  duration_days int not null default 7,
  expires_at timestamptz not null,
  compulsory_upgrade boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_demo_workspaces_email on demo_workspaces(email);
create index if not exists idx_demo_workspaces_expires_at on demo_workspaces(expires_at);
alter table demo_workspaces enable row level security;
drop policy if exists "superadmin manage demo workspaces" on demo_workspaces;
drop policy if exists "members read own demo details" on demo_workspaces;
create policy "members read own demo details"
  on demo_workspaces for select
  using (exists (
    select 1 from memberships m
    where m.org_id = demo_workspaces.org_id and m.user_id = auth.uid()
  ));
revoke insert, update, delete on demo_workspaces from anon, authenticated;

-- 2 + 3 ── backfill the demos created before the table existed
--
-- How a demo is recognised. provisionDemoCustomer() is the only code that
-- creates an `enterprise` workspace, and it gives it accent 'gold' (the column
-- default is 'indigo') and, when no company name is typed, a "… (Demo)" name.
-- It then sets trial_ends_at = provisioning time + the demo length. (An earlier
-- version of this file read org_billing_log, which is not present on every
-- database.)
with candidates as (
  select o.id as org_id,
         o.name,
         coalesce(o.created_at, now()) as provisioned_at,
         greatest(1, least(90, coalesce(
           round(extract(epoch from (o.trial_ends_at - o.created_at)) / 86400.0)::int,
           7))) as days
    from organizations o
   where lower(coalesce(o.plan, '')) = 'enterprise'
     and (lower(coalesce(o.accent, '')) = 'gold' or o.name ilike '%(Demo)')
     and lower(coalesce(o.subscription_status, 'trialing')) = 'trialing'
     and not exists (select 1 from demo_workspaces d where d.org_id = o.id)
),
picked as (
  select c.org_id, c.days, c.name,
         c.provisioned_at + make_interval(days => c.days) as expires_at,
         coalesce(
           (select i.email from invites i where i.org_id = c.org_id and i.role::text = 'owner' order by i.created_at asc limit 1),
           (select u.email from memberships m join auth.users u on u.id = m.user_id
             where m.org_id = c.org_id and m.role::text = 'owner' order by m.created_at asc limit 1),
           'unknown'
         ) as email
    from candidates c
),
ins as (
  insert into demo_workspaces (org_id, email, name, company, preset, features, duration_days, expires_at, compulsory_upgrade, created_at)
  select org_id, email, null, name, 'backfilled', '{}', days, expires_at, true, now()
    from picked
  returning org_id, expires_at
)
update organizations o
   set trial_ends_at = ins.expires_at
  from ins
 where o.id = ins.org_id;

-- Result: every demo workspace, when it stops, and how long it has left.
select o.name                                                      as workspace,
       d.email,
       d.preset,
       d.duration_days                                             as days,
       to_char(d.expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST' as stops_at,
       case when d.expires_at > now()
            then round(extract(epoch from (d.expires_at - now())) / 86400.0, 1) || ' days left'
            else 'stopped' end                                     as status,
       to_char(o.trial_ends_at at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST' as trial_ends_at
  from demo_workspaces d
  join organizations o on o.id = d.org_id
 order by d.expires_at;
