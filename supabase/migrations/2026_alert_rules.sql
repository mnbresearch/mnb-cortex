-- ============================================================
-- MNB CORTEX — alert rules that actually fire.
-- Safe to run more than once (idempotent).
--
-- The page is titled "KPI Alerts — Get warned the moment a number crosses your
-- line". Until now the rules lived in localStorage:
--
--   * they vanished when the owner opened Cortex on their phone,
--   * a teammate could not see or edit them,
--   * and nothing server-side ever evaluated them, so NO ALERT EVER FIRED.
--
-- The only way to see a "breach" was to have the page open in a browser that
-- happened to hold the rule. The subtitle was an unimplemented promise.
--
-- Rules now live with the workspace and are evaluated inside recomputeMetrics,
-- which already runs after every write — so a breach is detected at the moment
-- the number changes, not the next time somebody opens a tab.
-- ============================================================

create table if not exists alert_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  metric_key  text not null,          -- matches health_metrics.metric_key
  op          text not null default '<' check (op in ('<', '>')),
  threshold   numeric not null default 0,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_alert_rules_org on alert_rules(org_id);

-- One rule per metric per direction. Without this, clicking "Add rule" twice
-- gives two identical rules and therefore two identical alerts every time the
-- number moves.
create unique index if not exists uniq_alert_rule
  on alert_rules (org_id, metric_key, op);

alter table alert_rules enable row level security;

-- Same tenancy shape as the rest of the app: members of the org, and nobody
-- else. Written as separate policies so a viewer can SEE the rules that are
-- watching their numbers without being able to change them.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'alert_rules' and policyname = 'alert_rules_select') then
    create policy alert_rules_select on alert_rules for select
      using (org_id in (select org_id from memberships where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'alert_rules' and policyname = 'alert_rules_write') then
    create policy alert_rules_write on alert_rules for all
      using (org_id in (select org_id from memberships where user_id = auth.uid()
                        and role in ('analyst','manager','admin','owner')))
      with check (org_id in (select org_id from memberships where user_id = auth.uid()
                        and role in ('analyst','manager','admin','owner')));
  end if;
end $$;

-- Which rule produced an alert. Needed so a rule that is still breached does
-- not create a fresh row on every single save — one open alert per rule.
alter table alerts
  add column if not exists rule_id uuid;

create index if not exists idx_alerts_org_rule on alerts (org_id, rule_id) where rule_id is not null;
create index if not exists idx_alerts_org_created on alerts (org_id, created_at desc);
