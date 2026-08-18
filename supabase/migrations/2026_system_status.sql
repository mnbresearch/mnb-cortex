-- ============================================================
-- MNB CORTEX — system heartbeat
-- Safe to run more than once (idempotent).
--
-- /api/health used to infer whether the daily cron was alive from a side
-- effect (an `activity` row that only appears when a workspace has KPIs and
-- the AI step runs). A perfectly healthy cron over an empty account therefore
-- reported "degraded" — a false alarm, which is as bad as a missed one.
--
-- app_settings can't hold this: its primary key is (org_id, key) and a global
-- value has no org.
-- ============================================================

create table if not exists system_status (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- Service-role only. No policy, so PostgREST exposes nothing to clients.
alter table system_status enable row level security;
