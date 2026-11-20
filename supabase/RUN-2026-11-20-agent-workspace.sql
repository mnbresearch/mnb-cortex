/*
  2026_zzzz_r_agent_workspace.sql — the Agent Workspace: tasks, steps, schedules.

  Run it once in the Supabase SQL editor (it is also shipped as
  supabase/RUN-2026-11-20-agent-workspace.sql, the same text). Idempotent:
  safe to run twice. Additive only: no existing table or column is changed.

  THE SHAPE
    agent_tasks       one row per piece of delegated work. Holds the plan, the
                      status, the credits spent against its ceiling, the final
                      answer and its Veritas v1 verification.
    agent_task_steps  one row per unit of work (plan, a specialist's turn,
                      synthesis, verify). Each is CHECKPOINTED: a step that
                      finished is never re-run, so a task survives a function
                      timeout, a deploy or a crashed runner and resumes from
                      the next pending step.
    agent_schedules   recurring tasks ("every Monday at 9, review receivables").

  WHO MAY WRITE
    Members READ their own workspace's rows (RLS on user_org_ids()). Nobody
    writes through PostgREST: every insert and update comes from the server
    with the service role, after assertRole() and the plan's agent limits in
    lib/agents/tasks.ts — the same model as action_proposals, because a task
    spends credits and can propose actions.

  THE LEASE
    lease_until is how two runners (the open Workspace tab and the 5-minute
    sweeper) avoid working the same task at once. A runner claims a task with
    a conditional UPDATE … WHERE lease_until IS NULL OR lease_until < now()
    RETURNING, and checks it got a row back — PostgREST reports a zero-row
    update as success, so the row count is the only truth.
*/

create table if not exists agent_tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  created_by     uuid,
  title          text not null,
  request        text not null,
  team           text not null default 'finance',
  mode           text not null default 'single' check (mode in ('single', 'team')),
  agent_id       text,                                  -- the single agent, or the team lead
  status         text not null default 'queued'
                 check (status in ('queued', 'running', 'paused', 'done', 'failed', 'cancelled')),
  status_reason  text,
  plan           jsonb,                                 -- [{agent, instruction}] once planned
  result         text,
  verification   jsonb,                                 -- Veritas v1 result
  proposals      int not null default 0,                -- actions this task put on the Approvals page
  credits_used   int not null default 0,
  credit_ceiling int not null default 400,
  background     boolean not null default true,         -- may the sweeper advance it with the tab closed
  schedule_id    uuid,
  lease_until    timestamptz,
  attempts       int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz
);

create index if not exists idx_agent_tasks_org_created on agent_tasks(org_id, created_at desc);
create index if not exists idx_agent_tasks_runnable on agent_tasks(status, lease_until) where status in ('queued', 'running');

create table if not exists agent_task_steps (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references agent_tasks(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  seq          int not null,
  kind         text not null check (kind in ('plan', 'agent', 'synthesis', 'verify')),
  agent_id     text,
  agent_name   text,
  instruction  text,
  status       text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'skipped')),
  output       text,
  tool_calls   jsonb not null default '[]'::jsonb,
  credits      int not null default 0,
  error        text,
  attempts     int not null default 0,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (task_id, seq)
);

create index if not exists idx_agent_task_steps_task on agent_task_steps(task_id, seq);

create table if not exists agent_schedules (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  created_by   uuid,
  title        text not null,
  request      text not null,
  team         text not null default 'finance',
  mode         text not null default 'single' check (mode in ('single', 'team')),
  cadence      text not null default 'weekly' check (cadence in ('daily', 'weekly', 'monthly')),
  hour_ist     int not null default 9 check (hour_ist between 0 and 23),
  weekday      int not null default 1 check (weekday between 0 and 6),   -- 0 = Sunday, for weekly
  monthday     int not null default 1 check (monthday between 1 and 28), -- for monthly
  enabled      boolean not null default true,
  next_run_at  timestamptz not null default now(),
  last_run_at  timestamptz,
  last_task_id uuid,
  created_at   timestamptz not null default now()
);

create index if not exists idx_agent_schedules_due on agent_schedules(enabled, next_run_at);
create index if not exists idx_agent_schedules_org on agent_schedules(org_id, created_at desc);

alter table agent_tasks      enable row level security;
alter table agent_task_steps enable row level security;
alter table agent_schedules  enable row level security;

drop policy if exists "members read agent_tasks" on agent_tasks;
create policy "members read agent_tasks" on agent_tasks for select
  using (org_id in (select user_org_ids()));

drop policy if exists "members read agent_task_steps" on agent_task_steps;
create policy "members read agent_task_steps" on agent_task_steps for select
  using (org_id in (select user_org_ids()));

drop policy if exists "members read agent_schedules" on agent_schedules;
create policy "members read agent_schedules" on agent_schedules for select
  using (org_id in (select user_org_ids()));

/* Writes are server-only (service role), after the role and plan checks in lib/agents/tasks.ts. */
revoke insert, update, delete on agent_tasks      from anon, authenticated;
revoke insert, update, delete on agent_task_steps from anon, authenticated;
revoke insert, update, delete on agent_schedules  from anon, authenticated;
