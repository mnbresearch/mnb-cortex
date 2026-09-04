/*
  WhatsApp collections: the workspace's own approved template.

  WHY THIS COLUMN HAS TO EXIST.

  Meta will not deliver a message to someone who has not messaged the business
  first unless it uses a template Meta approved in advance. A debtor being
  chased has never messaged the business — that is what makes them a debtor and
  not a conversation. So free-form WhatsApp dunning is not a thing that can
  work, and the send path was using it: every WhatsApp reminder failed with
  error 131047, and because the circuit breaker trips on "failures with no
  successes", the permanently-impossible channel switched the whole policy off
  and took EMAIL down with it.

  We cannot create the template on the customer's behalf. It is submitted from
  their own Meta Business Manager against their own verified business and
  reviewed by Meta. All we can do is let them tell us its name, explain exactly
  how to get one, and refuse to pretend until they have.

  `whatsapp_lang` matters more than it looks: Meta treats a template name and a
  language as one identity, so "payment_reminder" in en and en_US are different
  templates and sending to the wrong one is a hard error. Default 'en'.
*/

alter table collection_policies
  add column if not exists whatsapp_template text,
  add column if not exists whatsapp_lang     text not null default 'en';

/*
  Length only, deliberately. The exact character rule (lowercase, digits and
  underscores) is enforced in lib/collections/whatsapp.ts, where a violation can
  be returned to the owner as a sentence they can act on rather than as a
  constraint-violation stack trace on save.
*/
alter table collection_policies
  drop constraint if exists collection_policies_whatsapp_template_len;
alter table collection_policies
  add constraint collection_policies_whatsapp_template_len
  check (whatsapp_template is null or char_length(whatsapp_template) <= 512);

/*
  'skipped' already exists on collection_messages. This comment is here to
  record WHY the send path now uses it for setup refusals rather than 'failed':

  "You have not connected WhatsApp" is not a delivery failure. It is a standing
  fact that stays true on every run until the owner acts, so recording it as a
  failure would guarantee cortex_collections_trip_check disables the policy —
  including the email channel, which was working. The breaker counts 'failed'
  only, so a setup refusal must never be written as one.
*/
comment on column collection_messages.status is
  'draft | approved | sent | failed | skipped | cancelled. '
  'failed = the provider was reached and refused, and counts toward the circuit breaker. '
  'skipped = we declined to send (not configured, no template), and must NOT count.';

/*
  ---------------------------------------------------------------------------
  Fair rotation for the nightly collections sweep.

  The cron read `collection_policies where enabled = true limit 200`. PostgREST
  applies no ordering unless asked, so which 200 came back was whatever the
  planner felt like — and once more than 200 workspaces switch collections on,
  some are served every night and others never are, with nothing anywhere
  saying so. A customer paying for automated chasing would simply find it had
  silently stopped, and no error would exist to explain it.

  Recording when a workspace was last swept lets the cron take the 200
  LEAST-RECENTLY-SWEPT each run. Every workspace is then reached within
  ceil(n/200) days, the order is deterministic, and the column is visible when
  someone asks why a particular workspace has not run.

  NULL sorts first under `nulls first`, so a workspace that has never been
  swept — the one most likely to be waiting — goes to the front of the queue.
*/
alter table collection_policies
  add column if not exists last_swept_at timestamptz;

create index if not exists collection_policies_sweep_order
  on collection_policies (last_swept_at nulls first)
  where enabled = true;
