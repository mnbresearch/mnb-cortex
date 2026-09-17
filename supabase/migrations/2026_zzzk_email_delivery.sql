/*
  EMAIL: A DELIVERY RECORD, AND A PROBE HISTORY.

  WHAT WAS WRONG, IN TWO PARTS.

  1. NOTHING RECORDED WHAT HAPPENED TO AN EMAIL.

  sendEmail() returned `{ sent: boolean }` and that was the entire memory of the
  event. Callers then wrote their own interpretation into their own tables —
  lifecycle_sends, weekly_plan_sends, collection_messages — so the same
  question ("did this customer get their reminder?") had four different answers
  in four places and none of them knew what the provider said. There was no
  provider id, no error text, no duration, no attempt count, and no way to ask
  "which messages did not go out today".

  Worse, there was no timeout on the request at all. A hung connection to Resend
  produced `{ sent: false }` — the same value as a refusal — when Resend may
  well have accepted the message. That is the one state where a retry sends a
  duplicate, and it was indistinguishable from the state where a retry is
  obligatory.

  email_sends is one row per message, with the states named honestly:

     queued    — we are about to try. NOT "sent". The application's own queue
                 is not evidence of anything, and calling it sent is the lie
                 this table exists to stop.
     accepted  — the provider took it and gave us an id.
     delivered — the provider's webhook says it reached the mailbox.
     bounced   — it did not, and will not.
     failed    — the provider refused it.
     unknown   — we never heard back. Deliberately its own state: it is not
                 failure and must not be presented as one.

  2. THE HEALTH PROBE HAD NO MEMORY.

  checkEmail() made a single 6-second request and turned a timeout into a
  critical status, with no history and no duration recorded. So a cold TLS
  handshake looked identical to an outage, nobody could tell a blip from a
  pattern afterwards, and the status page contradicted the email console —
  which was right, because it was looking at real deliveries.

  email_probes keeps the samples. Two consecutive failures is a fault; one is a
  blip; a sample older than the staleness window is not evidence about now.
  lib/email-state.ts holds those rules and is tested.

  Safe to re-run: every statement is IF NOT EXISTS.
*/

create table if not exists email_sends (
  id            uuid primary key default gen_random_uuid(),
  /* Ours, generated before the request, and sent to the provider as the
     Idempotency-Key. It is what makes a retry safe and what ties a log line,
     a row and a provider event together. */
  correlation_id text not null unique,
  org_id        uuid references organizations(id) on delete set null,
  /* Which product path sent this: invite, receipt, collections, alert, weekly
     plan, lifecycle, operator. Lets "what is failing?" be answered by feature
     rather than by guessing from the subject line. */
  kind          text,
  to_email      text,
  subject       text,
  status        text not null default 'queued'
                check (status in ('queued','accepted','delivered','bounced','complained','failed','unknown','suppressed')),
  provider      text default 'resend',
  provider_id   text,
  provider_error text,
  http_status   int,
  attempts      int not null default 0,
  duration_ms   int,
  queued_at     timestamptz not null default now(),
  accepted_at   timestamptz,
  delivered_at  timestamptz,
  failed_at     timestamptz,
  updated_at    timestamptz not null default now(),
  meta          jsonb default '{}'::jsonb
);

/* The operator's two questions: "what is failing now" and "did THIS message
   go out". Both need an index or they scan the table on every status page. */
create index if not exists idx_email_sends_recent on email_sends(queued_at desc);
create index if not exists idx_email_sends_bad on email_sends(queued_at desc)
  where status in ('failed','unknown','bounced','complained');
create index if not exists idx_email_sends_provider on email_sends(provider_id) where provider_id is not null;
create index if not exists idx_email_sends_org on email_sends(org_id, queued_at desc);

alter table email_sends enable row level security;
comment on table email_sends is
  'One row per outbound email, with the provider''s own answer. `queued` is never reported to a user as sent — entering our queue is not evidence of delivery. Service role only: RLS on with no policy.';
comment on column email_sends.status is
  'queued|accepted|delivered|bounced|complained|failed|unknown|suppressed. `unknown` means we never heard back: not a failure, and the only state where retrying without an idempotency key could duplicate the message.';

create table if not exists email_probes (
  id             uuid primary key default gen_random_uuid(),
  at             timestamptz not null default now(),
  ok             boolean not null,
  ms             int,
  http_status    int,
  error          text,
  correlation_id text
);
create index if not exists idx_email_probes_at on email_probes(at desc);
alter table email_probes enable row level security;
comment on table email_probes is
  'Health-probe samples for the email provider. Exists so one slow response can be told from an outage, and so a stale failure is never reported as the current state.';

/*
  A CLAIM IS NOT A SEND.

  collection_messages.status allowed draft|approved|sent|failed|skipped|cancelled,
  and the send loop claimed a message by setting it to 'sent' BEFORE calling the
  provider — the claim is necessary (two overlapping cron runs must not both
  chase the same debtor) but the word was wrong. A process that died mid-send
  left a message marked sent that never went, which is precisely the state the
  customer's "Prove" page counts as a reminder delivered.

  'sending' is the claim. 'sent' now means the provider accepted it.
*/
do $$
begin
  alter table collection_messages drop constraint if exists collection_messages_status_check;
  alter table collection_messages add constraint collection_messages_status_check
    check (status in ('draft', 'approved', 'sending', 'sent', 'failed', 'skipped', 'cancelled'));
exception when undefined_table then
  raise notice 'collection_messages does not exist yet — 2026_collections.sql has not run.';
end $$;

notify pgrst, 'reload schema';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table email_sends, email_probes to service_role;
  end if;
end $$;

/*
  VERIFY. Every row must read OK.
*/
select check_name, case when ok then 'OK' else 'FAIL' end as result, detail from (
  select '1. email_sends exists' as check_name,
         to_regclass('public.email_sends') is not null as ok,
         'one row per message, with the provider''s answer on it' as detail
  union all
  select '2. queued is the default, not sent',
         (select column_default like '%queued%' from information_schema.columns
           where table_schema='public' and table_name='email_sends' and column_name='status'),
         'a row created before the request must not claim the message was sent'
  union all
  select '3. unknown is a permitted state',
         (select pg_get_constraintdef(oid) like '%unknown%' from pg_constraint
           where conname = 'email_sends_status_check'),
         'a timeout is not a failure; collapsing the two is what made a retry unsafe'
  union all
  select '4. email_probes exists',
         to_regclass('public.email_probes') is not null,
         'so one slow response can be told from an outage'
  union all
  select '5. both are service-role only',
         (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname='public' and c.relname in ('email_sends','email_probes')),
         'recipient addresses across every tenant live here'
  union all
  select '6. a collections message can be claimed without claiming it was sent',
         coalesce((select pg_get_constraintdef(oid) like '%sending%' from pg_constraint
                    where conname = 'collection_messages_status_check'), false),
         'the claim used to write sent before the provider had seen it'
) t order by check_name;
