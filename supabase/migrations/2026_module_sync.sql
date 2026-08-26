-- ============================================================
-- MNB CORTEX — connect the modules that only looked connected.
-- Safe to run more than once (idempotent).
--
-- Two tables were islands:
--
--  1. sales_pipeline. Dragging a deal to "won" changed one word in one row.
--     The pipeline showed a weighted forecast in crores that never reached
--     revenue, the dashboard, the AI's context or any report — so an owner
--     could close the biggest deal of the year and watch nothing move.
--     A won deal now writes a sales_orders row, and `source_deal_id` is what
--     stops a second one appearing every time the card is dragged back and
--     forth across the "won" column.
--
--  2. purchase_orders. Payables were computed only from invoices, so an
--     approved PO never appeared in Working Capital and vanished from
--     Approvals the moment it was approved. That needs no schema change —
--     metrics.ts now reads the table — but the index below makes the extra
--     read cheap enough to run on every save.
-- ============================================================

alter table sales_orders
  add column if not exists source_deal_id uuid;

-- One sales order per won deal. A partial unique index rather than a plain
-- one: source_deal_id is null for every manually entered or imported order,
-- and nulls must not collide with each other.
create unique index if not exists uniq_sales_order_per_deal
  on sales_orders (org_id, source_deal_id)
  where source_deal_id is not null;

create index if not exists idx_po_org_status
  on purchase_orders (org_id, status);

create index if not exists idx_production_runs_org_date
  on production_runs (org_id, run_date desc);
