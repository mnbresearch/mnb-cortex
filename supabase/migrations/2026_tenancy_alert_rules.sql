-- ============================================================
-- MNB CORTEX — make alert_rules use the same tenancy helpers as every
-- other tenant table. Safe to run more than once (idempotent).
--
-- 2026_alert_rules.sql wrote its own policies:
--
--   using (org_id in (select org_id from memberships where user_id = auth.uid()
--                     and role in ('analyst','manager','admin','owner')))
--
-- That works, but it is wrong in three ways that matter:
--
-- 1. IT DUPLICATES AN AUTHORISATION RULE. user_org_rank() already encodes the
--    viewer/analyst/manager/admin/owner ladder, and 2026_tenancy.sql's own
--    comment makes the point: two copies of an authorisation rule is how one of
--    them ends up wrong. Add a role tomorrow and this table silently disagrees
--    with the other twenty.
--
-- 2. IT READS memberships FROM INSIDE A POLICY, so every query on alert_rules
--    triggers memberships' own RLS evaluation — including "admins manage
--    members", which calls user_org_rank anyway. It is the slower path to the
--    same answer, on a table read during every recomputeMetrics.
--
-- 3. IT IS A SINGLE `for all` POLICY, so read and write share one rule. Every
--    other tenant table deliberately splits them: a VIEWER can see everything
--    and change nothing. Under the old policy a viewer could not even see the
--    rules that are watching their numbers.
--
-- Matching the house pattern exactly:
--   SELECT  any member                 (viewers included)
--   INSERT  user_org_rank >= 2         (analyst and above)
--   UPDATE  user_org_rank >= 2
--   DELETE  user_org_rank >= 3         (manager and above)
--
-- The delete threshold is why clearDemoData now requires manager: RLS filters a
-- disallowed delete to zero rows and returns success, so a mismatch here is
-- silent rather than loud.
-- ============================================================

drop policy if exists alert_rules_select on alert_rules;
drop policy if exists alert_rules_write  on alert_rules;

create policy "tenant read alert_rules" on alert_rules for select
  using (org_id in (select user_org_ids()));

create policy "tenant insert alert_rules" on alert_rules for insert
  with check (user_org_rank(org_id) >= 2);

create policy "tenant update alert_rules" on alert_rules for update
  using (user_org_rank(org_id) >= 2)
  with check (user_org_rank(org_id) >= 2);

create policy "tenant delete alert_rules" on alert_rules for delete
  using (user_org_rank(org_id) >= 3);
