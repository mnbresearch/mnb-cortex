/* ===========================================================================
   One line changed: the overdue cutoff is now IST, not UTC.

   THE DISAGREEMENT THIS FIXES

   lib/metrics.ts computes "today" in Asia/Kolkata:
       new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", ... })
   and this function computed it in UTC:
       due_date < (now() at time zone 'utc')::date

   Between 18:30 and 24:00 UTC — 00:00 to 05:30 IST, the small hours of the
   NEXT day for every customer this product has — those two dates differ by
   one. So an invoice due today counted as overdue on one path and not on the
   other, and which answer a customer saw depended on whether this migration
   had been applied and therefore which path ran.

   "Receivables past due" is the number the product exists to surface. It
   should not move by a day's worth of invoices depending on the hour, and it
   should be measured against the calendar the business is actually living in.

   WHY THE REST IS COPIED VERBATIM

   Everything else here is byte-for-byte the function from
   2026_tenancy_aggregate.sql, deliberately. A first attempt rewrote it from
   scratch and silently lost five things: the `set timezone = 'UTC'` pin that
   stops month bucketing drifting, the `status <> 'lost'` filter, revenue
   counting only 'won' orders, openPay including committed purchase orders,
   and — worst — `poCount` counting ALL purchase orders. That last one feeds
   the "no source data" branch in metrics.ts, which DELETES health_metrics; a
   workspace whose only data was draft POs would have had its dashboard wiped.

   `set timezone = 'UTC'` stays. It governs how `coalesce(order_date,
   created_at)` buckets into months, which must stay UTC to match monthStart()
   in the TypeScript. `now() at time zone 'Asia/Kolkata'` is explicit about its
   own conversion and is unaffected by that pin.

   Safe to run: replaces one function, changes no data.
   =========================================================================== */

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
                     and (status = 'overdue' or (due_date is not null and due_date < (now() at time zone 'Asia/Kolkata')::date))),
                     -- ^ IST, matching the TypeScript fallback. See the header note.
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

/*
  THE GRANT IS THE PART THAT ALMOST GOT COPIED WRONG.

  "Copied verbatim" was right for the body and WRONG for the tail. The verbatim
  source for this file was the pre-tenancy version of the function, whose last
  line granted EXECUTE to `authenticated`. 2026_tenancy_aggregate.sql had
  deliberately revoked exactly that — and because this file is named `zz` so it
  applies LAST, copying the old tail silently undid the fix.

  What that would have cost: this function is SECURITY DEFINER, takes the org id
  as a PARAMETER, and checks no membership. Granted to `authenticated`,
  PostgREST exposes it at /rest/v1/rpc/cortex_aggregate to anyone with a free
  account. Post `{"p_org": "<any org uuid>"}` and you get that business's twelve
  months of revenue, receivables, payables, stock value, headcount and TOTAL
  MONTHLY PAYROLL, with RLS bypassed.

  And org UUIDs are not secret — the org switcher and the Practice console ship
  them to the browser as props. So the real damage is that revocation would stop
  working: remove a departing employee's or a fired accountant's membership and
  every other path locks them out correctly, but they kept the UUID, and this
  function would never have asked.

  There is no legitimate caller to serve. lib/metrics.ts:94 is the only call
  site and it uses the SERVICE-ROLE client, which does not need the grant.

  scripts/test-definer-grants.cjs now applies the whole migration directory in
  filename order and asserts the FINAL privilege, so a later file re-granting
  this fails the suite instead of winning by sort order.
*/
revoke execute on function public.cortex_aggregate(uuid) from public, anon, authenticated;
grant  execute on function public.cortex_aggregate(uuid) to service_role;
