-- v3.4.0 — super-admin managed credit balance per workspace.
-- Safe to run more than once.
alter table organizations
  add column if not exists credits bigint not null default 0;

-- Optional: keep a light audit trail of super-admin billing changes.
create table if not exists org_billing_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  actor text,
  action text,
  detail jsonb,
  created_at timestamptz not null default now()
);
