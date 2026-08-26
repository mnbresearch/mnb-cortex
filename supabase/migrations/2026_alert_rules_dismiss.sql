-- ============================================================
-- MNB CORTEX — separate "the system resolved it" from "I acknowledged it".
-- Safe to run more than once (idempotent).
--
-- `is_read` was doing two jobs at once, and they conflict:
--
--   * recomputeMetrics sets is_read = true when a rule stops being breached,
--     meaning "this is no longer true";
--   * the Dismiss button set is_read = true meaning "I have seen this".
--
-- The dedupe then reads only is_read = false rows to decide what is already
-- open. So dismissing an alert for a rule that is STILL breached removed it
-- from that set, and the very next save re-inserted it. To the owner it looked
-- exactly like the dismiss button was broken — and with getAlerts now filtering
-- to unread, there was no history to explain the resurrection.
--
-- dismissed_at records the human acknowledgement. A dismissed alert stays
-- suppressed until the rule actually recovers and breaches again.
-- ============================================================

alter table alerts
  add column if not exists dismissed_at timestamptz;

-- One OPEN alert per rule, enforced by the database rather than by a
-- read-then-insert that two concurrent saves can both win.
create unique index if not exists uniq_open_alert_per_rule
  on alerts (org_id, rule_id)
  where rule_id is not null and is_read = false;

-- recomputeMetrics writes health_metrics and ai_insights with
-- insert-then-delete-older. Two overlapping recomputes (two tabs, or a form
-- action racing a webhook) could otherwise leave duplicate KPI cards, or let
-- one run's delete remove the other run's fresh rows. A unique key turns the
-- duplicate case into a conflict we can handle instead of a mess on screen.
delete from health_metrics a using health_metrics b
  where a.org_id = b.org_id and a.metric_key = b.metric_key and a.ctid < b.ctid;

create unique index if not exists uniq_health_metric_per_org
  on health_metrics (org_id, metric_key);
