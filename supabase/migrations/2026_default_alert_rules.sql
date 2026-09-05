/*
  Default alert rules, so "watched daily" is true on the plan that sells it.

  THE PROBLEM.

  "Receivables, payables & cash — watched daily" is a bullet on Watch, the
  ₹4,999 entry plan, and the landing page goes further: "Cortex emails you the
  day an invoice crosses its due date — with the name and the number."

  The mechanism behind both is alert_rules → deliverAlerts(). But no default
  rules were ever seeded — 2026_alert_rules.sql creates the table and nothing
  writes to it — so a new workspace has ZERO rules and the nightly evaluation
  has nothing to evaluate. Nothing is watched, nothing is emailed, and the
  customer's experience of the plan's headline promise is silence.

  Worse, the fix that suggested itself was the wrong one. Custom alert rules are
  a Watch Pro differentiator, so gating rule CREATION to Watch Pro would have
  been consistent with the price list and would have made Watch's own bullet
  permanently unbackable — enforcing the pricing by breaking the product.

  THE SPLIT THAT MAKES BOTH TRUE.

    Watch      gets these defaults, applied automatically. It is watched daily,
               with no setup, which is exactly what the bullet says.
    Watch Pro  additionally gets "Alert rules YOU set" — thresholds of their
               own choosing, on any metric. That is the differentiator, and it
               is a real one.

  WHY THESE THRESHOLDS.

  A default that fires constantly is worse than no default: people learn to
  ignore the sender, and then the one that mattered is ignored too. So these
  are deliberately conservative, and each is a number an owner would agree is
  worth an email rather than a number that is merely unusual.

    receivables > 500000   ₹5,00,000 past due. Below this most SMEs are simply
                           carrying normal float; above it, cash is at risk.
    risk        > 60       The composite risk score, on a 0-100 scale where the
                           product already bands 50+ as "warning".
    cash        < 30       Days of runway. Under a month is the point at which
                           an owner needs to be doing something about it.

  Only rules for metrics the workspace ACTUALLY EMITS would be ideal, but a
  rule for an absent metric is harmless: the evaluator joins against
  health_metrics and a missing key simply never matches. Inserting all three
  up front means the rule is already there on the day the metric first appears.
*/

-- ---------------------------------------------------------------------------
-- 1. One row per (org, metric, op), so re-running cannot duplicate a rule.
-- ---------------------------------------------------------------------------

/*
  saveAlertRule() already upserts on this conflict target, so the index it
  needs may or may not exist depending on which migrations a deployment has
  had. Creating it here makes the backfill below safe either way.
*/
create unique index if not exists alert_rules_org_metric_op
  on alert_rules (org_id, metric_key, op);

-- ---------------------------------------------------------------------------
-- 2. Backfill every existing workspace.
-- ---------------------------------------------------------------------------

/*
  `on conflict do nothing` matters more than it looks: a customer who has
  already set their own threshold on one of these metrics must keep THEIR
  number. Overwriting a deliberate choice with our default would be the kind of
  silent change that destroys trust in the whole alerting feature.
*/
insert into alert_rules (org_id, metric_key, op, threshold, enabled)
select o.id, d.metric_key, d.op, d.threshold, true
  from organizations o
  cross join (values
    ('receivables', '>', 500000),
    ('risk',        '>', 60),
    ('cash',        '<', 30)
  ) as d(metric_key, op, threshold)
on conflict (org_id, metric_key, op) do nothing;

-- ---------------------------------------------------------------------------
-- 3. And for every workspace created from now on.
-- ---------------------------------------------------------------------------

/*
  A trigger rather than application code, for the same reason
  2026_default_weekly_brief.sql uses one: organizations rows are created from
  more than one path (the signup trigger, ensureWorkspace, and by hand during
  support), and a default that depends on which path you came through is a
  default that is missing for somebody.
*/
create or replace function cortex_seed_default_alert_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into alert_rules (org_id, metric_key, op, threshold, enabled)
  values (new.id, 'receivables', '>', 500000, true),
         (new.id, 'risk',        '>', 60,     true),
         (new.id, 'cash',        '<', 30,     true)
  on conflict (org_id, metric_key, op) do nothing;
  return new;
exception when others then
  /* Never let alerting setup block workspace creation. A workspace with no
     default rules is a degraded product; a signup that fails is no product. */
  return new;
end $$;

drop trigger if exists trg_seed_default_alert_rules on organizations;
create trigger trg_seed_default_alert_rules
  after insert on organizations
  for each row execute function cortex_seed_default_alert_rules();

revoke all on function cortex_seed_default_alert_rules() from public, anon, authenticated;
