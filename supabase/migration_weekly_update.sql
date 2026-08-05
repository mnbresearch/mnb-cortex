-- MNB Cortex — weekly product-update email: opt-outs + send log.
-- Run once in the Supabase SQL editor (idempotent). Service-role only; no public policy.

-- 1. Suppression list. An email here is never sent a weekly update again.
create table if not exists email_optouts (
  email text primary key,
  reason text,
  created_at timestamptz default now()
);
alter table email_optouts enable row level security;
-- No public policy: only the server (service role) reads/writes this.

-- 2. Audit log of weekly sends. Also drives the "already emailed this version?" check.
create table if not exists weekly_email_sends (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  recipients int default 0,
  sent int default 0,
  failed int default 0,
  test boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_weekly_sends_created on weekly_email_sends(created_at desc);
alter table weekly_email_sends enable row level security;
