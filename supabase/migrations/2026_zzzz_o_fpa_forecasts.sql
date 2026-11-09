/*
  2026_zzzz_o_fpa_forecasts.sql — Driver-Based Financial Planning & Analysis (FP&A)
  Stores dynamic rolling budgets, operational driver correlations,
  variance commentary, and board pack integrations.
*/

create table if not exists fpa_models (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null default 'Base Operating Model',
  fiscal_year text not null default '2026-27',
  drivers jsonb not null default '[]'::jsonb,
  budget_lines jsonb not null default '[]'::jsonb,
  actuals_snapshot jsonb not null default '{}'::jsonb,
  variance_commentary text,
  executive_summary text,
  last_audited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fpa_models_org_idx on fpa_models (org_id, fiscal_year);

alter table fpa_models enable row level security;

drop policy if exists "members read fpa_models" on fpa_models;
create policy "members read fpa_models" on fpa_models for select using (org_id in (select user_org_ids()));

drop policy if exists "members write fpa_models" on fpa_models;
create policy "members write fpa_models" on fpa_models for insert with check (org_id in (select user_org_ids()));

drop policy if exists "members update fpa_models" on fpa_models;
create policy "members update fpa_models" on fpa_models for update using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));

drop policy if exists "members delete fpa_models" on fpa_models;
create policy "members delete fpa_models" on fpa_models for delete using (org_id in (select user_org_ids()));
