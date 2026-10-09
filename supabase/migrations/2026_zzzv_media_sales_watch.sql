/*
  MEDIA LIBRARY, SALES CORRECTNESS, AND THE NIGHTLY WATCH.

  Additive and safe to re-run. The code deployed with this works before it is
  applied (it detects the missing table and behaves as it did yesterday) and
  gains persistence, refunds and the sales fixes once it is.

  ============================================================================
  1. media_assets — every generated image and video, per workspace
  ============================================================================

  Before: a video existed only in the browser tab that asked for it. Close the
  tab, or let the six-minute poll give up, and the clip — which costs about
  ₹77 of Veo time — was gone, and if Veo failed AFTER accepting the job the
  credits were never refunded (only submit-time failures were). Images were
  kept as data URLs in React state; agent_runs recorded the text
  "[image generated]".

  Now: a row per job. Videos are created `running` at submit, settled by the
  status poll or by the nightly sweep (done → file copied into Storage; failed
  → refunded exactly once, guarded by `refunded`). Images are stored as soon
  as they are generated. Members read their own workspace's rows; only the
  service role writes.

  Files live in the private Storage bucket `media`, under <org_id>/<id>.<ext>.
  Nobody reads the bucket directly — /api/media checks membership and hands
  out a short-lived signed URL.
*/

create table if not exists media_assets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid,
  kind         text not null check (kind in ('image', 'video')),
  agent_id     text,
  title        text,
  prompt       text,
  aspect       text,
  status       text not null default 'done' check (status in ('running', 'done', 'failed')),
  operation    text unique,
  result_uri   text,
  storage_path text,
  mime         text,
  cost         integer not null default 0,
  charged      boolean not null default false,
  refunded     boolean not null default false,
  byo          boolean not null default false,
  error        text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists media_assets_org_created on media_assets (org_id, created_at desc);
create index if not exists media_assets_running on media_assets (status, created_at) where status = 'running';

alter table media_assets enable row level security;
drop policy if exists "members read media" on media_assets;
create policy "members read media" on media_assets
  for select using (org_id in (select user_org_ids()));
revoke insert, update, delete on media_assets from anon, authenticated;
grant select, insert, update, delete on media_assets to service_role;

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

/*
  ============================================================================
  2. Sales correctness
  ============================================================================

  a) STATUS CASE. Revenue is `status = 'won'` in SQL, but a Tally or CSV export
     writes "Won", and api_ingest stored it verbatim — so the workspace showed
     ₹0 revenue and empty RFM. The code now lowercases on every write; this
     fixes the rows already stored.
*/
update sales_orders set status = lower(trim(status)) where status is not null and status <> lower(trim(status));
update invoices     set status = lower(trim(status)) where status is not null and status <> lower(trim(status));

/*
  b) DEALS GO STALE FROM THEIR LAST MOVE, NOT THEIR BIRTH. sales_pipeline had
     no updated_at, so "going cold" meant "created 45 days ago" and moving a
     deal changed nothing.
*/
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'sales_pipeline' and column_name = 'updated_at') then
    alter table sales_pipeline add column updated_at timestamptz;
    -- Backfilled once, from the only date we have, BEFORE the trigger exists.
    update sales_pipeline set updated_at = coalesce(created_at, now());
    alter table sales_pipeline alter column updated_at set default now();
  end if;
end $$;
create or replace function cortex_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists sales_pipeline_touch on sales_pipeline;
create trigger sales_pipeline_touch before update on sales_pipeline
  for each row execute function cortex_touch_updated_at();

/*
  c) A LEAD BECOMES A CUSTOMER ONCE. convertLead had no guard, so a second
     click made a duplicate customer.
*/
alter table leads add column if not exists converted_customer_id uuid;

/*
  d) api_ingest: statuses are lowercased on the way in (the same "Won" bug, by
     the API door), invoice type is constrained, and a `leads` table is
     accepted so a website form can reach the Leads inbox through the
     customer's server or Zapier/Make — the Leads page told owners to do this
     and the function refused the table. Same grants as 2026_zzzt.
*/
create or replace function public.api_ingest(p_key text, p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_count int := 0;
  v_total int := coalesce(jsonb_array_length(p_rows), 0);
  v_skipped int := 0;
begin
  select org_id into v_org from api_keys
   where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
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
             coalesce((r->>'order_date')::date, current_date)
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
    /* Website enquiries pushed from the customer's server or Zapier/Make.
       Keyed by email (else the last ten digits of the phone, so +91 and 0 prefixes match); a lead already on file is not duplicated. */
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
select 'media_assets table' as item, to_regclass('public.media_assets') is not null as ok
union all
select 'media bucket', exists (select 1 from storage.buckets where id = 'media')
union all
select 'media_assets RLS on', (select relrowsecurity from pg_class where oid = 'public.media_assets'::regclass)
union all
select 'no mixed-case won', not exists (select 1 from sales_orders where status <> lower(trim(status)))
union all
select 'sales_pipeline.updated_at', exists (select 1 from information_schema.columns where table_name = 'sales_pipeline' and column_name = 'updated_at')
union all
select 'leads.converted_customer_id', exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'converted_customer_id')
union all
select 'api_ingest accepts leads', position('''leads''' in pg_get_functiondef('public.api_ingest(text,text,jsonb)'::regprocedure)) > 0;
