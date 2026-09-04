/*
  The 43B(h) exposure was overstating itself, by a lot.

  THE BUG.

  cortex_msme_exposure grouped every unpaid bill by party and returned:

      sum(m.amount)                                       as total_amount,
      max(current_date - m.dated) > min(m.window_days)    as past_window

  `past_window` was a PER-PARTY flag driven by the party's OLDEST bill, while
  `total_amount` was the sum of ALL that party's bills. lib/msme.ts then adds the
  whole group to `atRisk` whenever the flag is true.

  Worked through, for a micro supplier with a written agreement (45-day window):

      one bill of ₹1,00,000 dated 60 days ago      -> genuinely at risk
      nine bills of ₹1,00,000 dated 5 days ago     -> nowhere near the window

      reported: past_window = (60 > 45) = true, total = ₹10,00,000, count = 10
      truth:                                        ₹1,00,000,  count = 1

  Ten times over. And this is a TAX number: the page tells an owner how much of
  their deduction is at risk, which is a figure they act on before a year end.
  The module's own header says inflating it is the failure it exists to prevent,
  and it was inflating it.

  THE FIX.

  Split the aggregate. Only bills actually past their own window count toward
  the exposure; the party's remaining balance is returned separately so the
  screen can still show the full relationship without adding it to the number
  that matters.

  Note the window is evaluated PER BILL rather than per party. Two bills from the
  same supplier can sit under different agreements, and taking min() across the
  group applied the harsher window to bills it did not govern.
*/

/*
  DROP first. Postgres refuses `create or replace` when the RETURN TYPE changes,
  and this adds two columns — so replacing in place fails with "cannot change
  return type of existing function" and the migration would abort halfway,
  leaving the broken version live.
*/
drop function if exists cortex_msme_exposure(uuid);

create function cortex_msme_exposure(p_org uuid)
returns table (
  party            text,
  udyam_category   text,
  invoice_count    bigint,   -- bills PAST the window
  total_amount     numeric,  -- value of those bills only
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
           (current_date - p.dated) as age_days
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
           sum(m.amount) desc
$$;

revoke all on function cortex_msme_exposure(uuid) from public, anon;
grant execute on function cortex_msme_exposure(uuid) to authenticated, service_role;

/*
  Backfill issue_date where it is missing but derivable.

  The importer now maps issue_date, but rows imported before that fix have NULL,
  and the ageing then runs from the import timestamp. A due date is the better
  anchor: for the overwhelming majority of Indian SME purchase bills the terms
  are 30 days, so due_date - 30 is far closer to the truth than "the day this
  spreadsheet was uploaded".

  Only where issue_date is null AND due_date is known — never overwriting a real
  value, and never inventing one out of nothing.
*/
update invoices
   set issue_date = (due_date - interval '30 days')::date
 where issue_date is null
   and due_date is not null
   and type = 'payable';
