-- ============================================================
-- MNB CORTEX — the metrics aggregation layer
-- Safe to run more than once (idempotent).
--
-- The dashboard reads health_metrics and finance_ledger; nothing in the app
-- ever wrote to either, so imported data could never reach the dashboard.
-- src/lib/metrics.ts now derives both. This migration gives it the keys and
-- columns it needs.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Merge key for finance_ledger.
--
-- The ledger now has several writers that each own different columns:
--   * recomputeMetrics()  -> revenue, receivables, payables, opex   (from orders/invoices)
--   * bank statement read -> cash_balance, net_profit               (real cash movement)
--   * GST return read     -> gst_turnover, gst_tax                  (filed figures)
-- They upsert on (org_id, period) so each updates only its own columns and
-- never clobbers another source's work.
-- ------------------------------------------------------------

-- Collapse any pre-existing duplicate periods before adding the constraint,
-- keeping the most recently created row for each month.
delete from finance_ledger a
 using finance_ledger b
 where a.org_id = b.org_id
   and a.period = b.period
   and a.ctid   < b.ctid;

create unique index if not exists finance_ledger_org_period_key
  on finance_ledger (org_id, period);


-- ------------------------------------------------------------
-- 2. Columns for the GST reader.
--
-- A filed GST return is the most reliable revenue figure many Indian SMEs
-- have. Storing it separately from `revenue` (which is derived from sales
-- orders) means the two never overwrite each other, and the dashboard can
-- show whichever the workspace actually has.
-- ------------------------------------------------------------
alter table finance_ledger add column if not exists gst_turnover numeric;
alter table finance_ledger add column if not exists gst_tax numeric;

-- cash_balance and net_profit were `numeric default 0`, so a row created by the
-- sales-derived recompute looked identical to a real bank reading of zero. That
-- forced the reader to treat 0 as "absent", which silently discarded a genuine
-- zero balance and skewed the burn-rate average. NULL now means "unknown".
alter table finance_ledger alter column cash_balance drop default;
alter table finance_ledger alter column net_profit  drop default;


-- ------------------------------------------------------------
-- 3. Keep the KPI read fast.
-- ------------------------------------------------------------
create index if not exists health_metrics_org_key_idx
  on health_metrics (org_id, metric_key);

-- health_metrics is fully rewritten per workspace on each recompute, so a
-- stale row can never linger for a metric that is no longer computable.
