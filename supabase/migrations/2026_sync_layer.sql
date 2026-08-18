-- ============================================================
-- MNB CORTEX — integration data sync
-- Safe to run more than once (idempotent).
--
-- The catalogue stored credentials for 62 providers and never read one to pull
-- data in. src/lib/sync now does. These are the keys it needs so a re-sync
-- UPDATES a record instead of duplicating it.
-- ============================================================

-- Collapse any pre-existing duplicates before adding the constraints, keeping
-- the most recently created row of each natural key.
delete from sales_orders a using sales_orders b
 where a.org_id = b.org_id and a.order_no = b.order_no
   and a.order_no is not null and a.ctid < b.ctid;

delete from invoices a using invoices b
 where a.org_id = b.org_id and a.invoice_no = b.invoice_no
   and a.invoice_no is not null and a.ctid < b.ctid;

delete from customers a using customers b
 where a.org_id = b.org_id and a.name = b.name
   and a.name is not null and a.ctid < b.ctid;

-- Partial unique indexes: rows without a natural key (manual entries) are
-- unaffected, so nothing existing breaks.
create unique index if not exists sales_orders_org_orderno_key
  on sales_orders (org_id, order_no) where order_no is not null;

create unique index if not exists invoices_org_invoiceno_key
  on invoices (org_id, invoice_no) where invoice_no is not null;

create unique index if not exists customers_org_name_key
  on customers (org_id, name) where name is not null;

-- Sync bookkeeping shown on the Integrations page.
alter table integrations add column if not exists last_sync  timestamptz;
alter table integrations add column if not exists last_error text;
