-- Leads (public pricing inquiries) + Integrations
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text, email text, phone text, plan text, source text default 'pricing',
  created_at timestamptz default now()
);
alter table leads enable row level security;
drop policy if exists "anon insert leads" on leads;
create policy "anon insert leads" on leads for insert to anon with check (true);
drop policy if exists "auth insert leads" on leads;
create policy "auth insert leads" on leads for insert to authenticated with check (true);
drop policy if exists "auth read leads" on leads;
create policy "auth read leads" on leads for select to authenticated using (true);
drop policy if exists "auth delete leads" on leads;
create policy "auth delete leads" on leads for delete to authenticated using (true);

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  provider text not null,
  status text default 'connected',
  config jsonb default '{}',
  created_at timestamptz default now(),
  unique(org_id, provider)
);
alter table integrations enable row level security;
drop policy if exists "tenant integrations" on integrations;
create policy "tenant integrations" on integrations for all
  using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));
