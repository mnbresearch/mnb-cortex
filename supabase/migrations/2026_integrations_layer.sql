-- ============================================================
-- MNB CORTEX — outbound webhooks + scheduled reports
-- Safe to run more than once (idempotent).
-- ============================================================

-- ------------------------------------------------------------
-- Outbound webhooks.
-- "Public API + webhooks" was sold on the Business plan; the API was real,
-- webhooks did not exist in any form.
-- ------------------------------------------------------------
create table if not exists webhook_endpoints (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  url        text not null,
  secret     text not null,              -- HMAC-SHA256 signing secret, shown once
  events     text[] not null default '{}',  -- empty = every event
  is_active  boolean not null default true,
  label      text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  last_error text,
  fail_count int not null default 0
);
create index if not exists webhook_endpoints_org_idx on webhook_endpoints (org_id);

-- Delivery attempts double as the retry queue: anything pending with attempts
-- remaining is retried by the daily cron.
create table if not exists webhook_deliveries (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  endpoint_id  uuid not null references webhook_endpoints(id) on delete cascade,
  event        text not null,
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'pending',   -- pending | delivered | failed
  attempts     int not null default 0,
  last_status  int,
  last_error   text,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists webhook_deliveries_retry_idx
  on webhook_deliveries (status, created_at) where status = 'pending';
create index if not exists webhook_deliveries_org_idx
  on webhook_deliveries (org_id, created_at desc);

-- ------------------------------------------------------------
-- Scheduled reports.
-- "Custom dashboards & auto-reports" was a Premium bullet with no scheduler.
-- ------------------------------------------------------------
create table if not exists scheduled_reports (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  mode       text not null default 'brief',   -- any Cortex AI mode: brief, report, actions, risk...
  cadence    text not null default 'weekly',  -- daily | weekly | monthly
  send_to    text,                            -- defaults to the workspace owner
  is_active  boolean not null default true,
  last_sent  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_reports_org_idx on scheduled_reports (org_id);

-- All three are written server-side with the service role. Members may READ
-- their own workspace's rows; secrets are never selected by the client.
do $$
declare t text;
begin
  foreach t in array array['webhook_endpoints','webhook_deliveries','scheduled_reports'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "tenant read %1$s" on %1$I;', t);
    execute format($f$create policy "tenant read %1$s" on %1$I for select
      using (org_id in (select user_org_ids()));$f$, t);
  end loop;
end $$;
