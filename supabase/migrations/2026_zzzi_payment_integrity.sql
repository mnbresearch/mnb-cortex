/*
  PAYMENT INTEGRITY: the columns and tables the money path needed and did not have.

  Everything here exists because of a specific defect that could not be fixed in
  TypeScript alone. Each is listed with the defect it closes.

  ---------------------------------------------------------------------------
  1. cortex_payments.granted_at — "paid" did not mean "granted"
  ---------------------------------------------------------------------------
  settle.ts writes status:'paid' to CLAIM the order, before granting anything.
  So a process that died between the two left a row that says paid beside a
  workspace with no plan. admin-metrics then counted it as revenue, and the
  failed-payments list explicitly excluded status='paid', so the one case where
  a customer paid and received nothing was the one case no screen could show.

  granted_at is written only after the entitlement is confirmed present. It is
  therefore the honest answer to "did this customer get what they paid for",
  and `status='paid' and granted_at is null` is the reconciliation queue.

  ---------------------------------------------------------------------------
  2. cortex_payments.cycle and period_to — a refund guessed the cycle
  ---------------------------------------------------------------------------
  refund.ts read `organizations.subscription_cycle` to decide how many days to
  remove: the workspace's CURRENT cycle, not the cycle of the payment being
  refunded. Refunding a ₹799 monthly payment on a workspace whose column says
  annual removed 365 days — eleven months the customer had paid for. The
  reverse case left eleven refunded months in place.

  The cycle a payment bought belongs to that payment, so it is stored on it.
  period_to records the end date that payment produced, which is also what
  lets a renewal retry recognise that the extension it is about to apply has
  already been applied (see the webhook handler).

  ---------------------------------------------------------------------------
  3. cortex_payments.refunded_amount and reversed_at — partial refunds
  ---------------------------------------------------------------------------
  A refund event carries an AMOUNT and the old code never read it. Any refund,
  including a ₹1 goodwill adjustment or Cashfree's own ₹1 mandate-authorisation
  reversal, revoked the entire entitlement: 10,000 credits, or a whole annual
  period. refunded_amount accumulates what has actually been sent back, so each
  event reverses its own share and repeated partials cannot over-reverse.

  reversed_at now records only that a payment has been reversed IN FULL, for
  reporting. It is deliberately NOT the idempotency claim: a single flag cannot
  distinguish a repeat of one refund event from a second, genuinely different
  partial refund, and trying to make it do both meant a successful partial
  blocked the later balance refund entirely. That job belongs to
  payment_refunds below, one row per event.

  ---------------------------------------------------------------------------
  4. payment_intents — nothing to reconcile against
  ---------------------------------------------------------------------------
  The order route created an order at Cashfree and recorded NOTHING locally, so
  our only knowledge of a payment arrived with the webhook. If the webhook never
  arrived — a deploy mid-delivery, a signature mismatch, an outage past
  Cashfree's retry window — the payment existed only at Cashfree, and no query
  we could write would ever find it. That is the definition of an unreconcilable
  system: you cannot diff two sets when you only have one of them.

  Every checkout now leaves an intent. The reconciliation job walks the ones
  that were never settled and asks Cashfree directly.

  It is deliberately a SEPARATE table rather than a 'created' status on
  cortex_payments, because settle.ts refuses to activate an order whose
  existing row is not 'paid' — writing intents into that table would have made
  every single payment fail. Adjacent, not entangled.

  ---------------------------------------------------------------------------
  5. operator_alerts — the operator had nowhere to be told
  ---------------------------------------------------------------------------
  refund.ts raised its alert into `alerts` with the CUSTOMER's org_id. Its own
  comment said "the operator finds out"; the code notified the person who had
  just charged back. There was no operator-facing queue at all, so every
  money-side incident either went to the customer or to console.error.

  ---------------------------------------------------------------------------
  6. The unique index on credit_ledger — one payment, two packs
  ---------------------------------------------------------------------------
  The credit grant is idempotent only because settle.ts reads the ledger first
  and skips if a row with that reason exists. The verify route (the customer
  landing back on the return page) and the webhook run CONCURRENTLY by design —
  that is the whole point of having both. Both could read "no prior grant" and
  both then call grant_credits, and the customer received two packs for one
  payment. There was no lock and no constraint: the check was a read, and a read
  cannot exclude a writer.

  Uniqueness on (org_id, reason) for money reasons makes the database refuse the
  second grant, whatever the application does. The loser gets 23505 and reads
  the balance back, which is already how settle.ts handles a lost response.

  Created inside an exception block: if any workspace already holds a duplicate
  grant from this race, the index cannot be built, and that must not take the
  whole migration down. It reports the duplicates instead so they can be
  resolved by hand, and can be re-run afterwards.

  Safe to re-run: every statement is IF NOT EXISTS or idempotent.
*/

-- 1-3 -----------------------------------------------------------------------
alter table cortex_payments add column if not exists granted_at      timestamptz;
alter table cortex_payments add column if not exists cycle           text;
alter table cortex_payments add column if not exists period_to       timestamptz;
alter table cortex_payments add column if not exists refunded_amount numeric default 0;
alter table cortex_payments add column if not exists reversed_at     timestamptz;
/* Rotates the reconciliation queue. Without it the job sorts by created_at and
   the oldest unrepairable row sits at the head for ever, so once forty of those
   exist no genuinely lost payment is ever examined again. */
alter table cortex_payments add column if not exists reconcile_checked_at timestamptz;
alter table cortex_payments add column if not exists reconcile_note text;

/*
  BACKFILL — AND WHY IT IS EVIDENCE-BASED RATHER THAN A BLANKET UPDATE.

  Every row that already exists has granted_at = null, and null means "owed
  something" to both the operator console and the reconciliation job. Deployed
  without a backfill, the first cron run would treat the entire payment history
  as unfulfilled and call settleOrder on all of it — which, for a workspace that
  has since changed plan, would reset `plan` to whatever the historical order
  bought. A migration that hands the repair mechanism a false work list is worse
  than no mechanism.

  A blanket `set granted_at = created_at` would be the other error: it asserts
  delivery for rows where delivery is exactly what we do not know, and it would
  bury any genuine historical loss for good.

  So each row is asked for evidence, in its own terms:

    credits — a credit_ledger row whose reason carries this order id. That is
              the same evidence settle.ts itself consults, and it is conclusive.

    plan    — the workspace is still on the plan the order bought. Not
              conclusive (they may have moved on and back), but it is positive
              evidence of a grant having happened, and the failure direction is
              a row that stays in the queue for a human to look at.

  Anything with no evidence keeps granted_at = null and appears in the queue.
  That is the honest state: we do not know, and somebody should check.
*/
update cortex_payments p
   set granted_at = p.created_at
 where p.granted_at is null
   and p.status = 'paid'
   and p.kind = 'credits'
   and exists (
     select 1 from credit_ledger l
      where l.org_id = p.org_id
        and l.reason like 'topup:%:' || replace(p.order_id, '_', '\_')
   );

update cortex_payments p
   set granted_at = p.created_at
 where p.granted_at is null
   and p.status = 'paid'
   and (p.kind = 'plan' or p.kind like 'subscription:%')
   and exists (
     select 1 from organizations o
      where o.id = p.org_id
        and lower(coalesce(o.plan, '')) = lower(coalesce(p.ref, ''))
   );

/*
  And the same for the renewal rows, whose ref is the MANDATE id rather than a
  plan id — the plan is in `kind` as `subscription:<plan>`.
*/
update cortex_payments p
   set granted_at = p.created_at
 where p.granted_at is null
   and p.status = 'paid'
   and p.kind like 'subscription:%'
   and exists (
     select 1 from organizations o
      where o.id = p.org_id
        and lower(coalesce(o.plan, '')) = lower(split_part(p.kind, ':', 2))
   );

comment on column cortex_payments.granted_at is
  'When the entitlement was CONFIRMED present. Null beside status=paid means the customer paid and has not received it — that is the reconciliation queue, not a cosmetic field.';
comment on column cortex_payments.cycle is
  'The cycle this payment bought (monthly|annual). A refund must reverse the period THIS payment purchased, not whatever cycle the workspace is on today.';
comment on column cortex_payments.refunded_amount is
  'Cumulative amount refunded against this payment. A partial refund reverses its own share; repeated partials cannot exceed the whole.';

/* The queue the reconciliation job and the operator console both read. */
create index if not exists idx_cortex_payments_ungranted
  on cortex_payments(created_at desc)
  where status = 'paid' and granted_at is null;

/*
  ---------------------------------------------------------------------------
  3b. payment_refunds — one row per refund EVENT
  ---------------------------------------------------------------------------
  A single `reversed_at` column cannot express what actually happens to a
  payment, and trying to make it do so produced two defects at once:

    - a successful PARTIAL refund set reversed_at, and the later full refund
      then lost the conditional claim and returned "already" — reversing
      nothing, warning nobody. The customer was refunded in full and kept the
      product.

    - a partial plan refund had no idempotency guard at all. The claim was only
      taken for full refunds, and a plan reversal writes no ledger row, so two
      deliveries of one REFUND_SUCCESS each subtracted days again.

  Per-event rows fix both, and give the arithmetic something true to read:
  refunded-so-far, credits-already-reclaimed and days-already-removed are SUMS
  over this table rather than a column two concurrent handlers overwrite.

  The unique (order_id, event_id) is the idempotency guard, for every kind of
  payment and every size of refund. Insert first, act second.
*/
create table if not exists payment_refunds (
  id             uuid primary key default gen_random_uuid(),
  order_id       text not null,
  /* The provider's refund/dispute id when it sends one; otherwise a digest of
     the event body, which is stable across a retry of the same delivery and
     different for two genuinely distinct refunds of the same amount. */
  event_id       text not null,
  event_type     text,
  amount         numeric,
  share          numeric,
  credits_taken  bigint default 0,
  days_removed   int default 0,
  outcome        text,
  at             timestamptz not null default now(),
  unique (order_id, event_id)
);
create index if not exists idx_payment_refunds_order on payment_refunds(order_id, at desc);
alter table payment_refunds enable row level security;
comment on table payment_refunds is
  'One row per refund or dispute EVENT. The unique (order_id, event_id) is what makes a reversal idempotent for plans as well as credits, and the sums over this table are what stop repeated partials over-reversing. Service role only: RLS on with no policy.';

/* Renewal retries look up "has this exact extension already been applied". */
create index if not exists idx_cortex_payments_ref_period
  on cortex_payments(ref, period_to desc);

-- 4 -------------------------------------------------------------------------
create table if not exists payment_intents (
  order_id   text primary key,
  org_id     uuid references organizations(id) on delete set null,
  kind       text,
  ref        text,
  cycle      text,
  amount     numeric,
  created_at timestamptz not null default now(),
  /* Set when this intent reached a terminal answer: settled, or old enough and
     confirmed unpaid. Null and old is what the job works on. */
  settled_at timestamptz,
  outcome    text
);
create index if not exists idx_payment_intents_open
  on payment_intents(created_at)
  where settled_at is null;
/* The FK to organizations had no index, so every cascade and every
   per-workspace lookup was a scan. */
create index if not exists idx_payment_intents_org on payment_intents(org_id, created_at desc);
/* Same rotation as cortex_payments: an intent Cashfree cannot answer for must
   not hold the head of the queue for ever. */
alter table payment_intents add column if not exists reconcile_checked_at timestamptz;

alter table payment_intents enable row level security;
comment on table payment_intents is
  'One row per checkout STARTED. Exists so a payment taken at Cashfree whose webhook never arrived can still be found. Service role only: RLS on with no policy.';

-- 5 -------------------------------------------------------------------------
create table if not exists operator_alerts (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  severity    text not null default 'red',
  kind        text not null,
  title       text not null,
  body        text,
  /* Nullable on purpose: a refund for an order we have no record of has no
     workspace to attribute, and that case is precisely the one that must not
     be dropped for want of a foreign key. */
  org_id      uuid references organizations(id) on delete set null,
  order_id    text,
  resolved_at timestamptz,
  resolved_by text
);
create index if not exists idx_operator_alerts_open on operator_alerts(at desc) where resolved_at is null;

alter table operator_alerts enable row level security;
comment on table operator_alerts is
  'Platform-operator incident queue, NOT a customer alert feed. Money-side failures land here so they are visible to whoever is on duty. Service role only: RLS on with no policy.';

-- 6 -------------------------------------------------------------------------
do $$
declare dupes text;
begin
  create unique index if not exists uq_credit_ledger_money_reason
    on credit_ledger(org_id, reason)
    where reason like 'topup:%' or reason like 'refund_reversal:%';
  raise notice 'uq_credit_ledger_money_reason is in place — one payment can no longer grant twice.';
exception when others then
  select string_agg(format('%s / %s (%s rows)', org_id, reason, n), E'\n  ') into dupes
    from (
      select org_id, reason, count(*) as n from credit_ledger
       where reason like 'topup:%' or reason like 'refund_reversal:%'
       group by org_id, reason having count(*) > 1
    ) d;
  raise warning 'Could not create uq_credit_ledger_money_reason: %', sqlerrm;
  raise warning 'Duplicate money grants already in the ledger:%', coalesce(E'\n  ' || dupes, ' none found — the failure is something else.');
  raise warning 'Resolve those rows, then re-run this migration. Nothing else in it is affected.';
end $$;

/*
  PostgREST caches the schema. Until it reloads, every write naming granted_at,
  period_to or refunded_amount fails with PGRST204 — in the money path, on the
  same deploy where all of this is new. Supabase listens for this notification.
*/
notify pgrst, 'reload schema';

/*
  Supabase's service_role normally inherits access, but nineteen other
  migrations in this repo grant explicitly rather than rely on that, and a
  missing grant here would be invisible until a refund arrived. Guarded so the
  file still applies on a plain PostgreSQL (the restore rehearsal), where these
  roles do not exist.
*/
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table payment_intents, operator_alerts, payment_refunds to service_role;
  end if;
end $$;

/*
  VERIFY. Every row must read OK.
*/
select check_name, case when ok then 'OK' else 'FAIL' end as result, detail from (
  select '1. granted_at exists' as check_name,
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='cortex_payments' and column_name='granted_at') as ok,
         'settle.ts writes it only after confirming the entitlement' as detail
  union all
  select '2. payment_intents exists',
         to_regclass('public.payment_intents') is not null,
         'the reconciliation job has something to diff against'
  union all
  select '3. operator_alerts exists',
         to_regclass('public.operator_alerts') is not null,
         'money incidents have somewhere to go that is not the customer''s feed'
  union all
  select '4. payment_refunds enforces one reversal per event',
         exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
                  where t.relname = 'payment_refunds' and c.contype = 'u'),
         'without it a duplicate refund delivery reverses twice for plans, which write no ledger row'
  union all
  select '5. the new tables are service-role only',
         (select bool_and(c.relrowsecurity) from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public'
             and c.relname in ('payment_intents','operator_alerts','payment_refunds')),
         'RLS on, no policy — the anon key in our browser bundle sees nothing'
  union all
  select '6. one payment cannot grant twice',
         exists (select 1 from pg_indexes where schemaname='public' and indexname='uq_credit_ledger_money_reason'),
         'if this FAILs, read the warnings above: the ledger already holds a duplicate'
  union all
  select '7. the backfill left no row asserting a grant it cannot evidence',
         not exists (
           select 1 from cortex_payments p
            where p.granted_at is not null and p.kind = 'credits'
              and not exists (select 1 from credit_ledger l
                               where l.org_id = p.org_id
                                 and l.reason like 'topup:%:' || replace(p.order_id, '_', '\_'))
              and p.granted_at = p.created_at
         ),
         'a credits row marked granted must have the ledger entry that proves it'
) t order by check_name;
