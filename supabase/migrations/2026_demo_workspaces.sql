/*
  Demo Workspaces & Custom Feature Provisioning.

  Allows Super Admins to provision custom 7-day demo workspaces with customized
  feature sets, starting AI credits, optional sample data, and compulsory upgrade
  enforcement upon 7-day expiration.
*/

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

-- Platform Super Admins can manage demo workspaces
create policy "superadmin manage demo workspaces"
  on demo_workspaces for all
  using (
    exists (
      select 1 from memberships m
      join organizations o on o.id = m.org_id
      where m.user_id = auth.uid() and m.role = 'owner'
    )
  );

-- Workspace members can read their own demo details
create policy "members read own demo details"
  on demo_workspaces for select
  using (
    exists (
      select 1 from memberships m
      where m.org_id = demo_workspaces.org_id and m.user_id = auth.uid()
    )
  );
