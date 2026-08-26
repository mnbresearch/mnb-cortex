-- ============================================================
-- MNB CORTEX — make Leads a real module for customers.
-- Safe to run more than once (idempotent).
--
-- THE PROBLEM. /leads is titled "Pricing inquiries from your site" and reads
-- `leads` scoped to the caller's org. But all three writers — the pricing
-- inquiry form, the AI-visibility form and the access-request form — are
-- MNB's OWN marketing pages, and correctly insert with org_id = null so that
-- only the platform console sees them.
--
-- The consequence is that no code path anywhere could create a lead belonging
-- to a customer's workspace. /leads was therefore permanently empty for every
-- paying customer, showing "No leads yet. Share your pricing page: /pricing" —
-- a link to OUR pricing page — for ever.
--
-- The fix is not to remove the module. It is to give customers the three ways
-- they would actually get leads in:
--   1. their website posting to the public API   (this file)
--   2. a CSV import                              (src/lib/actions.ts)
--   3. typing one in by hand                     (src/lib/actions.ts + /leads)
--
-- api_ingest is extended rather than replaced, so existing integrations that
-- push sales_orders/invoices/inventory_items/customers are untouched.
-- ============================================================

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

  -- NEW. A customer's own website or form tool can now post its enquiries
  -- straight into their workspace, stamped with THEIR org_id — which is the
  -- thing that was missing.
  elsif p_table = 'leads' then
    insert into leads (org_id, name, email, phone, plan, source)
      select v_org, r->>'name', r->>'email', r->>'phone',
             r->>'plan', coalesce(r->>'source','api')
      from jsonb_array_elements(p_rows) r;

  elsif p_table = 'production_runs' then
    insert into production_runs (org_id, machine, shift, run_date, planned_qty, actual_qty, reject_qty, downtime_min, oee)
      select v_org, r->>'machine', r->>'shift', coalesce((r->>'run_date')::date, current_date),
             coalesce((r->>'planned_qty')::numeric,0), coalesce((r->>'actual_qty')::numeric,0),
             coalesce((r->>'reject_qty')::numeric,0), coalesce((r->>'downtime_min')::numeric,0),
             nullif(r->>'oee','')::numeric
      from jsonb_array_elements(p_rows) r;

  else
    return jsonb_build_object('ok', false, 'error', 'table not allowed');
  end if;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'inserted', v_count);
end $$;

grant execute on function public.api_ingest(text, text, jsonb) to anon, authenticated;

-- A customer typing a lead into their own workspace must be able to. The
-- existing insert policy is `with check (true)`, which allows it — but it also
-- allows any authenticated user to insert a lead against ANY org_id. Tighten it
-- to: null (a platform lead from our marketing pages) or your own workspace.
drop policy if exists "auth insert leads" on leads;
create policy "auth insert leads" on leads for insert to authenticated
  with check (org_id is null or org_id in (select user_org_ids()));
