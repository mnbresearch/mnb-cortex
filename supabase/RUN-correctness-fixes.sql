/* ===========================================================================
   RUN THIS IN THE SUPABASE SQL EDITOR.

   Two function replacements. No data is touched, nothing is dropped, and
   running it twice is harmless.

   1. public_report()    — the public share link stops publishing sample data.
   2. cortex_aggregate() — the overdue cutoff becomes IST, matching the app.

   Both are `create or replace`, so they take effect immediately for every
   workspace. Until you run this, the app keeps working exactly as it does now.
   =========================================================================== */


/* ---------------------------------------------------------------------------
   1. THE SHARE LINK MUST NOT PUBLISH SAMPLE DATA

   /r/<token> renders "<Your Company> — Business Snapshot" and is meant to be
   sent to a banker, an investor or a buyer. It had no is_demo filter and no
   date, so a workspace that had clicked "Load a sample dataset" — the first
   thing a new customer is invited to do — could share a link showing ₹4.25 Cr
   revenue and ₹51 L net profit under its own name, indistinguishable from
   live figures.

   Also fixed: `limit 4` on the insights was applied to the aggregate's single
   output row rather than to the rows going into it, so every insight was
   published rather than four.
--------------------------------------------------------------------------- */

create or replace function public.public_report(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_metrics jsonb; v_insights jsonb; v_as_of date;
begin
  select org_id into v_org from report_links where token = p_token;
  if v_org is null then return jsonb_build_object('ok', false); end if;
  select name into v_name from organizations where id = v_org;

  /* coalesce(): rows written before is_demo existed are NULL, and NULL is not
     false. Those predate the sample dataset, so "real" is the correct reading
     — treating unknown provenance as demo would blank genuine snapshots. */
  select jsonb_agg(jsonb_build_object(
           'label', label, 'value', value, 'unit', unit,
           'delta_pct', delta_pct, 'status', status, 'as_of', as_of))
    into v_metrics
    from health_metrics
   where org_id = v_org and coalesce(is_demo, false) = false;

  select max(as_of) into v_as_of
    from health_metrics
   where org_id = v_org and coalesce(is_demo, false) = false;

  select jsonb_agg(jsonb_build_object('title', title, 'detail', detail, 'severity', severity))
    into v_insights
    from (
      select title, detail, severity
        from ai_insights
       where org_id = v_org and coalesce(is_demo, false) = false
       order by created_at desc
       limit 4
    ) i;

  return jsonb_build_object(
    'ok', true,
    'company', coalesce(v_name, 'Company'),
    'as_of', v_as_of,
    'metrics', coalesce(v_metrics, '[]'::jsonb),
    'insights', coalesce(v_insights, '[]'::jsonb));
end $$;

grant execute on function public.public_report(text) to anon, authenticated;


/* ---------------------------------------------------------------------------
   2. THE OVERDUE CUTOFF MUST BE IST

   lib/metrics.ts computes "today" in Asia/Kolkata. This function computed it
   in UTC. Between 18:30 and 24:00 UTC — which is 00:00 to 05:30 IST, the small
   hours of the next day for every customer this product has — those two dates
   differ by one, so an invoice due today counted as overdue on one path and
   not the other.

   Everything except that one line is copied verbatim from
   2026_tenancy_aggregate.sql. The pinned `set timezone = 'UTC'` stays: it
   governs how orders bucket into months, which must remain UTC to match the
   TypeScript. `now() at time zone 'Asia/Kolkata'` is explicit about its own
   conversion and is unaffected by that pin.
--------------------------------------------------------------------------- */

create or replace function public.cortex_aggregate(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set timezone = 'UTC'
as $$
with
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
      'period', to_char(period, 'YYYY-MM-DD'), 'revenue', revenue, 'orders', orders
    ) order by period), '[]'::jsonb)
    from revenue_by_month
  ),
  'ordersUnset', (select count(*) from orders_windowed where status = ''),
  'salesCount',  (select count(*) from orders),
  'openRecv',    (select coalesce(sum(amount), 0) from inv where status <> 'paid' and type <> 'payable'),
  'overdueRecv', (select coalesce(sum(amount), 0) from inv
                   where status <> 'paid' and type <> 'payable'
                     and (status = 'overdue' or (due_date is not null and due_date < (now() at time zone 'Asia/Kolkata')::date))),
  'openPay',     (select coalesce(sum(amount), 0) from inv where status <> 'paid' and type = 'payable')
                 + (select coalesce(sum(amount), 0) from po),
  'invoiceCount',(select count(*) from inv),
  /* ALL purchase orders, deliberately — this feeds the "no source data" branch
     in metrics.ts, which DELETES health_metrics. Filtering it here would wipe
     the dashboard of a workspace whose only data is draft POs. */
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
  NOT `authenticated`. This function is SECURITY DEFINER and takes the org id as
  a parameter with no membership check, so granting it to `authenticated` would
  publish any workspace's revenue, receivables and payroll at
  /rest/v1/rpc/cortex_aggregate to anyone holding that org's UUID — and org
  UUIDs ship to the browser in the org switcher. lib/metrics.ts calls this with
  the service-role client, which does not need the grant.
*/
revoke execute on function public.cortex_aggregate(uuid) from public, anon, authenticated;
grant  execute on function public.cortex_aggregate(uuid) to service_role;


/* --------------------------------------------------------------- verify --- */
select check_name, result, detail from (
  select
    '1. Share link filters out sample data' as check_name,
    case when (select prosrc from pg_proc where proname = 'public_report')
              like '%coalesce(is_demo, false) = false%'
         then 'OK' else 'FAIL' end as result,
    'demo KPIs and insights can no longer be published to a share link' as detail
  union all
  select
    '2. Share link reports a date',
    case when (select prosrc from pg_proc where proname = 'public_report') like '%v_as_of%'
         then 'OK' else 'FAIL' end,
    'the reader is told which date the figures are as at'
  union all
  select
    '3. Overdue cutoff is IST',
    case when (select prosrc from pg_proc where proname = 'cortex_aggregate') like '%Asia/Kolkata%'
         then 'OK' else 'FAIL' end,
    'matches the Asia/Kolkata date used by lib/metrics.ts'
  union all
  select
    '4. No UTC cutoff left behind',
    case when (select prosrc from pg_proc where proname = 'cortex_aggregate')
              like '%due_date < (now() at time zone ''utc'')::date%'
         then 'FAIL' else 'OK' end,
    'the two paths now agree on which invoices are past due'
  union all
  select
    '5. poCount still counts ALL purchase orders',
    case when (select prosrc from pg_proc where proname = 'cortex_aggregate')
              like '%''poCount'',     (select count(*) from purchase_orders where org_id = p_org)%'
         then 'OK' else 'REVIEW' end,
    'filtering this would wipe health_metrics for a draft-PO-only workspace'
) t order by check_name;
