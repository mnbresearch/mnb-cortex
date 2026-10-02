/* ===========================================================================
   RUN THIS IN THE SUPABASE SQL EDITOR.

   ONE function replacement. No data is touched, nothing is dropped, the
   return type is unchanged, and running it twice is harmless. It takes effect
   immediately for every workspace. Until you run it, /msme keeps behaving
   exactly as it does now — which is the problem.

   WHY IT MATTERS, BRIEFLY

   cortex_msme_exposure aged every purchase bill with `current_date - dated`.
   `current_date` resolves in the SESSION timezone; Supabase sessions are UTC
   and this function set only search_path. India is UTC+5:30, so between
   00:00 and 05:30 IST every bill's age reads one day short.

   The whole function turns on one comparison — `age_days > window_days` (45
   with a written agreement, 15 without). On the morning a bill actually
   crosses the window, 45 > 45 is false, and the bill stays in the
   "reported but never counted" bucket for another day.

   So /msme reports ZERO exposure on a bill that has crossed. Under s.43B(h)
   that payment is DISALLOWED as a deduction, so this is not a display date:
   under-reporting lets a deduction be claimed that will be struck on
   assessment. The CA-facing client brief reads the same function.

   The fix is one expression, and it is the same one
   2026_zz_aggregate_ist_overdue.sql already applied to cortex_aggregate:
   `(now() at time zone 'Asia/Kolkata')::date`.

   Repo copy: supabase/migrations/2026_zzzm_msme_ist_window.sql
   =========================================================================== */

create or replace function cortex_msme_exposure(p_org uuid)
returns table (
  party            text,
  udyam_category   text,
  invoice_count    bigint,   -- bills PAST the window
  total_amount     numeric,
  oldest_days      int,
  window_days      int,
  past_window      boolean,
  other_count      bigint,   -- bills still inside the window
  other_amount     numeric   -- and their value, reported but never counted
)
language sql
stable
security invoker
set search_path = public
as $$
  with payables as (
    select i.party,
           i.amount,
           coalesce(i.issue_date, i.created_at::date) as dated,
           cortex_norm_name(i.party)                  as norm
      from invoices i
     where i.org_id = p_org
       and lower(i.type) = 'payable'
       /*
         Case-insensitive. A Tally or Vyapar export writes "Paid", and the old
         `<> 'paid'` let those bills through — inflating a tax figure with money
         that had already gone out.
       */
       and lower(coalesce(i.status, 'pending')) <> 'paid'
  ),
  matched as (
    select p.*,
           v.udyam_category,
           /* Per BILL, not per party: two bills from one supplier can sit under
              different agreements, and min() applied the harsher window to bills
              it did not govern. */
           case when coalesce(v.has_written_agreement, true) then 45 else 15 end as window_days,
           /* IST, not the session's UTC. See the header: this comparison is a
              tax position, and a day short of it is a disallowed deduction
              reported as compliant. */
           ((now() at time zone 'Asia/Kolkata')::date - p.dated) as age_days
      from payables p
      left join vendors v
        on v.org_id = p_org
       and cortex_norm_name(v.name) = p.norm
  )
  select
    m.party,
    coalesce(m.udyam_category, 'unclassified')                                  as udyam_category,
    count(*) filter (where m.age_days > m.window_days)                          as invoice_count,
    coalesce(sum(m.amount) filter (where m.age_days > m.window_days), 0)        as total_amount,
    coalesce(max(m.age_days) filter (where m.age_days > m.window_days), 0)::int as oldest_days,
    min(m.window_days)                                                          as window_days,
    bool_or(m.age_days > m.window_days)                                         as past_window,
    count(*) filter (where m.age_days <= m.window_days)                         as other_count,
    coalesce(sum(m.amount) filter (where m.age_days <= m.window_days), 0)       as other_amount
  from matched m
  group by m.party, coalesce(m.udyam_category, 'unclassified')
  /* Worst exposure first; a party with nothing past the window sorts last. */
  order by coalesce(sum(m.amount) filter (where m.age_days > m.window_days), 0) desc,
           m.party asc
$$;

/* ===========================================================================
   VERIFY IT LANDED.

   Returns one row. `ist_fix_applied` must be true. It reads the function's
   own source back out of the catalogue, so it cannot be satisfied by anything
   except the replacement above actually being in place.
   =========================================================================== */

select
  (prosrc like '%Asia/Kolkata%')                 as ist_fix_applied,
  (prosrc like '%(current_date - p.dated)%')     as still_has_the_old_utc_expression,
  pg_get_function_identity_arguments(oid)        as signature
from pg_proc
where proname = 'cortex_msme_exposure';

/* ---------------------------------------------------------------------------
   AND SEE WHETHER IT CHANGED ANY NUMBER FOR YOU RIGHT NOW.

   Lists bills whose age differs between the two readings — i.e. the ones that
   were being under-reported. Empty is the normal result and means no bill of
   yours is sitting exactly on the boundary today; it does NOT mean the fix
   was unnecessary, because the boundary moves every night.
--------------------------------------------------------------------------- */

select o.name                                            as workspace,
       i.party,
       i.amount,
       coalesce(i.issue_date, i.created_at::date)         as dated,
       (current_date - coalesce(i.issue_date, i.created_at::date))                             as age_utc,
       ((now() at time zone 'Asia/Kolkata')::date - coalesce(i.issue_date, i.created_at::date)) as age_ist
  from invoices i
  join organizations o on o.id = i.org_id
 where lower(i.type) = 'payable'
   and lower(coalesce(i.status, 'pending')) <> 'paid'
   and (current_date - coalesce(i.issue_date, i.created_at::date))
       <> ((now() at time zone 'Asia/Kolkata')::date - coalesce(i.issue_date, i.created_at::date))
 order by i.amount desc
 limit 50;
