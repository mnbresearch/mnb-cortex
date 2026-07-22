-- MNB Cortex — email templates, campaigns & tracking (run once in Supabase SQL editor)

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text,
  subject text not null,
  body text not null,
  sent_count int default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references email_campaigns(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  name text,
  email text not null,
  status text default 'sent',            -- sent | failed
  resend_id text,
  open_count int default 0,
  opened_at timestamptz,
  click_count int default 0,
  clicked_at timestamptz,
  outcome text,                          -- interested | not_interested | replied | bounced (admin-set)
  created_at timestamptz default now()
);

create index if not exists idx_campaign_recipients_campaign on campaign_recipients(campaign_id);

-- Row-level security: workspace-scoped. Tracking pixels update rows via the
-- service role (bypasses RLS), so these policies can stay strict.
alter table email_templates enable row level security;
alter table email_campaigns enable row level security;
alter table campaign_recipients enable row level security;

drop policy if exists "tenant email_templates" on email_templates;
create policy "tenant email_templates" on email_templates for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from memberships where user_id = auth.uid()));

drop policy if exists "tenant email_campaigns" on email_campaigns;
create policy "tenant email_campaigns" on email_campaigns for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from memberships where user_id = auth.uid()));

drop policy if exists "tenant campaign_recipients" on campaign_recipients;
create policy "tenant campaign_recipients" on campaign_recipients for all
  using (org_id in (select org_id from memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from memberships where user_id = auth.uid()));
