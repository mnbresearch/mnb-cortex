-- ============================================================
-- MNB CORTEX — keep demo data separable from real data.
-- Safe to run more than once (idempotent).
--
-- TWO REAL PROBLEMS WITH seed_demo_data():
--
-- 1. IT DELETED REAL ROWS. It began with an unconditional
--    `delete from <table> where org_id = p_org` across fifteen tables. The
--    button that triggers it is the PRIMARY action in the onboarding wizard
--    ("Load demo data"), with "Import my own data" demoted to a text link. A
--    customer who imported their book and then went back to explore onboarding
--    lost it, silently, with no confirmation.
--
-- 2. THE CONTAMINATION WAS PERMANENT. The seeder writes cash_balance,
--    net_profit, gross_profit, cogs and ebitda into finance_ledger.
--    recomputeMetrics deliberately owns only revenue/receivables/payables/opex
--    — the bank and GST readers own the rest, and it must not destroy a paid
--    analysis. So demo cash and demo profit survived every recompute and sat on
--    the dashboard next to genuinely-derived real revenue, for ever, with no
--    way to remove them short of editing the database by hand.
--
-- Marking the rows fixes both: the seeder can wipe only its own previous demo
-- rows, and "Remove demo data" becomes a delete rather than an impossibility.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'finance_ledger','sales_orders','sales_pipeline','production_runs',
    'inventory_items','purchase_orders','employees','invoices',
    'market_reports','workflows','meetings','documents',
    'health_metrics','ai_insights','alerts'
  ] loop
    execute format('alter table %I add column if not exists is_demo boolean not null default false', t);
    execute format('create index if not exists idx_%s_org_demo on %I (org_id) where is_demo', t, t);
  end loop;
end $$;
