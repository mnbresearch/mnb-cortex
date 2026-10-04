/*
  DECISION DIGEST — the claim column for action_proposals.

  The daily "needs your decision" email (src/lib/engine/decision-digest.ts)
  stamps notified_at BEFORE sending and releases it if the send fails, exactly
  as alerts.notified_at works for alert delivery. Without this column the
  digest does nothing at all (it refuses to run rather than risk re-sending
  the same proposals every night).

  Re-runnable. Ends with the PostgREST schema reload, as every migration here
  does since 2026_zzzq.
*/
alter table action_proposals add column if not exists notified_at timestamptz;

create index if not exists idx_action_proposals_pending_unnotified
  on action_proposals(org_id, created_at)
  where status = 'proposed' and notified_at is null;

notify pgrst, 'reload schema';

/* verify: expect one row */
select column_name from information_schema.columns
 where table_name = 'action_proposals' and column_name = 'notified_at';
