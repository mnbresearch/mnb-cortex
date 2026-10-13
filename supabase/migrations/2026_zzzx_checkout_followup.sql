/*
  ABANDONED-CHECKOUT FOLLOW-UP — the send ledger and the operator switch.

  Additive and safe to re-run. Until this is applied, lib/checkout-followup.ts
  reads the mode as "off" and does nothing.

  checkout_followups: one row per Cashfree order we emailed about (or tried
  to). The primary key on order_id IS the dedupe: a second cron run, or two
  overlapping ones, cannot both claim the same order. `status`:
    sending  claimed, provider call in flight
    sent     provider accepted it
    failed   provider refused; retried on a later run, at most 3 attempts
    unknown  timed out after the provider may have accepted — never retried,
             because a second copy is worse than none
  `sent_to` holds a MASKED address (a***@domain) — enough for an operator to
  recognise, not a second copy of the customer's email. The full delivery
  record is in email_sends, keyed by correlation_id.

  Service role only: RLS on, no policy.
*/
create table if not exists checkout_followups (
  order_id        text primary key,
  org_id          uuid references organizations(id) on delete cascade,
  kind            text,
  ref             text,
  status          text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'unknown')),
  attempts        integer not null default 0,
  sent_to         text,
  correlation_id  text,
  reason          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists checkout_followups_org_sent on checkout_followups (org_id, updated_at desc) where status = 'sent';
alter table checkout_followups enable row level security;
revoke all on checkout_followups from anon, authenticated;
grant select, insert, update on checkout_followups to service_role;

/*
  The switch. DEFAULT dry_run: nothing is sent until an operator turns it to
  live in the console, having looked at the preview and sent themselves a test.
  The env var CHECKOUT_FOLLOWUP_MODE=off overrides this to off.
*/
alter table platform_switches add column if not exists checkout_followup_mode text not null default 'dry_run';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'platform_switches_followup_mode_check') then
    alter table platform_switches add constraint platform_switches_followup_mode_check
      check (checkout_followup_mode in ('off', 'dry_run', 'live'));
  end if;
end $$;

notify pgrst, 'reload schema';

/* ---------- verify ---------- expect every row true */
select 'checkout_followups table' as item, to_regclass('public.checkout_followups') is not null as ok
union all
select 'RLS on', (select relrowsecurity from pg_class where oid = 'public.checkout_followups'::regclass)
union all
select 'browser cannot read it', not has_table_privilege('authenticated', 'public.checkout_followups', 'SELECT')
union all
select 'mode column, defaults to dry_run', exists (select 1 from information_schema.columns where table_name = 'platform_switches' and column_name = 'checkout_followup_mode' and column_default like '%dry_run%');
