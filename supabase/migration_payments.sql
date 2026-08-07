-- MNB Cortex — payments idempotency ledger (idempotent & safe to re-run).
-- One row per Cashfree order. A UNIQUE index on order_id is what makes the
-- verify/webhook activation idempotent (ON CONFLICT DO NOTHING) — credits/plan
-- can never be granted twice for the same payment.
--
-- Written defensively: if a `payments` table already exists with a different
-- shape, this ADDS the missing columns instead of failing. Run in Supabase SQL.

create table if not exists payments (
  order_id text
);

alter table payments add column if not exists order_id   text;
alter table payments add column if not exists org_id     uuid;
alter table payments add column if not exists kind       text;
alter table payments add column if not exists ref        text;
alter table payments add column if not exists amount     numeric;
alter table payments add column if not exists status     text default 'paid';
alter table payments add column if not exists provider   text default 'cashfree';
alter table payments add column if not exists created_at timestamptz default now();

-- Idempotency key + lookup index.
create unique index if not exists uq_payments_order on payments(order_id);
create index if not exists idx_payments_org on payments(org_id, created_at desc);

alter table payments enable row level security;
-- No public policy: only the server (service role) reads/writes this.
