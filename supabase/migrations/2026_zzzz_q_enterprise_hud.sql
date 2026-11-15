/*
  2026_zzzz_q_enterprise_hud.sql — Enterprise Command HUD, Forensic Audit Sentinel & Digital Twin

  Supports:
  1. enterprise_audit_snapshots: Big-4 pre-flight audit readiness scoring, statutory vectors (MSME, 2B ITC, TDS), and forensic anomaly alerts.
  2. digital_twin_scenarios: Real-time balance sheet shock simulations (debtor freeze, MSME 45-day squeeze, COGS inflation).
*/

-- 1. Enterprise Forensic Audit Snapshots
create table if not exists enterprise_audit_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  score int not null default 100 check (score >= 0 and score <= 100),
  grade text not null default 'A' check (grade in ('A+', 'A', 'B', 'C', 'D')),
  status text not null default 'audit_ready' check (status in ('audit_ready', 'needs_attention', 'high_risk')),
  checks jsonb not null default '[]'::jsonb,
  anomalies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_enterprise_audit_org_time on enterprise_audit_snapshots(org_id, created_at desc);

alter table enterprise_audit_snapshots enable row level security;

drop policy if exists "members read enterprise_audit_snapshots" on enterprise_audit_snapshots;
create policy "members read enterprise_audit_snapshots" on enterprise_audit_snapshots for select
  using (org_id in (select user_org_ids()));

drop policy if exists "members write enterprise_audit_snapshots" on enterprise_audit_snapshots;
create policy "members write enterprise_audit_snapshots" on enterprise_audit_snapshots for insert
  with check (user_org_rank(org_id) >= 2);

drop policy if exists "members update enterprise_audit_snapshots" on enterprise_audit_snapshots;
create policy "members update enterprise_audit_snapshots" on enterprise_audit_snapshots for update
  using (user_org_rank(org_id) >= 2)
  with check (user_org_rank(org_id) >= 2);

drop policy if exists "members delete enterprise_audit_snapshots" on enterprise_audit_snapshots;
create policy "members delete enterprise_audit_snapshots" on enterprise_audit_snapshots for delete
  using (user_org_rank(org_id) >= 3);

-- 2. Digital Twin Scenarios & Stress-Test Simulators
create table if not exists digital_twin_scenarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null default 'Macroeconomic & Liquidity Shock',
  shocks jsonb not null default '{}'::jsonb,
  impact jsonb not null default '{}'::jsonb,
  mitigations jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_digital_twin_org_time on digital_twin_scenarios(org_id, created_at desc);

alter table digital_twin_scenarios enable row level security;

drop policy if exists "members read digital_twin_scenarios" on digital_twin_scenarios;
create policy "members read digital_twin_scenarios" on digital_twin_scenarios for select
  using (org_id in (select user_org_ids()));

drop policy if exists "members write digital_twin_scenarios" on digital_twin_scenarios;
create policy "members write digital_twin_scenarios" on digital_twin_scenarios for insert
  with check (user_org_rank(org_id) >= 2);

drop policy if exists "members update digital_twin_scenarios" on digital_twin_scenarios;
create policy "members update digital_twin_scenarios" on digital_twin_scenarios for update
  using (user_org_rank(org_id) >= 2)
  with check (user_org_rank(org_id) >= 2);

drop policy if exists "members delete digital_twin_scenarios" on digital_twin_scenarios;
create policy "members delete digital_twin_scenarios" on digital_twin_scenarios for delete
  using (user_org_rank(org_id) >= 3);
