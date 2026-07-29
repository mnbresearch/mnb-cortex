-- v5.0.0 — Agent platform. Safe to run repeatedly.

-- Custom agents that Cortex builds for a workspace.
create table if not exists agent_specs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  industry text default 'custom',
  description text,
  icon text,
  kind text not null default 'reasoning',
  inputs jsonb default '[]'::jsonb,
  prompt text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists agent_specs_org_idx on agent_specs(org_id, created_at desc);

-- Every agent run (for history + revisions + export).
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  agent_id text,
  agent_name text,
  inputs jsonb default '{}'::jsonb,
  output text,
  version int not null default 1,
  status text not null default 'draft',   -- draft | approved
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists agent_runs_org_idx on agent_runs(org_id, created_at desc);

alter table agent_specs enable row level security;
alter table agent_runs enable row level security;

do $$ begin
  create policy agent_specs_sel on agent_specs for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy agent_runs_sel on agent_runs for select using (org_id in (select org_id from memberships where user_id = auth.uid()));
exception when duplicate_object then null; end $$;
