/*
  api_ingest must record the invoice date, or 43B(h) reads low forever.

  THE SHAPE OF THIS BUG IS ONE WE HAVE ALREADY HAD ONCE.

  2026_msme_exposure_fix.sql ends with a one-time backfill:

      update invoices set issue_date = (due_date - interval '30 days')::date
       where issue_date is null and due_date is not null and type = 'payable';

  Correct for the rows that existed when it ran, and no help afterwards, because
  nothing fills the column for new rows. `issue_date` has no default —
  2026_invoice_documents.sql:51 adds it bare — and both live write paths omitted
  it: this function, and the manual Add-invoice form in src/lib/actions.ts.
  Exactly the vendors backfill again: a statement, not a mechanism.

  WHY IT MATTERS. cortex_msme_exposure computes
  `coalesce(i.issue_date, i.created_at::date) as dated` and ages from it. With
  issue_date NULL a bill raised in July but ingested in September ages from
  September, fewer bills clear the 45-day window, and the disallowance exposure
  the customer takes to their CA comes out too small. The failure direction is
  false reassurance.

  WHAT CHANGED, AND ONLY THIS: the invoices branch now writes issue_date —
  taken from the payload when supplied, otherwise inferred from due_date by the
  same `- 30 days` rule the original backfill used, so rows ingested today and
  rows backfilled earlier age on the same basis. Everything else is reproduced
  verbatim from 2026_zzze_api_key_hash.sql.

  THE GRANTS ARE DELIBERATELY UNCHANGED AND MUST STAY THAT WAY. This function
  is executed with the ANON client by /api/v1/ingest — it authenticates on the
  key it is handed, not on a session, which is why it is granted to anon and
  authenticated and why cortex_definer_audit() lists it as reachable on
  purpose. Revoking that grant does not harden anything; it silently turns off
  every customer's API ingestion. I very nearly shipped exactly that mistake
  here, by rewriting the function from a grep instead of from the original.

  Safe to re-run: create or replace, no data statements.
*/

create or replace function public.api_ingest(p_key text, p_table text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_count int := 0;
begin
  select org_id into v_org from api_keys
   where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'invalid api key'); end if;

  if p_table = 'sales_orders' then
    insert into sales_orders (org_id, order_no, customer_name, region, product, amount, status, order_date)
      select v_org, coalesce(r->>'order_no','SO-'||floor(random()*1e6)::int), r->>'customer_name', coalesce(r->>'region','West'),
             r->>'product', coalesce((r->>'amount')::numeric,0), coalesce(r->>'status','won'), current_date
      from jsonb_array_elements(p_rows) r;
  elsif p_table = 'invoices' then
    insert into invoices (org_id, invoice_no, party, amount, status, type, issue_date, due_date)
      select v_org, coalesce(r->>'invoice_no','INV-'||floor(random()*1e6)::int), r->>'party',
             coalesce((r->>'amount')::numeric,0), coalesce(r->>'status','pending'), coalesce(r->>'type','receivable'),
             /* Supplied date first; otherwise the same inference the historical
                backfill made, rather than leaving NULL for created_at to fill. */
             coalesce((r->>'issue_date')::date, ((r->>'due_date')::date - interval '30 days')::date),
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

/* Identical to 2026_zzze_api_key_hash.sql. Restated because create or replace
   preserves grants, but a reader of this file should not have to know that. */
revoke all on function public.api_ingest(text, text, jsonb) from public;
grant execute on function public.api_ingest(text, text, jsonb) to anon, authenticated;
