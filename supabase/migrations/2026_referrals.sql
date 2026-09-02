/*
  A referral programme that actually exists.

  WHAT WAS THERE BEFORE.

  /referrals rendered a code produced by `Math.random()` and kept in
  localStorage, a share link carrying `?ref=<that code>`, and three cards
  promising: "They start a 14-day trial — no card needed" and "When they
  subscribe, you each get a free month."

  None of it was real. Nothing in the codebase read `?ref`. There was no
  referrals table. The code was per-DEVICE, so the same owner on a phone and a
  laptop had two different ones and neither meant anything. And TRIAL_DAYS is 0
  — the app's own Terms page says there is no free trial, so the page was
  contradicting the contract the customer had already agreed to.

  WHAT THIS BUILDS.

  - A stable per-workspace `referral_code` on organizations, generated in the
    database so it is the same on every device and survives a cache clear.
  - A `referrals` table recording who referred whom, with the referred workspace
    UNIQUE: a business can be referred once, by one person, ever.
  - Reward on QUALIFICATION, not on signup. A row is created 'pending' when the
    referred workspace is created, and only becomes 'rewarded' when that
    workspace actually pays for a plan. Rewarding at signup would pay out for
    throwaway accounts, which is how referral programmes get farmed.

  WHY CREDITS AND NOT "A FREE MONTH".

  The old copy promised a free month to both sides. On the AI COO plan that is
  ₹39,999 of product given away per referral, with the cost of goods that
  implies — and this product was repriced specifically so every plan clears an
  85% margin. A free month punches a hole straight through that.

  Credits are the same gesture with a known ceiling: the reward is a fixed
  number of credits, so the maximum cost of a referral is arithmetic rather than
  a guess. The amount lives in lib/config.ts as REFERRAL_REWARD_CREDITS.
*/

-- ---------------------------------------------------------------- the code

/*
  Deliberately excludes I, O, 0 and 1. This code gets read off a phone screen
  and typed by someone else; O/0 and I/1 are where that goes wrong.
*/
create or replace function cortex_referral_code()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text;
  i int;
begin
  loop
    out := 'MNB-';
    for i in 1..6 loop
      out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    -- 32^6 ≈ 1.07 billion, but check anyway rather than rely on the odds.
    exit when not exists (select 1 from organizations where referral_code = out);
  end loop;
  return out;
end $$;

alter table organizations add column if not exists referral_code text;

-- Backfill every existing workspace, then make it unique and self-maintaining.
update organizations set referral_code = cortex_referral_code() where referral_code is null;

create unique index if not exists organizations_referral_code_key
  on organizations (referral_code) where referral_code is not null;

create or replace function cortex_set_referral_code()
returns trigger language plpgsql as $$
begin
  if NEW.referral_code is null then
    NEW.referral_code := cortex_referral_code();
  end if;
  return NEW;
end $$;

drop trigger if exists cortex_org_referral_code on organizations;
create trigger cortex_org_referral_code
  before insert on organizations
  for each row execute function cortex_set_referral_code();

-- ------------------------------------------------------------- the ledger

create table if not exists referrals (
  id              uuid primary key default gen_random_uuid(),
  referrer_org_id uuid not null references organizations(id) on delete cascade,
  /*
    UNIQUE, and the whole point of the table. One workspace can only ever be
    the *referred* party once — otherwise a referred business that churns and
    re-signs pays out again, and self-referral loops become farmable.
  */
  referred_org_id uuid not null unique references organizations(id) on delete cascade,
  code            text not null,
  status          text not null default 'pending',   -- pending | rewarded | rejected
  reward_credits  bigint not null default 0,
  created_at      timestamptz not null default now(),
  rewarded_at     timestamptz,
  /* A workspace cannot refer itself. */
  constraint referrals_no_self check (referrer_org_id <> referred_org_id)
);

create index if not exists referrals_referrer_idx on referrals (referrer_org_id, created_at desc);

alter table referrals enable row level security;

/*
  Read-only to the app, both sides. Rows are written exclusively by the
  service-role paths (workspace bootstrap and the payment settlement), the same
  way credits and plans are — see 2026_org_billing_guard.sql for why anything
  that awards value must be out of reach of the `authenticated` role.

  No INSERT/UPDATE/DELETE policy is defined, so PostgREST refuses all three for
  anon and authenticated. That is intentional and is the security control here,
  not an oversight.
*/
drop policy if exists "see own referrals" on referrals;
create policy "see own referrals" on referrals for select
  using (
    referrer_org_id in (select user_org_ids())
    or referred_org_id in (select user_org_ids())
  );

-- --------------------------------------------------------------- the payout

/*
  Records the referral and pays BOTH sides, atomically, exactly once.

  Called from the payment settlement path (service_role) the moment a referred
  workspace's plan goes active. Safe to call on every payment: it returns 0
  unless there is a row still 'pending', so a webhook retry — or a customer
  renewing next month — cannot pay a second time.
*/
create or replace function cortex_reward_referral(p_referred uuid, p_credits bigint)
returns bigint language plpgsql as $$
declare
  r referrals%rowtype;
begin
  /*
    FOR UPDATE, and the status re-checked inside the lock. Cashfree can deliver
    the same webhook twice concurrently; without this both transactions read
    'pending' and both pay.
  */
  select * into r from referrals
    where referred_org_id = p_referred and status = 'pending'
    for update skip locked;

  if not found then
    return 0;
  end if;

  update referrals
     set status = 'rewarded', rewarded_at = now(), reward_credits = p_credits
   where id = r.id;

  -- Both sides, through the existing audited ledger function.
  perform grant_credits(r.referrer_org_id, p_credits, null,
                        'referral_reward', jsonb_build_object('referred_org', p_referred, 'code', r.code));
  perform grant_credits(p_referred,        p_credits, null,
                        'referral_bonus',  jsonb_build_object('referrer_org', r.referrer_org_id, 'code', r.code));

  return p_credits;
end $$;

/* Value-granting functions are service-role only, exactly like grant_credits. */
revoke all on function cortex_reward_referral(uuid, bigint) from public, anon, authenticated;
revoke all on function cortex_referral_code() from public, anon, authenticated;
