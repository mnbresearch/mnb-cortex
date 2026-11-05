/*
  2026_zzzz_n_close_checklists.sql — Autonomous Month-End Close & Variance Engine
  Supports continuous audit-readiness and reconciliation tracking across:
  - Bank vs Invoices
  - GSTR-2B vs Purchase Register
  - TDS deduction verification
  - Variance & Anomaly analysis
*/

create table if not exists close_checklists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  period text not null, -- e.g. "2026-10", "2026-11"
  status text not null default 'in_progress' check (status in ('in_progress', 'ready_for_review', 'closed', 'reopened')),
  items jsonb not null default '[]'::jsonb,
  variance_summary jsonb not null default '{}'::jsonb,
  reconciled_by uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists close_checklists_org_idx on close_checklists (org_id, period);

alter table close_checklists enable row level security;

drop policy if exists "members read close_checklists" on close_checklists;
create policy "members read close_checklists" on close_checklists for select using (org_id in (select user_org_ids()));

drop policy if exists "members write close_checklists" on close_checklists;
create policy "members write close_checklists" on close_checklists for insert with check (org_id in (select user_org_ids()));

drop policy if exists "members update close_checklists" on close_checklists;
create policy "members update close_checklists" on close_checklists for update using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));

drop policy if exists "members delete close_checklists" on close_checklists;
create policy "members delete close_checklists" on close_checklists for delete using (org_id in (select user_org_ids()));
