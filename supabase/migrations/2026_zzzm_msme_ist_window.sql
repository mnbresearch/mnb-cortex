/*
  The 43B(h) clock ran a day late for five and a half hours every night.

  ============================================================================
  WHAT WAS WRONG
  ============================================================================

  cortex_msme_exposure aged every purchase bill with:

      (current_date - p.dated) as age_days

  `current_date` resolves in the SESSION timezone. This function sets
  `search_path` and nothing else, and Supabase sessions run in UTC. India is
  UTC+5:30, so between 00:00 and 05:30 IST `current_date` is YESTERDAY, and
  every bill's age is one day short.

  That matters because the whole function turns on one comparison:

      count(*)  filter (where m.age_days >  m.window_days)   -- exposure
      sum(amount) filter (where m.age_days <= m.window_days) -- "other"

  On the morning a bill actually crosses 45 days (or 15, with no written
  agreement), `age_days` reads 45 rather than 46 for the first 5h30m, `45 > 45`
  is false, and the bill stays in `other_amount` — the bucket the UI labels as
  reported-but-not-counted.

  So /msme reports ZERO exposure for a bill that has, in fact, crossed the
  window. This is not a display date: under s.43B(h) a payment to a registered
  micro or small enterprise beyond the window is DISALLOWED as a deduction in
  that year. It is the one figure on that page that is a tax liability, and it
  is also what the CA's client brief surfaces (lib/practice-brief-data.ts) —
  the person most likely to act on it.

  Under-reporting is the harmful direction here. Over-reporting makes an owner
  pay a supplier sooner than strictly required; under-reporting lets a
  deduction be claimed that will be disallowed on assessment.

  ============================================================================
  WHY THIS FIX AND NOT `set timezone`
  ============================================================================

  The repo has solved this once already. 2026_zz_aggregate_ist_overdue.sql
  fixed exactly this shape in cortex_aggregate and settled on:

      (now() at time zone 'Asia/Kolkata')::date

  That file's own reasoning applies unchanged, so it is reused rather than
  re-litigated: the expression is EXPLICIT about which timezone it means at
  the point of use, where a `set timezone` on the function is a property of the
  whole body that a later editor adding a second date expression will not see.

  It deliberately does NOT touch the month bucketing anywhere else. The TS and
  SQL paths are pinned to UTC *together* for revenue periods, and moving one
  side alone would make two screens disagree — a worse outcome than the shared
  5h30m skew they currently have. Ageing has no such pairing: lib/metrics.ts
  already computes overdue against an IST date, so this brings MSME into line
  with the rest of the product rather than out of it.

  ============================================================================
  EVERYTHING ELSE IS BYTE-FOR-BYTE THE PREVIOUS DEFINITION
  ============================================================================

  The per-bill window (45 with a written agreement, 15 without), the
  case-insensitive paid filter, the issue_date/created_at coalesce and the
  ordering are carried over unchanged from 2026_msme_exposure_fix.sql. The only
  edit is the date expression. Restating the body in full is required because
  Postgres has no way to patch one expression in a function.

  No DROP: the return type is identical, so `create or replace` is safe and
  leaves no window where the function is missing.
*/

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
