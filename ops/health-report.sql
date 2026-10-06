/*
  CORTEX — READ-ONLY HEALTH REPORT. Paste into the Supabase SQL editor.
  Changes nothing. Every query is a SELECT. Run it any time to see who is
  using the product and whether the automatic parts are actually working.
*/

-- 1. Accounts: how many people, how many signed in recently
select
  count(*)                                                        as users_total,
  count(*) filter (where created_at  > now() - interval '7 days') as signed_up_7d,
  count(*) filter (where last_sign_in_at > now() - interval '7 days') as active_7d,
  count(*) filter (where email_confirmed_at is null)               as unconfirmed
from auth.users;

-- 2. Workspaces by plan and subscription state
select coalesce(plan, '(none)') as plan, coalesce(subscription_status, '(none)') as status, count(*) as workspaces
from organizations group by 1, 2 order by 3 desc;

-- 3. Workspaces that have real data (not just signed up)
select
  (select count(distinct org_id) from invoices)      as with_invoices,
  (select count(distinct org_id) from sales_orders)  as with_orders,
  (select count(distinct org_id) from customers)     as with_customers,
  (select count(distinct org_id) from health_metrics) as with_kpis;

-- 4. Cortex Actions — is the action engine being used, and how
select action, status, count(*) as n, max(created_at) as latest
from action_proposals
where created_at > now() - interval '30 days'
group by 1, 2 order by 1, 3 desc;

-- 5. Proposals waiting on someone, and whether the owner was emailed
select org_id, count(*) as waiting, count(notified_at) as emailed, min(created_at) as oldest
from action_proposals where status = 'proposed' and expires_at > now()
group by 1 order by 2 desc limit 20;

-- 6. Automation — workflows and scheduled reports actually running
select trigger, is_active, count(*) as workflows, max(last_run) as last_run
from workflows group by 1, 2;
select mode, cadence, count(*) as reports, max(last_sent) as last_sent
from scheduled_reports where is_active group by 1, 2 order by 3 desc;

-- 7. Email delivery, last 7 days, by feature (anything "failed"/"unknown" needs a look)
select coalesce(kind, '(unknown)') as kind, status, count(*) as n
from email_sends where queued_at > now() - interval '7 days'
group by 1, 2 order by 1, 3 desc;

-- 8. AI credit spend, last 7 days, by what it was spent on
select split_part(coalesce(reason, ''), ':', 1) || ':' || split_part(coalesce(reason, ''), ':', 2) as what,
       count(*) as calls, -sum(delta) filter (where delta < 0) as credits_spent,
       sum(delta) filter (where delta > 0) as credits_refunded_or_granted
from credit_ledger where created_at > now() - interval '7 days'
group by 1 order by 3 desc nulls last limit 25;

-- 9. Collections — what Cortex has chased and recovered
select status, count(*) as threads, sum(recovered_amount) as recovered_inr
from collection_threads group by 1 order by 2 desc;
