/*
  43B(h): an unrecorded written agreement is UNKNOWN, and unknown ages at 15 days.

  THE BUG. vendors.has_written_agreement is `boolean not null default true`
  (2026_msme_43bh.sql) and nothing in the product ever writes it. So every
  supplier got the 45-day window, the MSMED Act's 15-day rule for suppliers
  WITHOUT a written agreement never applied, and a bill 30 days old to a
  micro supplier with no agreement — already disallowable — was reported as
  "within 45d".

  WHY THIS ROUTE (least risky):
    - Purely ADDITIVE. One nullable column, `written_agreement_recorded_at`.
      No existing value is rewritten, no default changed, no NOT NULL dropped.
      Existing `true` values stay exactly as they are.
    - Those existing values are all the column default (no code path wrote
      them), so they cannot be told apart from a deliberate "yes" by value.
      The new column is what tells them apart: a vendor's agreement counts as
      KNOWN only once /msme's per-supplier toggle (setVendorAgreement) records
      it, which sets both has_written_agreement and this timestamp.
    - Unknown uses the 15-day window — the conservative side, because
      under-reporting a disallowance is the harmful direction (see
      2026_zzzm_msme_ist_window.sql). The /msme page discloses this per
      supplier and in its explainer.

  THE FUNCTION. `create or replace` with the IDENTICAL signature and return
  table as 2026_zzzm_msme_ist_window.sql; the only change is the window
  expression. Everything else — IST ageing, case-insensitive paid filter,
  issue_date/created_at coalesce, per-bill windows, ordering — is carried over
  verbatim. Grants are preserved by create or replace.

  Idempotent: `add column if not exists` + `create or replace`. No data
  statements.
*/

alter table public.vendors add column if not exists written_agreement_recorded_at timestamptz;

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
       and lower(coalesce(i.status, 'pending')) <> 'paid'
  ),
  matched as (
    select p.*,
           v.udyam_category,
           /* 45 days ONLY when a written agreement has been RECORDED as
              existing. Not recorded (or no vendor row at all) is unknown, and
              unknown ages at the statutory 15 — the window that applies when
              there is no written agreement. */
           case when v.written_agreement_recorded_at is not null
                 and coalesce(v.has_written_agreement, false)
                then 45 else 15 end as window_days,
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
  order by coalesce(sum(m.amount) filter (where m.age_days > m.window_days), 0) desc,
           m.party asc
$$;

-- Verify: the column exists, and how many suppliers still have an unrecorded agreement.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'vendors' and column_name = 'written_agreement_recorded_at') as recorded_at_column,
  (select count(*) from public.vendors where written_agreement_recorded_at is null) as vendors_agreement_unknown,
  (select count(*) from public.vendors where written_agreement_recorded_at is not null) as vendors_agreement_recorded;
