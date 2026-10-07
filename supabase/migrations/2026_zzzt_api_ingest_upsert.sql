/*
  PUBLIC API INGEST: IDEMPOTENT, DATED, BOUNDED — AND ONLY REACHABLE THROUGH /api/v1.

  Found by an integrations audit, verified against the function body:

  1. A SECOND RUN FAILED. api_ingest did a plain INSERT, but sales_orders,
     invoices and customers have unique indexes on their natural keys
     (2026_upsert_arbiter_fix.sql). The Tally bridge's --watch mode re-sends
     the whole Voucher Register every 30 minutes, so every run after the first
     died on "duplicate key" — and any integrator retrying a batch did too.
     Now: INSERT … ON CONFLICT (org_id, <natural key>) DO UPDATE.

  2. DATES WERE THROWN AWAY. Orders were written with current_date whatever the
     payload said, so a historical import landed as today and inflated
     month-to-date revenue. Now order_date comes from the row (today only if
     absent). The invented region 'West' is gone — unknown stays NULL.

  3. RANDOM KEYS COLLIDED WITH THEMSELVES. A row without a number got
     'SO-'||random()*1e6; a 10,000-row batch almost certainly drew the same
     number twice and failed whole. A row with no natural key is now refused
     with a count in the result, never invented.

  4. THE RATE LIMIT AND ROW CAP COULD BE SKIPPED. The function was granted to
     anon, so anyone holding the public anon key could call
     /rest/v1/rpc/api_ingest directly and bypass the 10,000-row cap and the
     60-calls-an-hour limit enforced in the route. The cap now lives inside the
     function too, and both API functions are callable only by service_role:
     /api/v1/ingest and /api/v1/metrics call them with the service client,
     AFTER their own key-hash rate limits. (An earlier comment warned that
     revoking anon "turns off every customer's ingestion" — true while the
     route used the anon client; the route is changed in the same release.)

  Safe to re-run: create or replace, grants restated, no data statements.
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
             r->>'product', coalesce((r->>'amount')::numeric, 0), coalesce(nullif(r->>'status', ''), 'won'),
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
             coalesce((r->>'amount')::numeric, 0), coalesce(nullif(r->>'status', ''), 'pending'), coalesce(nullif(r->>'type', ''), 'receivable'),
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
  else
    return jsonb_build_object('ok', false, 'error', 'table not allowed');
  end if;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'written', v_count, 'inserted', v_count,
    'skipped_no_key', v_skipped,
    'note', case when v_skipped > 0 then v_skipped || ' row(s) had no ' ||
      case p_table when 'sales_orders' then 'order_no' when 'invoices' then 'invoice_no' else 'name' end ||
      ' and were not written' else null end);
end $$;

revoke all on function public.api_ingest(text, text, jsonb) from public;
revoke all on function public.api_ingest(text, text, jsonb) from anon, authenticated;
grant execute on function public.api_ingest(text, text, jsonb) to service_role;

revoke all on function public.api_metrics(text) from public;
revoke all on function public.api_metrics(text) from anon, authenticated;
grant execute on function public.api_metrics(text) to service_role;

notify pgrst, 'reload schema';

/* verify: expect service_role only, for both */
select p.proname, r.rolname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(p.proacl) a
  join pg_roles r on r.oid = a.grantee
 where n.nspname = 'public' and p.proname in ('api_ingest', 'api_metrics')
 order by 1, 2;
