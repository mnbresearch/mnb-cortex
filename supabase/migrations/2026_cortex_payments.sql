/*
  Cortex gets its own payments table. The shared one cannot be made to work.

  WHY, IN THREE INCIDENTS.

  `payments` is shared with the school/tuition app in this Supabase project.
  That coupling has now produced three separate failures, each found separately:

    1. The admin dashboard reported that app's takings as MNB Cortex revenue,
       because both write status='paid' into the same table. That is the ₹79K
       of null-org_id rows (fixed in a9e7f55 by filtering on `kind`).

    2. `owner_id NOT NULL`, added by that app, rejected every Cortex insert.
       Found by paying ₹1 in production: money left, nothing granted.

    3. After dropping that constraint, the very next attempt hit
       `student_id NOT NULL`. Also theirs.

  Three is enough. Dropping their NOT NULLs one at a time is whack-a-mole
  against a schema we do not own and cannot see changes to, and every constraint
  removed weakens THEIR data integrity to fix OURS. The next column they add
  breaks Cortex payments again, silently, and the first symptom will be a
  customer who paid and got nothing.

  There is also a security dimension. That table carries

      payments_all: FOR ALL, USING (owner_id = auth.uid())

  which is permissive and therefore OR'd with anything we add. Any Cortex row
  that acquired an owner_id would become writable by that user through
  PostgREST — including `status`, the idempotency guard the grant path depends
  on. Separation removes that hazard rather than relying on a column staying
  NULL forever.

  WHAT THIS DOES.

  Creates `cortex_payments` with exactly the columns Cortex writes, the unique
  index that makes settlement idempotent, and RLS on with NO policy — this is
  service-role-only, like the original migration_payments.sql intended before
  another product's policy landed on the same table.

  Backfills anything that is unambiguously ours (org_id is not null), which is
  expected to be zero rows precisely because the NOT NULLs have been rejecting
  them all along. Written to be correct if that assumption is wrong.

  The old table is NOT dropped and NOT modified. It belongs to the other app.
*/

create table if not exists cortex_payments (
  order_id   text primary key,
  org_id     uuid,
  kind       text,
  ref        text,
  amount     numeric,
  status     text default 'paid',
  provider   text default 'cashfree',
  created_at timestamptz default now()
);

/*
  The idempotency guarantee. order_id is the primary key above, which already
  enforces it; this index name is kept for parity with the old table so the
  intent is greppable.
*/
create unique index if not exists uq_cortex_payments_order on cortex_payments(order_id);
create index if not exists idx_cortex_payments_org on cortex_payments(org_id, created_at desc);

/*
  Service role only. RLS on, no policy — PostgREST then serves nothing to the
  anon key that ships in our browser bundle, which is what "only the server
  reads and writes this" has to mean in practice.
*/
alter table cortex_payments enable row level security;

comment on table cortex_payments is
  'MNB Cortex payment ledger. Deliberately SEPARATE from public.payments, which '
  'is owned by another product in this project and whose NOT NULL columns '
  '(owner_id, student_id) rejected every Cortex insert. Service role only.';

/*
  Backfill anything that is ours. `org_id is not null` is the discriminator:
  Cortex always sets it, the other app never does.
*/
do $$
declare n int := 0;
begin
  if to_regclass('public.payments') is null then
    raise notice 'no legacy payments table — nothing to backfill.';
    return;
  end if;

  insert into cortex_payments (order_id, org_id, kind, ref, amount, status, provider, created_at)
  select p.order_id, p.org_id, p.kind, p.ref, p.amount, p.status,
         coalesce(p.provider, 'cashfree'), coalesce(p.created_at, now())
    from payments p
   where p.org_id is not null
     and p.order_id is not null
  on conflict (order_id) do nothing;

  get diagnostics n = row_count;
  raise notice 'backfilled % Cortex payment row(s) from the shared table.', n;
end $$;


/*
  VERIFY. Every row must read OK.
*/
select
  check_name,
  case when ok then 'OK' else 'FAIL' end as result,
  detail
from (
  select
    '1. cortex_payments exists' as check_name,
    to_regclass('public.cortex_payments') is not null as ok,
    coalesce(to_regclass('public.cortex_payments')::text, 'missing') as detail
  union all
  select
    '2. RLS on, and no policy (service role only)',
    coalesce((select relrowsecurity from pg_class where relname = 'cortex_payments'), false)
      and (select count(*) from pg_policies where tablename = 'cortex_payments') = 0,
    'rls=' || coalesce((select relrowsecurity::text from pg_class where relname = 'cortex_payments'), 'n/a')
      || ', policies=' || (select count(*)::text from pg_policies where tablename = 'cortex_payments')
  union all
  select
    '3. order_id is unique (idempotency)',
    exists (select 1 from pg_indexes where tablename = 'cortex_payments'
              and indexdef like '%UNIQUE%' and indexdef like '%order_id%'),
    coalesce((select string_agg(indexname, ', ') from pg_indexes where tablename = 'cortex_payments'), 'none')
  union all
  select
    '4. No NOT NULL that Cortex does not write',
    not exists (
      select 1 from pg_attribute
      where attrelid = 'public.cortex_payments'::regclass and attnum > 0 and not attisdropped
        and attnotnull and attname <> 'order_id'),
    coalesce((select string_agg(attname, ', ') from pg_attribute
      where attrelid = 'public.cortex_payments'::regclass and attnum > 0 and not attisdropped
        and attnotnull), 'order_id only')
  union all
  select
    '5. Backfill complete',
    (select count(*) from payments where org_id is not null)
      = (select count(*) from cortex_payments),
    (select count(*)::text from cortex_payments) || ' row(s) in cortex_payments, '
      || (select count(*)::text from payments where org_id is not null) || ' Cortex row(s) in the old table'
) t
order by check_name;
