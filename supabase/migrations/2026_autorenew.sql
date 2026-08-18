-- ============================================================
-- MNB CORTEX — auto-renewal (Cashfree subscription mandates)
-- Safe to run more than once (idempotent).
--
-- Plans were one-off orders: 30 days later the workspace locked and the
-- customer had to remember to pay again. A mandate is authorised ONCE and each
-- cycle is debited automatically, which removes the single biggest churn risk.
-- ============================================================

alter table organizations add column if not exists subscription_ref    text;   -- Cashfree subscription_id
alter table organizations add column if not exists autorenew_status    text;   -- INITIALIZED | ACTIVE | ON_HOLD | CANCELLED
alter table organizations add column if not exists autorenew_next      timestamptz;

create index if not exists organizations_subref_idx
  on organizations (subscription_ref) where subscription_ref is not null;
