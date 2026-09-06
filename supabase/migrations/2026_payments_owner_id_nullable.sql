/*
  `payments.owner_id NOT NULL` blocked every Cortex payment from being recorded.

  FOUND BY PAYING ₹1 IN PRODUCTION:

      null value in column "owner_id" of relation "payments"
      violates not-null constraint

  The money left the customer's account and no credit arrived.

  WHY IT IS THERE.

  `payments` is SHARED. This Supabase project also serves a school/tuition app
  whose tables — students, teachers, attendance, payments — are keyed on
  `owner_id` (the individual user) rather than `org_id` (the workspace). That
  app added `owner_id NOT NULL`. Cortex writes org_id, kind, ref and never
  writes owner_id, so its inserts have violated the constraint ever since.

  migration_payments.sql anticipated the collision — it uses
  `create table if not exists` plus `add column if not exists` precisely because
  a payments table already existed with a different shape — but it could not
  anticipate a NOT NULL added later by the other application.

  THE FIX: drop the NOT NULL. It is safe for the other app, which always
  supplies owner_id; relaxing a constraint never invalidates rows that satisfy
  it.

  AND DELIBERATELY NOT: populating owner_id from the paying user.

  That is the obvious-looking alternative and it would be a security hole. The
  other app's policy on this table is

      payments_all: FOR ALL, USING (owner_id = auth.uid())

  which is PERMISSIVE and therefore OR'd with everything else. If Cortex set
  owner_id to the paying user, that user would gain SELECT, UPDATE and DELETE
  over their own Cortex payment row through PostgREST — including the ability to
  rewrite `status`, which is the idempotency guard the whole grant path depends
  on. A customer could mark an unpaid order 'paid', or delete a claim row and
  re-settle the same order repeatedly.

  Leaving it NULL is what keeps that policy from ever matching a Cortex row:
  `null = auth.uid()` evaluates to NULL, which is not TRUE, so the policy denies.
  The column stays empty on purpose, and this comment is why.

  THE REAL FIX, later: Cortex should not share a table with another product.
  Moving to `cortex_payments` removes the coupling entirely — the shared unique
  index on order_id, the shared RLS surface, and this constraint. That is a data
  migration with a backfill and is not something to do in the middle of proving
  the payment chain works.
*/

do $$
declare
  has_col boolean;
  is_required boolean;
begin
  if to_regclass('public.payments') is null then
    raise notice 'payments table does not exist — nothing to do.';
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'owner_id'
  ) into has_col;

  if not has_col then
    raise notice 'payments.owner_id does not exist — nothing to do.';
    return;
  end if;

  select attnotnull into is_required
  from pg_attribute
  where attrelid = 'public.payments'::regclass and attname = 'owner_id' and attnum > 0;

  if is_required then
    alter table payments alter column owner_id drop not null;
    raise notice 'payments.owner_id NOT NULL dropped — Cortex payments can now be recorded.';
  else
    raise notice 'payments.owner_id is already nullable — nothing to do.';
  end if;
end $$;


/*
  VERIFY. Both rows must read OK.

  Check 2 is the one that matters as much as the fix: if a Cortex payment row
  ever acquires an owner_id, the other app's `owner_id = auth.uid()` policy
  starts matching it and hands that user write access to their own billing
  record. It should always be zero.
*/
select
  check_name,
  case when ok then 'OK' else 'FAIL' end as result,
  detail
from (
  select
    '1. payments.owner_id is nullable' as check_name,
    not coalesce((select attnotnull from pg_attribute
       where attrelid = 'public.payments'::regclass and attname = 'owner_id' and attnum > 0), false) as ok,
    coalesce((select case when attnotnull then 'still NOT NULL' else 'nullable' end
       from pg_attribute
      where attrelid = 'public.payments'::regclass and attname = 'owner_id' and attnum > 0),
      'column absent (also fine)') as detail
  union all
  select
    '2. No Cortex row carries an owner_id',
    not exists (select 1 from payments where org_id is not null and owner_id is not null),
    (select count(*)::text || ' Cortex row(s) with an owner_id — must be 0'
       from payments where org_id is not null and owner_id is not null)
) t
order by check_name;
