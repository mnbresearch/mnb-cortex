-- ============================================================
-- MNB CORTEX — renewal notice log
-- Safe to run more than once (idempotent).
--
-- Paid plans now expire at the end of the period they were bought for, but the
-- only warning was an in-app banner from 7 days out. A customer who doesn't log
-- in that week simply finds the product switched off one morning.
--
-- This table makes each reminder send EXACTLY once per period. Without it the
-- daily cron would re-send the same T-7 email every day for a week.
-- ============================================================

create table if not exists renewal_notices (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null,          -- 't7' | 't1' | 'lapsed'
  period_end  timestamptz not null,   -- the period this notice was about
  sent_to     text,
  sent_at     timestamptz not null default now()
);

-- One notice of each kind per workspace per period. The cron relies on the
-- conflict here rather than a read-then-write, so two overlapping runs can't
-- double-send.
create unique index if not exists renewal_notices_unique
  on renewal_notices (org_id, kind, period_end);

create index if not exists renewal_notices_org_idx
  on renewal_notices (org_id, sent_at desc);

-- Server-only: written with the service role, never read by the client.
alter table renewal_notices enable row level security;
