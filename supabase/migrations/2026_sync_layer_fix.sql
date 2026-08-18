-- ============================================================
-- MNB CORTEX — make the sync natural keys usable as upsert targets
-- Safe to run more than once (idempotent).
--
-- 2026_sync_layer.sql created these three as PARTIAL unique indexes
-- (`where order_no is not null`). That looked harmless — manual rows with no
-- natural key stay unconstrained — but Postgres will only use a partial index
-- to resolve ON CONFLICT if the statement repeats the index predicate, and
-- PostgREST's on_conflict= parameter can only send column names. So every
-- integration sync raised 42P10 ("no unique or exclusion constraint matching
-- the ON CONFLICT specification") and imported nothing.
--
-- A plain unique index behaves the same way for manual rows: Postgres treats
-- NULLs as distinct, so any number of rows with a NULL natural key are still
-- allowed. Dropping the predicate costs nothing and makes the index inferable.
-- ============================================================

drop index if exists sales_orders_org_orderno_key;
drop index if exists invoices_org_invoiceno_key;
drop index if exists customers_org_name_key;

-- De-duplicate before recreating: rows may have been added since the original
-- migration ran. Keep the NEWEST of each natural key, ordered by created_at.
-- (The earlier migration used ctid for this, which is physical row position —
-- it changes on UPDATE and VACUUM FULL, so it can keep the older row.)
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

create unique index if not exists sales_orders_org_orderno_key
  on sales_orders (org_id, order_no);

create unique index if not exists invoices_org_invoiceno_key
  on invoices (org_id, invoice_no);

create unique index if not exists customers_org_name_key
  on customers (org_id, name);
