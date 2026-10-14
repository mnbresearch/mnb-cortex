-- RUN-2026-10-14-audit-fixes.sql
-- The SQL for 6.46 (full-app audit). Paste the WHOLE file into the Supabase SQL editor and run once.
-- Every block is idempotent and non-destructive; net_cash_flow backs up net_profit before moving it.
-- Each block ends with a verify SELECT. Order matches migrations/ORDER.txt.

-- ==================================================================
-- 2026_quotes_upsert_index.sql
-- ==================================================================
-- Make the quotes unique index usable by ON CONFLICT.
--
-- ============================================================================
-- THE DEFECT
-- ============================================================================
--
-- Pressing "Save to workspace" on /quote failed, in production, for every
-- customer, with a raw Postgres string shown on screen:
--
--     there is no unique or exclusion constraint matching the ON CONFLICT
--     specification
--
-- lib/actions.ts saveQuote() upserts with `onConflict: "org_id,quote_no"`.
-- 2026_invoice_documents.sql created the matching index as PARTIAL:
--
--     create unique index quotes_org_quoteno_key
--       on quotes (org_id, quote_no) where quote_no is not null;
--
-- Postgres will only use a partial index to resolve ON CONFLICT when the
-- statement itself carries a predicate that provably implies the index's
-- predicate. PostgREST's upsert emits no such predicate, so the planner finds
-- no usable arbiter and raises. The migration and the query were written
-- against different assumptions and nothing compared them.
--
-- The consequence is that the quotes table has always been empty: the feature
-- has never once saved a row. Which in turn is why /quote's saved-quote list,
-- its Won/Lost controls and its convert-to-invoice button were never reachable
-- — there was nothing for them to act on.
--
-- ============================================================================
-- WHY DROPPING THE PREDICATE IS SAFE, NOT A LOOSENING
-- ============================================================================
--
-- The `where quote_no is not null` looks like it is there to let several rows
-- hold a NULL quote_no. It is not needed for that: in a standard Postgres
-- unique index NULLs are DISTINCT from one another, so any number of rows may
-- have a NULL quote_no under a total index too. (That is the default; only
-- `NULLS NOT DISTINCT`, added in PG15 and not used here, would change it.)
--
-- So the predicate bought nothing and cost the entire feature. Removing it
-- leaves the constraint semantics identical for every row that has a quote
-- number, keeps multiple NULLs legal, and makes the index a valid ON CONFLICT
-- arbiter.
--
-- No data can be lost applying this: the partial index already forbade
-- duplicate non-null (org_id, quote_no) pairs, so no existing row can violate
-- the wider index.
--
-- Safe to run more than once.

begin;

drop index if exists quotes_org_quoteno_key;

create unique index if not exists quotes_org_quoteno_key
  on quotes (org_id, quote_no);

commit;

-- Verify: this should return one row, with indexpred NULL (i.e. not partial).
--
--   select indexrelid::regclass as index_name,
--          pg_get_expr(indpred, indrelid) as indexpred
--     from pg_index
--    where indrelid = 'quotes'::regclass and indisunique;


-- ==================================================================
-- 2026_zzzz_b_leads_rank_gates.sql
-- ==================================================================
-- ============================================================
-- MNB CORTEX — leads: an UPDATE policy, and a rank-gated DELETE.
-- Idempotent. Non-destructive: replaces policies only, touches no rows.
--
-- 1. "Make customer" (convertLead) marks the lead converted with an UPDATE.
--    There was NO update policy on leads anywhere in the repo's SQL, so under
--    RLS the update matched zero rows with no error: the customer was created
--    and the lead kept offering "Make customer" — a second press made a second
--    customer. Now: manager and above, own workspace only. Platform leads
--    (org_id null, from MNB's own marketing pages) are not updatable by any
--    tenant; the operator console uses the service role.
--
-- 2. DELETE was `org_id in (select user_org_ids())` — any member, including a
--    viewer, could erase the workspace's enquiries, and deleteLead had no role
--    check. Now manager and above, matching every other tenant table
--    (2026_tenancy.sql) and requireRole("manager") in actions.ts.
-- ============================================================

do $$
begin
  if to_regclass('public.leads') is null then
    raise notice 'skipping — table leads does not exist';
    return;
  end if;

  alter table leads enable row level security;

  /* Any older update/delete grants by the other naming convention, which would be OR'd with these. */
  drop policy if exists "tenant update leads" on leads;
  drop policy if exists "tenant delete leads" on leads;

  drop policy if exists "auth update leads" on leads;
  create policy "auth update leads" on leads for update to authenticated
    using (org_id is not null and user_org_rank(org_id) >= 3)
    with check (org_id is not null and user_org_rank(org_id) >= 3);

  drop policy if exists "auth delete leads" on leads;
  create policy "auth delete leads" on leads for delete to authenticated
    using (org_id is not null and user_org_rank(org_id) >= 3);
end $$;

-- Verify: expect "auth update leads" (UPDATE) and "auth delete leads" (DELETE),
-- both referencing user_org_rank(org_id) >= 3, and no FOR ALL policy on leads.
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'leads'
 order by cmd, policyname;


-- ==================================================================
-- 2026_zzzz_b_member_rank_gates.sql
-- ==================================================================
-- ============================================================
-- MNB CORTEX — memberships: an admin may not change an OWNER's row.
-- Idempotent. Non-destructive: replaces one policy, touches no rows.
--
-- /admin can now change a member's role and remove a member
-- (changeMemberRole / removeMember in src/lib/actions.ts). The app refuses to
-- let an admin act on an owner, and the database must agree.
--
-- 2026_rls_privilege_fix.sql already stops an admin DELETING an owner and
-- stops anyone below owner SETTING role = 'owner'. But "admins update members"
-- checked only the NEW row: `using (user_org_rank(org_id) >= 4)`. So an admin
-- could UPDATE an owner's row to role = 'viewer' — demoting an owner — as long
-- as another owner remained (the last-owner trigger only protects the last
-- one). That is the same escalation the delete policy was written to close,
-- reached by demotion instead of removal.
--
-- Now USING (the row as it is) carries the same owner clause as WITH CHECK
-- (the row as it will be): only an owner may touch an owner's membership.
-- The last-owner trigger (cortex_guard_last_owner) is unchanged.
-- ============================================================

do $$
begin
  if to_regclass('public.memberships') is null then
    raise notice 'skipping — table memberships does not exist';
    return;
  end if;

  drop policy if exists "admins update members" on memberships;
  create policy "admins update members" on memberships for update
    using (
      user_org_rank(org_id) >= 4
      and (lower(role::text) <> 'owner' or user_org_rank(org_id) >= 5)
    )
    with check (
      user_org_rank(org_id) >= 4
      and (lower(role::text) <> 'owner' or user_org_rank(org_id) >= 5)
    );
end $$;

-- Verify: "admins update members" should show the owner clause in BOTH qual and with_check.
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'memberships'
 order by cmd, policyname;


-- ==================================================================
-- 2026_zzzz_c_msme_agreement_unknown.sql
-- ==================================================================
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


-- ==================================================================
-- 2026_zzzz_c_net_cash_flow.sql
-- ==================================================================
/*
  finance_ledger.net_cash_flow — bank money-in minus money-out, stored as what it is.

  THE BUG. lib/persist-analysis.ts wrote each bank-statement month's net
  movement (money in − money out) into `net_profit`. A statement cannot tell
  profit from borrowing: a loan drawdown, owner capital, a GST refund or an
  asset sale all raise the net movement. From `net_profit` it reached the
  dashboard chart, /finance, /ratios and /runway labelled "net profit".

  WHAT THIS DOES.
    1. Adds a nullable `net_cash_flow numeric` column (no default — unknown
       must stay storable, same rule as 2026_metrics_layer.sql applied to
       cash_balance and net_profit).
    2. Backs up every non-null `net_profit` into
       finance_ledger_net_profit_backup_c BEFORE touching it, keyed on
       (org_id, period). Nothing is lost; any row can be restored from there.
    3. Moves those values into `net_cash_flow` and clears `net_profit`.

  WHY MOVING IS SAFE. Until this release the bank reader was the ONLY writer
  of net_profit (grep: persist-analysis.ts was the sole `net_profit:` write;
  recomputeMetrics owns revenue/receivables/payables/opex only, the GST reader
  owns gst_turnover/gst_tax, and the demo seeder's rows are is_demo and
  removable). So every non-null net_profit on file is a bank net flow.

  Idempotent: step 3 only touches rows whose net_cash_flow is still null, the
  backup insert is `on conflict do nothing`, and the column/table creates are
  `if not exists`. Re-running after a future feature starts writing a REAL
  net_profit would move that too — so this file is a one-time correction and
  must not be re-run once something else writes net_profit.
*/

alter table public.finance_ledger add column if not exists net_cash_flow numeric;

create table if not exists public.finance_ledger_net_profit_backup_c (
  org_id     uuid    not null,
  period     date    not null,
  net_profit numeric,
  moved_at   timestamptz not null default now(),
  primary key (org_id, period)
);
-- Operator-only: no policies, RLS on, so tenants cannot read other tenants' rows.
alter table public.finance_ledger_net_profit_backup_c enable row level security;

insert into public.finance_ledger_net_profit_backup_c (org_id, period, net_profit)
select org_id, period, net_profit
  from public.finance_ledger
 where net_profit is not null
   and net_cash_flow is null
on conflict (org_id, period) do nothing;

update public.finance_ledger
   set net_cash_flow = net_profit,
       net_profit    = null
 where net_profit is not null
   and net_cash_flow is null;

-- Verify: the column exists, and no row still carries a bank flow as profit.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'finance_ledger' and column_name = 'net_cash_flow') as net_cash_flow_column,
  (select count(*) from public.finance_ledger where net_cash_flow is not null) as rows_with_cash_flow,
  (select count(*) from public.finance_ledger where net_profit is not null)    as rows_with_net_profit_remaining,
  (select count(*) from public.finance_ledger_net_profit_backup_c)             as rows_backed_up;


-- ==================================================================
-- 2026_zzzz_e_invite_expiry.sql
-- ==================================================================
-- Invites expire.
--
-- An invite used to be claimable forever by whoever signed in with a matching
-- address (lib/workspace.ts claimInvites). The code now also requires a
-- CONFIRMED email; this adds the expiry half.
--
-- Idempotent and non-destructive:
--   * the column is added WITHOUT a default first, so Postgres does not evaluate
--     now() + 14 days for every existing row (that would silently extend every
--     old invite by another fortnight);
--   * then the default is set, so new invites get now() + 14 days;
--   * pending invites with no expiry are aged from created_at (the rule the app
--     already applies when expires_at is null), never extended.
-- Nothing is deleted; an expired invite simply stops being claimable and can be
-- re-sent.

alter table public.invites add column if not exists expires_at timestamptz;
alter table public.invites alter column expires_at set default (now() + interval '14 days');

update public.invites
   set expires_at = coalesce(created_at, now()) + interval '14 days'
 where expires_at is null
   and status = 'pending';

-- Verify: the column exists with its default, and no pending invite lacks an expiry.
select
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'invites' and column_name = 'expires_at') as expires_at_default,
  (select count(*) from public.invites where status = 'pending' and expires_at is null)   as pending_without_expiry,
  (select count(*) from public.invites where status = 'pending' and expires_at <= now())  as pending_already_expired;


-- ==================================================================
-- 2026_zzzz_h_api_ingest_order_date.sql
-- ==================================================================
/*
  2026_zzzz_h_api_ingest_order_date.sql — api_ingest: a malformed or blank
  order_date no longer fails the whole batch.

  WHAT WAS WRONG. Since 2026_zzzt the sales_orders branch reads the row's own
  order_date, but as `(r->>'order_date')::date`. That cast RAISES on anything
  that is not a valid date — "", "N/A", "31/02/2026", "2026-02-30" — and one
  bad row aborted the entire call: nothing written, a 500-ish error, and the
  caller left to guess which of 10,000 rows was at fault. A connector that
  sends `"order_date": ""` for undated rows could never ingest at all.

  NOW. The supplied order_date is used whenever it parses as an ISO date
  (YYYY-MM-DD, optionally followed by a time, e.g. "2026-03-05T10:00:00Z"),
  and the row falls back to current_date otherwise — the documented default
  for a row with no date. Non-ISO strings are NOT guessed at: "01/02/2026" is
  1 Feb or 2 Jan depending on who wrote it, so it is treated as no date rather
  than silently filed under the wrong month.

  EVERYTHING ELSE IS IDENTICAL to the latest definition (2026_zzzw_api_platform.sql):
  same signature (text, text, jsonb), same key/scope/revocation/expiry checks,
  same per-table behaviour, same return shape, same grants. The invoices
  branch's issue_date/due_date casts are deliberately unchanged here.

  Idempotent and non-destructive: create or replace only; no data touched.
*/

/* Safe ISO date parse: the date when `p` starts with a valid YYYY-MM-DD, else null. Never raises. */
create or replace function public.api_try_date(p text)
returns date language plpgsql stable set search_path = public as $$
declare s text := left(trim(coalesce(p, '')), 10);
begin
  if s !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  begin
    return s::date;
  exception when others then
    return null;
  end;
end $$;

revoke all on function public.api_try_date(text) from public;
revoke all on function public.api_try_date(text) from anon, authenticated;
grant execute on function public.api_try_date(text) to service_role;

create or replace function public.api_ingest(p_key text, p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_count int := 0;
  v_total int := coalesce(jsonb_array_length(p_rows), 0);
  v_skipped int := 0;
begin
  select org_id into v_org from api_keys
   where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and 'ingest:write' = any(scopes);
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'invalid api key'); end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'rows must be an array');
  end if;
  if v_total > 10000 then
    return jsonb_build_object('ok', false, 'error', 'at most 10000 rows per call');
  end if;

  if p_table = 'sales_orders' then
    select count(*) into v_skipped from jsonb_array_elements(p_rows) r where nullif(trim(r->>'order_no'), '') is null;
    insert into sales_orders (org_id, order_no, customer_name, region, product, amount, status, order_date)
      select distinct on (trim(r->>'order_no'))
             v_org, trim(r->>'order_no'), r->>'customer_name', nullif(r->>'region', ''),
             r->>'product', coalesce((r->>'amount')::numeric, 0), lower(trim(coalesce(nullif(r->>'status', ''), 'won'))),
             coalesce(public.api_try_date(r->>'order_date'), current_date)
        from jsonb_array_elements(p_rows) r
       where nullif(trim(r->>'order_no'), '') is not null
      on conflict (org_id, order_no) do update set
        customer_name = excluded.customer_name, region = coalesce(excluded.region, sales_orders.region),
        product = excluded.product, amount = excluded.amount, status = excluded.status, order_date = excluded.order_date;
  elsif p_table = 'invoices' then
    select count(*) into v_skipped from jsonb_array_elements(p_rows) r where nullif(trim(r->>'invoice_no'), '') is null;
    insert into invoices (org_id, invoice_no, party, amount, status, type, issue_date, due_date)
      select distinct on (trim(r->>'invoice_no'))
             v_org, trim(r->>'invoice_no'), r->>'party',
             coalesce((r->>'amount')::numeric, 0), lower(trim(coalesce(nullif(r->>'status', ''), 'pending'))),
             case when lower(trim(coalesce(r->>'type', ''))) = 'payable' then 'payable' else 'receivable' end,
             coalesce((r->>'issue_date')::date, ((r->>'due_date')::date - interval '30 days')::date),
             coalesce((r->>'due_date')::date, coalesce((r->>'issue_date')::date, current_date) + 15)
        from jsonb_array_elements(p_rows) r
       where nullif(trim(r->>'invoice_no'), '') is not null
      on conflict (org_id, invoice_no) do update set
        party = excluded.party, amount = excluded.amount, status = excluded.status, type = excluded.type,
        issue_date = excluded.issue_date, due_date = excluded.due_date;
  elsif p_table = 'inventory_items' then
    insert into inventory_items (org_id, sku, name, category, on_hand, reorder_level, unit_cost, supplier)
      select v_org, r->>'sku', r->>'name', coalesce(r->>'category', 'raw'), coalesce((r->>'on_hand')::numeric, 0),
             coalesce((r->>'reorder_level')::numeric, 0), coalesce((r->>'unit_cost')::numeric, 0), r->>'supplier'
        from jsonb_array_elements(p_rows) r;
  elsif p_table = 'customers' then
    select count(*) into v_skipped from jsonb_array_elements(p_rows) r where nullif(trim(r->>'name'), '') is null;
    insert into customers (org_id, name, company, email, phone, status, value)
      select distinct on (trim(r->>'name'))
             v_org, trim(r->>'name'), r->>'company', r->>'email', r->>'phone',
             coalesce(nullif(r->>'status', ''), 'lead'), coalesce((r->>'value')::numeric, 0)
        from jsonb_array_elements(p_rows) r
       where nullif(trim(r->>'name'), '') is not null
      on conflict (org_id, name) do update set
        company = coalesce(excluded.company, customers.company), email = coalesce(excluded.email, customers.email),
        phone = coalesce(excluded.phone, customers.phone), status = excluded.status, value = excluded.value;
  elsif p_table = 'leads' then
    select count(*) into v_skipped from jsonb_array_elements(p_rows) r
     where nullif(trim(r->>'email'), '') is null and nullif(right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10), '') is null;
    insert into leads (org_id, name, email, phone, company, plan, note, source)
      select distinct on (coalesce(lower(nullif(trim(r->>'email'), '')), right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10)))
             v_org, nullif(trim(r->>'name'), ''), lower(nullif(trim(r->>'email'), '')), nullif(trim(r->>'phone'), ''),
             nullif(trim(r->>'company'), ''), nullif(trim(r->>'plan'), ''), left(nullif(trim(r->>'note'), ''), 2000),
             coalesce(nullif(trim(r->>'source'), ''), 'api')
        from jsonb_array_elements(p_rows) r
       where (nullif(trim(r->>'email'), '') is not null or nullif(right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10), '') is not null)
         and not exists (
           select 1 from leads l where l.org_id = v_org and (
             (nullif(trim(r->>'email'), '') is not null and lower(l.email) = lower(trim(r->>'email')))
             or (nullif(right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10), '') is not null
                 and right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 10))));
  else
    return jsonb_build_object('ok', false, 'error', 'table not allowed');
  end if;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'written', v_count, 'inserted', v_count,
    'skipped_no_key', v_skipped,
    'note', case when v_skipped > 0 then v_skipped || ' row(s) had no ' ||
      case p_table when 'sales_orders' then 'order_no' when 'invoices' then 'invoice_no' when 'leads' then 'email or phone' else 'name' end ||
      ' and were not written' else null end);
end $$;

revoke all on function public.api_ingest(text, text, jsonb) from public;
revoke all on function public.api_ingest(text, text, jsonb) from anon, authenticated;
grant execute on function public.api_ingest(text, text, jsonb) to service_role;

notify pgrst, 'reload schema';

/* ---------- verify ---------- expect every row true */
select 'api_try_date parses ISO' as item, public.api_try_date('2026-03-05') = date '2026-03-05' as ok
union all
select 'api_try_date takes the date part of a timestamp', public.api_try_date('2026-03-05T10:00:00Z') = date '2026-03-05'
union all
select 'api_try_date: blank / invalid / non-ISO are null', public.api_try_date('') is null and public.api_try_date('2026-02-30') is null and public.api_try_date('01/02/2026') is null and public.api_try_date(null) is null
union all
select 'api_ingest uses the safe parse for order_date', position('api_try_date(r->>''order_date'')' in pg_get_functiondef('public.api_ingest(text,text,jsonb)'::regprocedure)) > 0
union all
select 'api_ingest still checks revocation', position('revoked_at is null' in pg_get_functiondef('public.api_ingest(text,text,jsonb)'::regprocedure)) > 0
union all
select 'api_ingest is service-role only', not has_function_privilege('authenticated', 'public.api_ingest(text,text,jsonb)', 'EXECUTE');


-- ==================================================================
-- 2026_zzzz_h_statutory_profile_composition.sql
-- ==================================================================
/* ===========================================================================
   2026_zzzz_h_statutory_profile_composition.sql — the composition answer.

   lib/statutory-profile.ts gains a seventh self-declared answer,
   `composition` (yes / no / unknown): is the workspace registered under the
   GST composition scheme? Without it CMP-08 and GSTR-4 could never read as
   "applies" — the best the calendar could say was "check" — and a
   composition dealer kept seeing the monthly GSTR-1 / GSTR-3B they do not
   file.

   NO COLUMN CHANGE IS NEEDED. The profile is the existing jsonb column
   organizations.statutory_profile (2026_zzzf_statutory_profile.sql), and an
   absent key already means "unknown", which shows everything. This file only
   adds the same typo guard the other six keys have, as a SEPARATE constraint
   so nothing existing is dropped or rewritten:

     composition is absent, or one of 'yes', 'no', 'unknown'.

   Every existing row passes it (none has the key yet). Idempotent: the
   constraint is added only if it is not already there. Non-destructive: no
   data is touched.
   =========================================================================== */

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_statutory_profile_composition'
  ) then
    alter table organizations add constraint organizations_statutory_profile_composition check (
      ((statutory_profile->>'composition') is null or (statutory_profile->>'composition') in ('yes','no','unknown'))
    );
  end if;
end $$;

/* ---------------------------------------------------------------- verify ---
   Expect: ok | ok | 0
   -------------------------------------------------------------------------- */
select
  case when exists (select 1 from pg_constraint
                     where conname='organizations_statutory_profile_shape')
       then 'ok' else 'MISSING (run 2026_zzzf_statutory_profile.sql first)' end as shape_constraint,
  case when exists (select 1 from pg_constraint
                     where conname='organizations_statutory_profile_composition')
       then 'ok' else 'MISSING' end                                          as composition_constraint,
  (select count(*) from organizations
    where (statutory_profile->>'composition') is not null
      and (statutory_profile->>'composition') not in ('yes','no','unknown'))  as invalid_composition_values;


notify pgrst, 'reload schema';
