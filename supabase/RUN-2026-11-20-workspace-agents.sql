/*
  2026_zzzz_u_workspace_agents.sql — AGENT STUDIO: a workspace's own agents.

  A workspace agent is a specialist the company defines in plain words and
  then shapes: which team it joins, its instructions, and — the point of the
  feature — exactly which tools it may use. It runs through the same task
  runner as the built-in agents (lib/agents/tasks.ts): its steps are metered,
  checkpointed, cited and checked by Veritas v1, and anything it wants done
  goes to Approvals through propose_action, never straight out.

  `tools` is validated server-side against the tool catalogue
  (lib/agents/studio.ts); an unknown name never reaches the model.

  Members read; writes are server-only after the role and plan checks in
  lib/agents/workspace-agents.ts. Idempotent and additive.
  Also shipped as supabase/RUN-2026-11-20-workspace-agents.sql.
*/

create table if not exists workspace_agents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  team         text not null check (team in ('finance', 'operations', 'growth')),
  name         text not null,
  role         text not null default '',
  instructions text not null default '',
  tools        text[] not null default '{}',
  keywords     text[] not null default '{}',
  active       boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_workspace_agents_org on workspace_agents(org_id, active, created_at);

alter table workspace_agents enable row level security;

drop policy if exists "members read workspace_agents" on workspace_agents;
create policy "members read workspace_agents" on workspace_agents for select
  using (org_id in (select user_org_ids()));

revoke insert, update, delete on workspace_agents from anon, authenticated;
