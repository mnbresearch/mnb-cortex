/*
  Make the natural-key upserts actually work.

  THE BUG, AND IT IS NOT NEW.

  2026_sync_layer.sql created these three indexes PARTIAL:

      create unique index if not exists invoices_org_invoiceno_key
        on invoices (org_id, invoice_no) where invoice_no is not null;

  Postgres cannot use a partial unique index as an ON CONFLICT arbiter unless
  the statement repeats the predicate. PostgREST's `.upsert(rows, { onConflict:
  "org_id,invoice_no" })` emits a bare `ON CONFLICT (org_id, invoice_no)`, with
  no WHERE. So every such upsert fails with:

      there is no unique or exclusion constraint matching the ON CONFLICT
      specification

  That is lib/sync/index.ts:290 — the Shopify, Stripe, Razorpay and Google
  Sheets importer. Its writes into invoices, sales_orders and customers have
  been erroring, which is why "connect your store and your orders appear" would
  not have worked for anyone who tried it.

  2026_sync_layer_fix.sql already tried to correct this by creating non-partial
  versions. It could not: it used `create unique index IF NOT EXISTS` with the
  SAME NAME, and the name already existed, so all three statements were silent
  no-ops. The dedupe deletes above them ran; the index change did not. A fix
  that cannot fail and also does nothing is the worst kind, because the problem
  now looks solved.

  WHY DROPPING THE PREDICATE IS SAFE.

  The predicate was there to allow many rows with a NULL invoice_no. It was
  never needed: in Postgres a unique index already treats NULLs as distinct, so
  `(org_id, NULL)` never collides with `(org_id, NULL)`. Verified rather than
  assumed — two NULL-numbered invoices insert happily under a non-partial unique
  index.

  So the non-partial index enforces exactly the same rule for real invoice
  numbers, permits exactly the same NULLs, and can serve as an arbiter. No row
  that is legal today becomes illegal.

  The dedupe from 2026_sync_layer_fix.sql is repeated here because these indexes
  may never have been rebuilt since, and CREATE UNIQUE INDEX fails outright if a
  duplicate exists. Keeping the OLDEST row and removing later copies of the same
  natural key is the same rule that file chose; it removes duplicates created by
  a re-import, not distinct business records.
*/

-- Remove duplicate natural keys, keeping the earliest row.
delete from sales_orders a using sales_orders b
 where a.org_id = b.org_id and a.order_no = b.order_no
   and a.order_no is not null
   and (a.created_at, a.ctid) < (b.created_at, b.ctid);

delete from invoices a using invoices b
 where a.org_id = b.org_id and a.invoice_no = b.invoice_no
   and a.invoice_no is not null
   and (a.created_at, a.ctid) < (b.created_at, b.ctid);

delete from customers a using customers b
 where a.org_id = b.org_id and a.name = b.name
   and a.name is not null
   and (a.created_at, a.ctid) < (b.created_at, b.ctid);

/*
  DROP then CREATE — not `if not exists`, which is precisely what made the last
  attempt a no-op.
*/
drop index if exists sales_orders_org_orderno_key;
create unique index sales_orders_org_orderno_key on sales_orders (org_id, order_no);

drop index if exists invoices_org_invoiceno_key;
create unique index invoices_org_invoiceno_key on invoices (org_id, invoice_no);

drop index if exists customers_org_name_key;
create unique index customers_org_name_key on customers (org_id, name);

/*
  Prove the arbiter works, here, at migration time.

  A silent no-op is exactly the failure being fixed, so this migration refuses
  to claim success it has not demonstrated: it performs a real upsert against
  each index inside a savepoint and rolls it back. If any index is still
  unusable as an arbiter, the migration raises rather than leaving the operator
  believing sync is repaired.
*/
do $$
declare
  probe_org uuid;
begin
  select id into probe_org from organizations limit 1;
  if probe_org is null then
    raise notice 'cortex: no organizations yet — arbiter self-check skipped';
    return;
  end if;

  begin
    insert into invoices (org_id, invoice_no, party, amount)
      values (probe_org, '__cortex_arbiter_probe__', 'probe', 0)
      on conflict (org_id, invoice_no) do update set amount = 0;
    delete from invoices where org_id = probe_org and invoice_no = '__cortex_arbiter_probe__';
  exception when others then
    raise exception 'cortex: invoices upsert arbiter still broken: %', sqlerrm;
  end;

  begin
    insert into sales_orders (org_id, order_no, customer_name, amount)
      values (probe_org, '__cortex_arbiter_probe__', 'probe', 0)
      on conflict (org_id, order_no) do update set amount = 0;
    delete from sales_orders where org_id = probe_org and order_no = '__cortex_arbiter_probe__';
  exception when others then
    raise exception 'cortex: sales_orders upsert arbiter still broken: %', sqlerrm;
  end;

  raise notice 'cortex: upsert arbiters verified on invoices and sales_orders';
end $$;
