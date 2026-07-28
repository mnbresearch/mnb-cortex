-- v3.5.0 — AI credit metering. Safe to run more than once.

-- Balance + monthly allowance state on each workspace.
alter table organizations add column if not exists credits bigint not null default 0;
alter table organizations add column if not exists credits_allowance bigint;      -- null = use plan default
alter table organizations add column if not exists credits_reset_at timestamptz;   -- next monthly top-up

-- Every debit/credit event — the usage history + audit trail.
create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid,
  delta bigint not null,            -- negative = spend, positive = grant
  balance_after bigint,
  reason text,                      -- e.g. 'ai:report', 'topup:pack_5k', 'monthly_allowance', 'admin:add'
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_org_idx on credit_ledger(org_id, created_at desc);

-- Atomic spend. Returns the new balance, or -1 (and no change) if insufficient.
create or replace function charge_credits(p_org uuid, p_amount bigint, p_user uuid, p_reason text, p_meta jsonb)
returns bigint language plpgsql as $$
declare cur bigint; nb bigint;
begin
  select credits into cur from organizations where id = p_org for update;
  if cur is null then cur := 0; end if;
  if cur < p_amount then return -1; end if;
  nb := cur - p_amount;
  update organizations set credits = nb where id = p_org;
  insert into credit_ledger(org_id, user_id, delta, balance_after, reason, meta)
    values (p_org, p_user, -p_amount, nb, p_reason, coalesce(p_meta, '{}'::jsonb));
  return nb;
end $$;

-- Add credits (top-up, admin grant, monthly allowance). Returns the new balance.
create or replace function grant_credits(p_org uuid, p_amount bigint, p_user uuid, p_reason text, p_meta jsonb)
returns bigint language plpgsql as $$
declare cur bigint; nb bigint;
begin
  select credits into cur from organizations where id = p_org for update;
  if cur is null then cur := 0; end if;
  nb := greatest(cur + p_amount, 0);
  update organizations set credits = nb where id = p_org;
  insert into credit_ledger(org_id, user_id, delta, balance_after, reason, meta)
    values (p_org, p_user, p_amount, nb, p_reason, coalesce(p_meta, '{}'::jsonb));
  return nb;
end $$;

-- Monthly allowance top-up. Grants p_amount once per p_days window. Returns balance.
create or replace function sync_allowance(p_org uuid, p_amount bigint, p_days int)
returns bigint language plpgsql as $$
declare due boolean; cur bigint; nb bigint;
begin
  select (credits_reset_at is null or credits_reset_at < now()), credits
    into due, cur from organizations where id = p_org for update;
  if cur is null then cur := 0; end if;
  if not due then return cur; end if;
  nb := cur + p_amount;
  update organizations set credits = nb, credits_reset_at = now() + (p_days || ' days')::interval where id = p_org;
  insert into credit_ledger(org_id, delta, balance_after, reason, meta)
    values (p_org, p_amount, nb, 'monthly_allowance', '{}'::jsonb);
  return nb;
end $$;
