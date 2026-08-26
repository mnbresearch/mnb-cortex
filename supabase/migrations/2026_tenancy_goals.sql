-- ============================================================
-- MNB CORTEX — goals that belong to the workspace.
-- Safe to run more than once (idempotent).
--
-- The Goals page says "Objectives and Key Results, wired to your live data"
-- and "Cortex measures progress against your live numbers".
--
-- What it actually did was seed four DEMO-COMPANY figures — gross margin
-- 31→33%, monthly revenue ₹4.25→5.0 Cr, receivables overdue ₹72→30 L, cash
-- runway 5→9 months — into localStorage, where they immediately became sticky
-- and indistinguishable from goals the owner had set. Progress rings were then
-- drawn against another company's current values.
--
-- Goals now live with the workspace, and `metric_key` links a goal to a real
-- KPI so "current" is read from health_metrics rather than typed in and left
-- to rot. A goal with no metric_key is a free-form target the owner tracks by
-- hand, which is a legitimate thing to want.
-- ============================================================

create table if not exists goals (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  -- Optional link to health_metrics.metric_key. When set, `current` is derived
  -- and the stored value is ignored.
  metric_key  text,
  current_val numeric not null default 0,
  target_val  numeric not null default 0,
  unit        text default '',
  -- Lower is better for overdue receivables, attrition, debt, churn.
  lower_is_better boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_goals_org on goals(org_id, created_at);

alter table goals enable row level security;

-- Same split as every other tenant table: a viewer can see the targets the
-- business is working to, and cannot change them.
drop policy if exists "tenant read goals"   on goals;
drop policy if exists "tenant insert goals" on goals;
drop policy if exists "tenant update goals" on goals;
drop policy if exists "tenant delete goals" on goals;

create policy "tenant read goals" on goals for select
  using (org_id in (select user_org_ids()));

create policy "tenant insert goals" on goals for insert
  with check (user_org_rank(org_id) >= 2);

create policy "tenant update goals" on goals for update
  using (user_org_rank(org_id) >= 2)
  with check (user_org_rank(org_id) >= 2);

create policy "tenant delete goals" on goals for delete
  using (user_org_rank(org_id) >= 3);
