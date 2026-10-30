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

/*
  WRITES ARE SERVICE-ROLE ONLY.

  The first version of this file had a policy named "superadmin manage demo
  workspaces" granting FOR ALL to anyone who was `owner` of ANY workspace —
  i.e. every customer. That exposed every prospect's email and company, and
  let a demo user delete their own row to escape the compulsory-upgrade lock.
  Super-admins provision through provisionDemoCustomer(), which uses the
  service role and bypasses RLS, so no write policy is needed at all.
  2026_zzzz_i_demo_workspaces_rls.sql removes the old policy where it was
  already applied.
*/
drop policy if exists "superadmin manage demo workspaces" on demo_workspaces;

-- Workspace members can read their own demo details (nothing else).
drop policy if exists "members read own demo details" on demo_workspaces;
create policy "members read own demo details"
  on demo_workspaces for select
  using (
    exists (
      select 1 from memberships m
      where m.org_id = demo_workspaces.org_id and m.user_id = auth.uid()
    )
  );

revoke insert, update, delete on demo_workspaces from anon, authenticated;
