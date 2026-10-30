/*
  2026_zzzz_j_api_connector_scope.sql — api_ingest accepts connector keys.

  WHY. The Tally bridge pushes through /api/v1/ingest, and that needed
  ingest:write — a Practice+ capability (₹39,999). So the Integrations page
  offered Tally from Watch, and every Watch / Watch Pro / Try customer who
  followed the instructions was refused. The app now issues a narrower scope,
  connector:write, on every live plan (capability "connectors", config.ts),
  and this function has to recognise it.

  WHAT CHANGES, AND NOTHING ELSE:
    * the key lookup accepts ingest:write OR connector:write;
    * a key WITHOUT ingest:write may write only sales_orders, invoices,
      customers and inventory_items — never leads.
  The body is otherwise identical to 2026_zzzz_h_api_ingest_order_date.sql:
  same signature, same per-table behaviour, same return shape, same grants.
  Plan, batch size and rate limits are enforced in lib/api/auth.ts and the
  route before this is called.

  Idempotent: create or replace only; no data touched; existing keys unchanged.
*/

create or replace function public.api_ingest(p_key text, p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_count int := 0;
  v_total int := coalesce(jsonb_array_length(p_rows), 0);
  v_skipped int := 0;
  v_scopes text[];
begin
  select org_id, scopes into v_org, v_scopes from api_keys
   where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and ('ingest:write' = any(scopes) or 'connector:write' = any(scopes));
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'invalid api key'); end if;

  -- A connector-only key syncs books, never leads (mirrors lib/api-keys.ts CONNECTOR_TABLES).
  if not ('ingest:write' = any(v_scopes)) and p_table not in ('sales_orders', 'invoices', 'customers', 'inventory_items') then
    return jsonb_build_object('ok', false, 'error', 'a connector key cannot write ' || coalesce(p_table, 'that table'));
  end if;

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
select 'api_ingest accepts connector:write' as item, position('connector:write' in pg_get_functiondef('public.api_ingest(text,text,jsonb)'::regprocedure)) > 0 as ok
union all
select 'api_ingest keeps the leads fence for connector keys', position('a connector key cannot write' in pg_get_functiondef('public.api_ingest(text,text,jsonb)'::regprocedure)) > 0
union all
select 'api_ingest still uses the safe order_date parse', position('api_try_date(r->>''order_date'')' in pg_get_functiondef('public.api_ingest(text,text,jsonb)'::regprocedure)) > 0
union all
select 'api_ingest still checks revocation', position('revoked_at is null' in pg_get_functiondef('public.api_ingest(text,text,jsonb)'::regprocedure)) > 0
union all
select 'api_ingest is service-role only', not has_function_privilege('authenticated', 'public.api_ingest(text,text,jsonb)', 'EXECUTE');
