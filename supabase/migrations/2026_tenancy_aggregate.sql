-- ============================================================
-- MNB CORTEX — aggregate in the database, not over the wire.
-- Safe to run more than once (idempotent).
--
-- THE PROBLEM. recomputeMetrics() runs after EVERY write, and began by pulling
-- up to 20,000 sales orders, 20,000 invoices, 20,000 purchase orders, 20,000
-- inventory items and 5,000 employees into the Node process to add them up.
--
-- That is O(total rows) work on every single save. A workspace with 20,000
-- orders transfers megabytes to record one new invoice, and adding n rows one
-- at a time through the UI is O(n²) bytes over the wire. It was fine at ten
-- rows and would have become unusable at scale — quietly, gradually, in a way
-- that reads as "the app got slow" rather than as a bug.
--
-- Postgres is very good at summing columns. This does all of it in one round
-- trip and returns a few hundred bytes of JSON.
--
-- The TypeScript still contains the same maths as a fallback, so a database
-- that has not run this migration keeps working exactly as before rather than
-- silently producing no metrics. The two paths are checked against each other
-- by scripts/test-aggregate.mjs against a real PostgreSQL.
-- ============================================================

create or replace function public.cortex_aggregate(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
-- Pinned. order_date is a `date` and created_at a `timestamptz`, so
-- coalesce() yields timestamptz and date_trunc()/::date would otherwise run in
-- the SESSION timezone. Under Asia/Kolkata an order created at 20:00 UTC on the
-- 31st buckets into the NEXT month, falls outside the twelve-month window, and
-- vanishes from both revenue and the order count — while the TypeScript
-- fallback, which is unconditionally UTC, keeps it. The two paths must not
-- disagree on which month a row belongs to.
set timezone = 'UTC'
as $$
with
  -- Twelve month-start dates, oldest first. Matches monthStart() in metrics.ts,
  -- which works in UTC.
  buckets as (
    select (date_trunc('month', (now() at time zone 'utc')) - (i || ' months')::interval)::date as period
    from generate_series(11, 0, -1) i
  ),

  orders as (
    select
      date_trunc('month', coalesce(o.order_date, o.created_at))::date as period,
      lower(coalesce(o.status, '')) as status,
      coalesce(o.amount, 0) as amount
    from sales_orders o
    where o.org_id = p_org
  ),
  orders_windowed as (
    select * from orders
    where period in (select period from buckets)
      and status <> 'lost'
  ),

  revenue_by_month as (
    select b.period,
           coalesce(sum(o.amount) filter (where o.status = 'won'), 0) as revenue,
           coalesce(count(o.*), 0) as orders
    from buckets b
    left join orders_windowed o on o.period = b.period
    group by b.period
  ),

  inv as (
    select
      lower(coalesce(i.status, 'pending')) as status,
      lower(coalesce(i.type, 'receivable')) as type,
      coalesce(i.amount, 0) as amount,
      i.due_date
    from invoices i
    where i.org_id = p_org
  ),

  po as (
    select coalesce(p.amount, 0) as amount
    from purchase_orders p
    where p.org_id = p_org
      and lower(coalesce(p.status, '')) in ('sent', 'received', 'approved')
  ),

  stock as (
    select
      coalesce(it.on_hand, 0) as on_hand,
      coalesce(it.unit_cost, 0) as unit_cost,
      coalesce(it.daily_consumption, 0) as daily_consumption,
      coalesce(it.reorder_level, 0) as reorder_level
    from inventory_items it
    where it.org_id = p_org
  ),

  staff as (
    select
      coalesce(e.performance, 0) as performance,
      coalesce(e.attendance_pct, 0) as attendance_pct,
      coalesce(e.attrition_risk, 0) as attrition_risk,
      coalesce(e.monthly_ctc, 0) as monthly_ctc
    from employees e
    where e.org_id = p_org
  )

select jsonb_build_object(
  'series', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'period', to_char(period, 'YYYY-MM-DD'),
      'revenue', revenue,
      'orders', orders
    ) order by period), '[]'::jsonb)
    from revenue_by_month
  ),

  -- Orders with no status at all: counted as orders, never as revenue. Surfaced
  -- so the app can explain why revenue reads lower than the order count.
  'ordersUnset', (select count(*) from orders_windowed where status = ''),
  'salesCount',  (select count(*) from orders),

  'openRecv',    (select coalesce(sum(amount), 0) from inv where status <> 'paid' and type <> 'payable'),
  'overdueRecv', (select coalesce(sum(amount), 0) from inv
                   where status <> 'paid' and type <> 'payable'
                     and (status = 'overdue' or (due_date is not null and due_date < (now() at time zone 'utc')::date))),
  'openPay',     (select coalesce(sum(amount), 0) from inv where status <> 'paid' and type = 'payable')
                 + (select coalesce(sum(amount), 0) from po),
  'invoiceCount',(select count(*) from inv),
  -- ALL purchase orders, not just the committed ones. The TS fallback sets
  -- hasPOs from pos.length over every row, and this feeds the "no source data"
  -- branch — which DELETES health_metrics and zeroes the ledger. A workspace
  -- whose only data was draft POs would have been wiped on the aggregate path
  -- and left alone on the fallback path. `openPay` above is separately filtered
  -- to sent/received/approved, which is where the filtering belongs.
  'poCount',     (select count(*) from purchase_orders where org_id = p_org),

  'stockValue',   (select coalesce(sum(on_hand * unit_cost), 0) from stock),
  'totalDaily',   (select coalesce(sum(daily_consumption), 0) from stock),
  'totalOnHand',  (select coalesce(sum(on_hand), 0) from stock),
  'belowReorder', (select count(*) from stock where reorder_level > 0 and on_hand < reorder_level),
  'itemCount',    (select count(*) from stock),

  'avgPerf',      (select coalesce(avg(performance), 0) from staff),
  'avgAttend',    (select coalesce(avg(attendance_pct), 0) from staff),
  'avgAttrition', (select coalesce(avg(attrition_risk), 0) from staff),
  'payroll',      (select coalesce(sum(monthly_ctc), 0) from staff),
  'staffCount',   (select count(*) from staff)
);
$$;

-- SERVICE ROLE ONLY.
--
-- An earlier version of this file granted EXECUTE to `authenticated` with a
-- comment claiming that "security definer + the p_org argument means it can
-- only ever aggregate the org it is asked about, and the caller has already
-- been authorised". The second half of that sentence was true of
-- recomputeMetrics (service role) and false of the grant, which created a
-- second caller that nothing authorised.
--
-- The function is `security definer`, so it bypasses RLS on sales_orders,
-- invoices, employees, inventory_items and purchase_orders. Granted to
-- `authenticated`, PostgREST exposes it at /rest/v1/rpc/cortex_aggregate to any
-- signed-up user — who, knowing only another workspace's UUID, would receive
-- twelve months of revenue, receivables, payables, stock value, headcount and
-- TOTAL MONTHLY PAYROLL. That is a competitor's entire P&L shape, and org ids
-- do circulate (the workspace switcher takes one as a request parameter).
--
-- An unguessable identifier is not an access control. The grant is removed.
-- Compare user_org_rank in 2026_tenancy.sql, which reasons correctly precisely
-- because it discloses only the CALLER'S OWN rank.
revoke execute on function public.cortex_aggregate(uuid) from public, anon, authenticated;
grant execute on function public.cortex_aggregate(uuid) to service_role;

-- The aggregate scans by org. These make it cheap at any size.
create index if not exists idx_sales_orders_org_date on sales_orders (org_id, order_date);
create index if not exists idx_invoices_org_status on invoices (org_id, status);
create index if not exists idx_inventory_org on inventory_items (org_id);
create index if not exists idx_employees_org on employees (org_id);
