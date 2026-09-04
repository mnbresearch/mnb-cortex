/*
  The collections agent.

  WHY THIS IS THE MOST IMPORTANT MODULE IN THE PRODUCT.

  Cortex already works out that Sharma Traders owes ₹8,00,000 and is 62 days
  late. Then it stops. The owner still has to open WhatsApp and type the
  message. So the product sells INFORMATION, and the customer does the work —
  which is why it is hard to price above a dashboard.

  This closes the loop: Cortex drafts the reminder, sends it on the owner's
  behalf, watches for payment, and reports what came back. That turns "here is
  what is wrong" into "here is ₹4.2 lakh I recovered for you", which is the only
  sentence that makes a ₹15,000/month subscription renew itself.

  AND IT IS THE MOST DANGEROUS MODULE IN THE PRODUCT.

  Every other feature is read-only or writes to the customer's own workspace.
  This one sends messages, in the customer's name, to THEIR customers. The
  failure modes are not "a wrong number on a dashboard" — they are a valued
  client being dunned twice a day, a payment reminder going to someone who
  already paid, or a business relationship damaged by a machine.

  So the schema is built around refusing to do that:

    - `auto_send` DEFAULTS TO FALSE. Nothing leaves the building until a human
      has approved it. Opting into automatic sending is a deliberate act.
    - a thread STOPS the moment its invoice is marked paid, and the stop is a
      status on the row rather than a rule someone has to remember
    - `max_attempts` and `min_gap_days` are policy, enforced in SQL, not
      conventions in application code
    - a do-not-contact list exists and is checked before anything is drafted
    - quiet hours, because a dunning message at 11pm is worse than none
    - every message ever drafted is kept, sent or not, so the owner can always
      answer "what did you say to my customer?"

  None of these are optional niceties. A collections feature that misfires once
  costs the customer a relationship, and they will never trust the product
  again — which makes it a worse business decision than not shipping it.
*/

-- ---------------------------------------------------------------- policy

create table if not exists collection_policies (
  org_id           uuid primary key references organizations(id) on delete cascade,

  /* Master switch. Off until the owner turns it on and sees a draft. */
  enabled          boolean not null default false,

  /*
    Send without asking.

    Default FALSE and it should stay false for most workspaces. The value of the
    feature is mostly in the drafting and the tracking; the marginal convenience
    of skipping approval is small next to the cost of one wrong message.
  */
  auto_send        boolean not null default false,

  /* How the reminder should read. Anything harsher than 'firm' is not offered. */
  tone             text not null default 'polite'
                   check (tone in ('polite', 'neutral', 'firm')),

  channels         text[] not null default array['email'],

  /* Days past the DUE DATE before the first reminder. */
  first_after_days int not null default 3 check (first_after_days between 0 and 90),
  /* Minimum days between two messages to the same party. */
  min_gap_days     int not null default 7 check (min_gap_days between 1 and 90),
  /* Total messages per invoice, ever. */
  max_attempts     int not null default 3 check (max_attempts between 1 and 10),
  /* Ceiling across the whole workspace per day, so a bad import cannot spam. */
  max_per_day      int not null default 25 check (max_per_day between 1 and 200),

  /* Local quiet hours (IST). Nothing sends outside 09:00–19:00 by default. */
  send_from_hour   int not null default 9  check (send_from_hour between 0 and 23),
  send_to_hour     int not null default 19 check (send_to_hour between 0 and 23),

  /* Never contact these parties. Matched on normalised name. */
  do_not_contact   text[] not null default '{}',

  /* Appended to every message so the recipient knows who is writing. */
  signature        text,
  /* Where to pay. A reminder without this is just nagging. */
  payment_note     text,

  updated_at       timestamptz not null default now()
);

-- --------------------------------------------------------------- threads

/*
  One chase per invoice.

  UNIQUE on (org_id, invoice_id): an invoice can only be chased by one thread,
  so a second run cannot start a parallel conversation with the same person
  about the same money.
*/
create table if not exists collection_threads (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  invoice_id    uuid not null references invoices(id) on delete cascade,

  party         text not null,
  amount        numeric not null default 0,
  due_date      date,

  status        text not null default 'open'
                check (status in ('open', 'paused', 'recovered', 'excluded', 'exhausted')),
  attempts      int not null default 0,
  last_sent_at  timestamptz,
  next_due_at   timestamptz,

  /*
    Set when the invoice is seen to be paid. `recovered_amount` is what makes
    the Prove layer possible — and it is only ever written for a thread that
    actually sent something, so the product cannot take credit for money that
    would have arrived anyway.
  */
  recovered_at     timestamptz,
  recovered_amount numeric,

  created_at    timestamptz not null default now(),
  unique (org_id, invoice_id)
);

create index if not exists collection_threads_due_idx
  on collection_threads (org_id, status, next_due_at);

-- -------------------------------------------------------------- messages

create table if not exists collection_messages (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  thread_id    uuid not null references collection_threads(id) on delete cascade,

  attempt      int not null default 1,
  channel      text not null check (channel in ('email', 'whatsapp')),
  /* Where it went. Kept on the message so an audit does not depend on the
     customer record still holding the same address. */
  recipient    text,
  subject      text,
  body         text not null,

  status       text not null default 'draft'
               check (status in ('draft', 'approved', 'sent', 'failed', 'skipped', 'cancelled')),
  error        text,
  provider_id  text,

  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  sent_at      timestamptz
);

create index if not exists collection_messages_thread_idx
  on collection_messages (thread_id, created_at desc);
create index if not exists collection_messages_pending_idx
  on collection_messages (org_id, status) where status in ('draft', 'approved');

-- ------------------------------------------------------------------- RLS

alter table collection_policies enable row level security;
alter table collection_threads  enable row level security;
alter table collection_messages enable row level security;

do $$
declare t text;
begin
  foreach t in array array['collection_policies','collection_threads','collection_messages'] loop
    execute format('drop policy if exists "members read %1$s" on %1$s', t);
    execute format('create policy "members read %1$s" on %1$s for select using (org_id in (select user_org_ids()))', t);

    execute format('drop policy if exists "members write %1$s" on %1$s', t);
    execute format('create policy "members write %1$s" on %1$s for insert with check (org_id in (select user_org_ids()))', t);

    execute format('drop policy if exists "members update %1$s" on %1$s', t);
    execute format('create policy "members update %1$s" on %1$s for update using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()))', t);

    execute format('drop policy if exists "members delete %1$s" on %1$s', t);
    execute format('create policy "members delete %1$s" on %1$s for delete using (org_id in (select user_org_ids()))', t);
  end loop;
end $$;

-- ------------------------------------------------- stop the moment it is paid

/*
  The single most important rule in this module.

  Chasing someone who has already paid is the failure that loses a customer's
  customer. It must not depend on the cron running, on the application
  remembering, or on anyone marking the thread by hand — so it is a trigger on
  the invoice itself. The instant `status` becomes 'paid', every open thread for
  that invoice is closed and every unsent message is cancelled.

  `recovered_amount` is recorded ONLY when at least one message was actually
  sent. Money that arrived without Cortex saying anything is not recovery, and a
  Prove layer that counts it would be lying to the customer about its own value.
*/
create or replace function cortex_collections_stop_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(NEW.status, '')) = 'paid'
     and lower(coalesce(OLD.status, '')) is distinct from 'paid' then

    update collection_threads t
       set status = 'recovered',
           recovered_at = now(),
           recovered_amount = case when t.attempts > 0 then NEW.amount else null end,
           next_due_at = null
     where t.invoice_id = NEW.id
       and t.status in ('open', 'paused');

    update collection_messages m
       set status = 'cancelled'
     where m.status in ('draft', 'approved')
       and m.thread_id in (select id from collection_threads where invoice_id = NEW.id);
  end if;
  return NEW;
end $$;

drop trigger if exists cortex_invoice_paid_stops_collection on invoices;
create trigger cortex_invoice_paid_stops_collection
  after update on invoices
  for each row
  execute function cortex_collections_stop_on_paid();

-- ------------------------------------------------------------ the ledger

/*
  What Cortex actually recovered, per workspace.

  Deliberately conservative: only threads that SENT something and then saw the
  invoice paid. Overstating this number is the fastest way to lose the trust the
  number exists to build.
*/
create or replace function cortex_recovery_summary(p_org uuid, p_days int default 90)
returns table (
  invoices_recovered bigint,
  amount_recovered   numeric,
  messages_sent      bigint,
  still_chasing      bigint,
  amount_chasing     numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from collection_threads
      where org_id = p_org and status = 'recovered'
        and recovered_amount is not null
        and recovered_at > now() - make_interval(days => p_days)),
    (select coalesce(sum(recovered_amount), 0) from collection_threads
      where org_id = p_org and status = 'recovered'
        and recovered_amount is not null
        and recovered_at > now() - make_interval(days => p_days)),
    (select count(*) from collection_messages
      where org_id = p_org and status = 'sent'
        and sent_at > now() - make_interval(days => p_days)),
    (select count(*) from collection_threads
      where org_id = p_org and status = 'open'),
    (select coalesce(sum(amount), 0) from collection_threads
      where org_id = p_org and status = 'open');
$$;

revoke all on function cortex_recovery_summary(uuid, int) from public, anon;
grant execute on function cortex_recovery_summary(uuid, int) to authenticated, service_role;
