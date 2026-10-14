/*
  finance_ledger.net_cash_flow — bank money-in minus money-out, stored as what it is.

  THE BUG. lib/persist-analysis.ts wrote each bank-statement month's net
  movement (money in − money out) into `net_profit`. A statement cannot tell
  profit from borrowing: a loan drawdown, owner capital, a GST refund or an
  asset sale all raise the net movement. From `net_profit` it reached the
  dashboard chart, /finance, /ratios and /runway labelled "net profit".

  WHAT THIS DOES.
    1. Adds a nullable `net_cash_flow numeric` column (no default — unknown
       must stay storable, same rule as 2026_metrics_layer.sql applied to
       cash_balance and net_profit).
    2. Backs up every non-null `net_profit` into
       finance_ledger_net_profit_backup_c BEFORE touching it, keyed on
       (org_id, period). Nothing is lost; any row can be restored from there.
    3. Moves those values into `net_cash_flow` and clears `net_profit`.

  WHY MOVING IS SAFE. Until this release the bank reader was the ONLY writer
  of net_profit (grep: persist-analysis.ts was the sole `net_profit:` write;
  recomputeMetrics owns revenue/receivables/payables/opex only, the GST reader
  owns gst_turnover/gst_tax, and the demo seeder's rows are is_demo and
  removable). So every non-null net_profit on file is a bank net flow.

  Idempotent: step 3 only touches rows whose net_cash_flow is still null, the
  backup insert is `on conflict do nothing`, and the column/table creates are
  `if not exists`. Re-running after a future feature starts writing a REAL
  net_profit would move that too — so this file is a one-time correction and
  must not be re-run once something else writes net_profit.
*/

alter table public.finance_ledger add column if not exists net_cash_flow numeric;

create table if not exists public.finance_ledger_net_profit_backup_c (
  org_id     uuid    not null,
  period     date    not null,
  net_profit numeric,
  moved_at   timestamptz not null default now(),
  primary key (org_id, period)
);
-- Operator-only: no policies, RLS on, so tenants cannot read other tenants' rows.
alter table public.finance_ledger_net_profit_backup_c enable row level security;

insert into public.finance_ledger_net_profit_backup_c (org_id, period, net_profit)
select org_id, period, net_profit
  from public.finance_ledger
 where net_profit is not null
   and net_cash_flow is null
on conflict (org_id, period) do nothing;

update public.finance_ledger
   set net_cash_flow = net_profit,
       net_profit    = null
 where net_profit is not null
   and net_cash_flow is null;

-- Verify: the column exists, and no row still carries a bank flow as profit.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'finance_ledger' and column_name = 'net_cash_flow') as net_cash_flow_column,
  (select count(*) from public.finance_ledger where net_cash_flow is not null) as rows_with_cash_flow,
  (select count(*) from public.finance_ledger where net_profit is not null)    as rows_with_net_profit_remaining,
  (select count(*) from public.finance_ledger_net_profit_backup_c)             as rows_backed_up;
