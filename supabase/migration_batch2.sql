-- ===== Batch 2: customers (CRM), activity log, invites =====

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text, company text, email text, phone text,
  status text default 'lead',        -- lead | active | churned
  value numeric default 0,
  last_touch date default current_date,
  notes text,
  created_at timestamptz default now()
);
alter table customers enable row level security;
drop policy if exists "tenant customers" on customers;
create policy "tenant customers" on customers for all
  using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));

create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text,                          -- ai | approval | import | workflow | crud | data
  message text,
  created_at timestamptz default now()
);
alter table activity enable row level security;
drop policy if exists "tenant activity" on activity;
create policy "tenant activity" on activity for all
  using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));
create index if not exists idx_activity_org on activity(org_id, created_at desc);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role member_role not null default 'analyst',
  status text default 'pending',      -- pending | accepted
  created_at timestamptz default now()
);
alter table invites enable row level security;
drop policy if exists "tenant invites" on invites;
create policy "tenant invites" on invites for all
  using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));

-- Signup trigger now also consumes pending invites for the new user's email
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_org uuid; inv record;
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.organizations (name, industry, annual_revenue_cr) values ('My Company','manufacturing',25) returning id into new_org;
  insert into public.memberships (org_id, user_id, role) values (new_org, new.id, 'owner');
  for inv in select * from public.invites where lower(email) = lower(new.email) and status = 'pending' loop
    insert into public.memberships (org_id, user_id, role) values (inv.org_id, new.id, inv.role) on conflict do nothing;
    update public.invites set status = 'accepted' where id = inv.id;
  end loop;
  return new;
end $$;
