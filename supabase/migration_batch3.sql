-- ===== Batch 3: Public API keys + ingest/metrics RPCs =====
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  label text, key text unique not null,
  created_at timestamptz default now()
);
alter table api_keys enable row level security;
drop policy if exists "tenant api_keys" on api_keys;
create policy "tenant api_keys" on api_keys for all
  using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()));

-- Ingest rows from an external system, authenticated by API key (bypasses RLS safely)
create or replace function public.api_ingest(p_key text, p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_count int := 0;
begin
  select org_id into v_org from api_keys where key = p_key;
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'invalid api key'); end if;
  if p_table = 'sales_orders' then
    insert into sales_orders (org_id, order_no, customer_name, region, product, amount, status, order_date)
      select v_org, coalesce(r->>'order_no','SO-'||floor(random()*1e6)::int), r->>'customer_name', coalesce(r->>'region','West'),
             r->>'product', coalesce((r->>'amount')::numeric,0), coalesce(r->>'status','won'), current_date
      from jsonb_array_elements(p_rows) r;
  elsif p_table = 'invoices' then
    insert into invoices (org_id, invoice_no, party, amount, status, type, due_date)
      select v_org, coalesce(r->>'invoice_no','INV-'||floor(random()*1e6)::int), r->>'party',
             coalesce((r->>'amount')::numeric,0), coalesce(r->>'status','pending'), coalesce(r->>'type','receivable'),
             coalesce((r->>'due_date')::date, current_date+15)
      from jsonb_array_elements(p_rows) r;
  elsif p_table = 'inventory_items' then
    insert into inventory_items (org_id, sku, name, category, on_hand, reorder_level, unit_cost, supplier)
      select v_org, r->>'sku', r->>'name', coalesce(r->>'category','raw'), coalesce((r->>'on_hand')::numeric,0),
             coalesce((r->>'reorder_level')::numeric,0), coalesce((r->>'unit_cost')::numeric,0), r->>'supplier'
      from jsonb_array_elements(p_rows) r;
  elsif p_table = 'customers' then
    insert into customers (org_id, name, company, email, phone, status, value)
      select v_org, r->>'name', r->>'company', r->>'email', r->>'phone', coalesce(r->>'status','lead'), coalesce((r->>'value')::numeric,0)
      from jsonb_array_elements(p_rows) r;
  else
    return jsonb_build_object('ok', false, 'error', 'table not allowed');
  end if;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'inserted', v_count);
end $$;

create or replace function public.api_metrics(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v jsonb;
begin
  select org_id into v_org from api_keys where key = p_key;
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'invalid api key'); end if;
  select jsonb_agg(jsonb_build_object('metric', metric_key, 'label', label, 'value', value, 'unit', unit, 'delta_pct', delta_pct, 'status', status))
    into v from health_metrics where org_id = v_org;
  return jsonb_build_object('ok', true, 'metrics', coalesce(v, '[]'::jsonb));
end $$;

grant execute on function public.api_ingest(text, text, jsonb) to anon, authenticated;
grant execute on function public.api_metrics(text) to anon, authenticated;
