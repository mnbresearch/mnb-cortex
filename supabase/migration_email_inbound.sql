-- MNB Cortex / NyayaAI — email tracking tokens, settings & inbound replies
-- Run once in the Supabase SQL editor (idempotent). Assumes migration_email_campaigns.sql already ran.

-- 1. Per-recipient tracking token + provider/status detail.
alter table campaign_recipients add column if not exists token text;
alter table campaign_recipients add column if not exists provider_id text;
alter table campaign_recipients add column if not exists error text;
alter table campaign_recipients add column if not exists last_opened_at timestamptz;
create unique index if not exists idx_campaign_recipients_token on campaign_recipients(token);

-- 2. Campaign template link + counters.
alter table email_campaigns add column if not exists template_id uuid;
alter table email_campaigns add column if not exists total int default 0;
alter table email_campaigns add column if not exists failed int default 0;

-- 3. Key/value app settings (webhook secret, inbound address). Service-role only.
create table if not exists app_settings (
  org_id uuid references organizations(id) on delete cascade,
  key text not null,
  value text,
  updated_at timestamptz default now(),
  primary key (org_id, key)
);
alter table app_settings enable row level security;
-- No public policy: only the service role (server) reads/writes secrets here.

-- 4. Inbound replies.
create table if not exists email_replies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  resend_email_id text unique,
  campaign_id uuid references email_campaigns(id) on delete set null,
  recipient_id uuid references campaign_recipients(id) on delete set null,
  from_email text,
  to_email text,
  subject text,
  text text,
  html text,
  verified boolean default false,
  is_read boolean default false,
  received_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists idx_email_replies_campaign on email_replies(campaign_id);
create index if not exists idx_email_replies_from on email_replies(from_email);

alter table email_replies enable row level security;
drop policy if exists "tenant email_replies" on email_replies;
create policy "tenant email_replies" on email_replies for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from memberships where user_id = auth.uid()));
