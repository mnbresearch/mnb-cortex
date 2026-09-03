/*
  MSME 45-day exposure — Section 43B(h).

  WHY THIS MATTERS AND WHY NOTHING GENERIC DOES IT.

  Since FY 2023-24, a buyer who pays a registered MICRO or SMALL supplier later
  than the statutory window loses the income-tax deduction for that expense in
  the year it was incurred. The deduction moves to the year payment is actually
  made. So a late payment is not just a supplier-relations problem — it raises
  the buyer's taxable income for a year that is already closing.

  The window is 45 days where there is a written agreement, 15 days where there
  is not. It applies only to suppliers registered under Udyam as micro or small.
  Medium enterprises are NOT covered, and neither are traders.

  The whole of `src` contained zero occurrences of "Udyam" and one of "MSME",
  in unrelated loan copy. Meanwhile the pieces are all here: `invoices` with
  `type = 'payable'`, a payables page, a vendors module, and an alerts table
  with delivery now wired. What was missing was knowing WHICH suppliers are
  covered — which is one field per vendor and cannot be inferred, because Udyam
  registration status is not derivable from anything already stored.

  WHAT THIS DELIBERATELY DOES NOT DO.

  It does not compute anyone's tax. The figure it produces is "value of payables
  to micro/small suppliers past the statutory window", which is an exposure
  number, not a liability — the actual disallowance depends on the year end, the
  payment date and the assessee's method of accounting. Presenting it as a tax
  bill would be worse than not having the feature, because a wrong number about
  tax is acted upon.
*/

/*
  There was no `vendors` TABLE.

  /vendors rendered a hardcoded array of supplier names under the heading
  "Current suppliers" — a page asserting possession of data that did not exist
  for anybody. So this creates the table the module always implied, and the
  Udyam fields the 43B(h) calculation needs.
*/
create table if not exists vendors (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  category    text,
  contact     text,
  phone       text,
  email       text,
  /*
    Udyam classification.

    NULL means "we have not asked", and that is a DISTINCT state from "not
    covered". A workspace that has classified nothing must be told its exposure
    is UNKNOWN, not zero — reporting ₹0 to someone who simply has not filled
    this in is exactly the false reassurance this product keeps having to design
    against. Only 'micro' and 'small' are covered by 43B(h); medium is not.
  */
  udyam_category text check (udyam_category in ('micro','small','medium','not_registered')),
  udyam_number   text,
  /*
    Sets the statutory window: 45 days where there is a written agreement,
    15 where there is not. Defaults to true (45) — the LESS alarming
    assumption, so the feature cannot manufacture urgency it cannot justify.
  */
  has_written_agreement boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

create unique index if not exists vendors_org_name_key on vendors (org_id, name);
create index if not exists vendors_udyam_idx on vendors (org_id, udyam_category);

alter table vendors enable row level security;

drop policy if exists "members read vendors" on vendors;
create policy "members read vendors" on vendors for select
  using (org_id in (select user_org_ids()));
drop policy if exists "members write vendors" on vendors;
create policy "members write vendors" on vendors for insert
  with check (org_id in (select user_org_ids()));
drop policy if exists "members update vendors" on vendors;
create policy "members update vendors" on vendors for update
  using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));
drop policy if exists "members delete vendors" on vendors;
create policy "members delete vendors" on vendors for delete
  using (org_id in (select user_org_ids()));

/*
  Seed the vendor list from payables the workspace already has.

  Without this the feature opens empty and the owner has to type in suppliers
  Cortex can already see on their own bills — the kind of setup cost that makes
  a good feature go unused. Classification is left NULL, which the exposure
  report then surfaces as "unclassified" rather than pretending to know.
*/
insert into vendors (org_id, name)
select distinct i.org_id, trim(i.party)
  from invoices i
 where i.type = 'payable' and coalesce(trim(i.party), '') <> ''
on conflict (org_id, name) do nothing;

/*
  The exposure calculation, in SQL so one definition serves the page, the AI
  tool and the alert.

  Joins payables to vendors by name. That is imperfect — invoices carry a text
  `party`, not a vendor id — so the join is on normalised name using the same
  helper the customer linker uses, and anything that does not match is reported
  as UNCLASSIFIED rather than silently dropped. A supplier we cannot match is
  the case most likely to be a real exposure nobody has noticed.
*/
create or replace function cortex_msme_exposure(p_org uuid)
returns table (
  party            text,
  udyam_category   text,
  invoice_count    bigint,
  total_amount     numeric,
  oldest_days      int,
  window_days      int,
  past_window      boolean
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
       and i.type = 'payable'
       and coalesce(i.status, 'pending') <> 'paid'
  ),
  matched as (
    select p.*,
           v.udyam_category,
           case when coalesce(v.has_written_agreement, true) then 45 else 15 end as window_days
      from payables p
      left join vendors v
        on v.org_id = p_org
       and cortex_norm_name(v.name) = p.norm
  )
  select m.party,
         coalesce(m.udyam_category, 'unclassified') as udyam_category,
         count(*)                                   as invoice_count,
         sum(m.amount)                              as total_amount,
         max((current_date - m.dated))::int         as oldest_days,
         min(m.window_days)                         as window_days,
         max((current_date - m.dated)) > min(m.window_days) as past_window
    from matched m
   group by m.party, coalesce(m.udyam_category, 'unclassified')
   order by sum(m.amount) desc
$$;

revoke all on function cortex_msme_exposure(uuid) from public, anon;
grant execute on function cortex_msme_exposure(uuid) to authenticated, service_role;
