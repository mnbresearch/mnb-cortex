/*
  2026_zzzz_m_bond_cortex_features.sql — Executive Chief of Staff capabilities:
  1. Priority expansion (P0/P1/P2/P3), waiting_on, due_date, and context_source for action_tasks.
  2. Commitments table: Automated follow-up and promise tracking across counterparties.
  3. Routines table: Executive automated routines running on schedules.
*/

-- 1. Extend action_tasks
alter table action_tasks drop constraint if exists action_tasks_priority_check;
alter table action_tasks add constraint action_tasks_priority_check check (priority in ('P0', 'P1', 'P2', 'P3'));

alter table action_tasks add column if not exists waiting_on text;
alter table action_tasks add column if not exists due_date date;
alter table action_tasks add column if not exists context_source text;

-- 2. Commitments tracking
create table if not exists commitments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  party text not null,
  direction text not null check (direction in ('we_promised', 'they_promised')),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'slipped')),
  context text,
  source text not null default 'user' check (source in ('user', 'ai', 'integration')),
  created_by uuid,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create index if not exists commitments_org_idx on commitments (org_id, status, due_date);

alter table commitments enable row level security;

drop policy if exists "members read commitments" on commitments;
create policy "members read commitments" on commitments for select using (org_id in (select user_org_ids()));

drop policy if exists "members write commitments" on commitments;
create policy "members write commitments" on commitments for insert with check (org_id in (select user_org_ids()));

drop policy if exists "members update commitments" on commitments;
create policy "members update commitments" on commitments for update using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));

drop policy if exists "members delete commitments" on commitments;
create policy "members delete commitments" on commitments for delete using (org_id in (select user_org_ids()));

-- 3. Executive Routines
create table if not exists executive_routines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  action_type text not null check (action_type in ('brief', 'triage', 'commitments', 'digest')),
  is_active boolean not null default true,
  last_run timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists executive_routines_org_idx on executive_routines (org_id, is_active);

alter table executive_routines enable row level security;

drop policy if exists "members read executive_routines" on executive_routines;
create policy "members read executive_routines" on executive_routines for select using (org_id in (select user_org_ids()));

drop policy if exists "members write executive_routines" on executive_routines;
create policy "members write executive_routines" on executive_routines for insert with check (org_id in (select user_org_ids()));

drop policy if exists "members update executive_routines" on executive_routines;
create policy "members update executive_routines" on executive_routines for update using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));

drop policy if exists "members delete executive_routines" on executive_routines;
create policy "members delete executive_routines" on executive_routines for delete using (org_id in (select user_org_ids()));

-- Rank gates for commitments and executive_routines:
-- write needs analyst (rank >= 2), delete needs manager (rank >= 3)
create or replace function user_org_rank(p_org uuid) returns int language sql stable as $$
  select coalesce(max(case m.role
           when 'owner' then 5 when 'admin' then 4 when 'manager' then 3
           when 'analyst' then 2 when 'viewer' then 1 else 0 end), 0)
    from memberships m
   where m.user_id = auth.uid()
     and m.org_id = p_org;
$$;

drop policy if exists "members write commitments" on commitments;
create policy "members write commitments" on commitments for insert
  with check (org_id in (select user_org_ids()) and user_org_rank(org_id) >= 2);

drop policy if exists "members update commitments" on commitments;
create policy "members update commitments" on commitments for update
  using (org_id in (select user_org_ids()) and user_org_rank(org_id) >= 2)
  with check (org_id in (select user_org_ids()) and user_org_rank(org_id) >= 2);

drop policy if exists "members delete commitments" on commitments;
create policy "members delete commitments" on commitments for delete
  using (org_id in (select user_org_ids()) and user_org_rank(org_id) >= 3);

drop policy if exists "members write executive_routines" on executive_routines;
create policy "members write executive_routines" on executive_routines for insert
  with check (org_id in (select user_org_ids()) and user_org_rank(org_id) >= 2);

drop policy if exists "members update executive_routines" on executive_routines;
create policy "members update executive_routines" on executive_routines for update
  using (org_id in (select user_org_ids()) and user_org_rank(org_id) >= 2)
  with check (org_id in (select user_org_ids()) and user_org_rank(org_id) >= 2);

drop policy if exists "members delete executive_routines" on executive_routines;
create policy "members delete executive_routines" on executive_routines for delete
  using (org_id in (select user_org_ids()) and user_org_rank(org_id) >= 3);
