/*
  ============================================================================
  RUN THIS. It closes a live hole through which one workspace can spend
  another organisation's money.
  ============================================================================

  Paste the whole file into the Supabase SQL editor and run it. It is
  idempotent — running it twice does nothing the second time. The last
  statement returns one row; all four columns must be true.

  ----------------------------------------------------------------------------
  WHAT IS OPEN RIGHT NOW
  ----------------------------------------------------------------------------

  organizations.practice_org_id names the CA firm whose pooled credits pay for
  everything that happens in a client workspace, and whose plan decides whether
  that workspace is unlocked at all.

  src/lib/credit-pool.ts says, in its own header, that only the firm can write
  it. Nothing enforces that:

    · 2026_tenancy.sql lets anyone with rank >= 4 UPDATE their own
      organizations row, and every signup is the owner (rank 5) of the
      workspace it creates.
    · cortex_guard_org_billing() — the trigger that is therefore the only
      column-level control — was written before this column existed and does
      not list it.

  So this succeeds today, with nothing but the public anon key and the
  attacker's own session:

      PATCH /rest/v1/organizations?id=eq.<their-own-org>
      { "practice_org_id": "<a Practice firm's uuid>" }

  and from that moment every AI action in their workspace is debited from that
  firm's 27,750-credit monthly pool (Veo video included, at roughly ₹77 a
  clip), their unpaid workspace is treated as entitled by the firm's plan, and
  their own usage screen reports the FIRM's credit balance.

  The firm's uuid is not a secret to the people most likely to use this: any
  current or former pooled client can read it off its own row.

  Two smaller things ride along, both in the same area:

    · cortex_practice_claim() reads the 25-client cap from a parameter the
      caller sends, so a browser can call it with p_limit = -1 and put
      unlimited clients on one ₹29,999/mo subscription.
    · referral_code is likewise unguarded; it is the key another org's
      referral reward is attributed by, and no legitimate UI writes it.

  ----------------------------------------------------------------------------
  WHAT THIS CHANGES
  ----------------------------------------------------------------------------

  Two `create or replace function` statements. No table is altered, no data is
  moved, nothing is dropped.

    1. cortex_guard_org_billing() — adds practice_org_id and referral_code to
       the protected list.
    2. cortex_practice_claim() — derives the client cap from the firm's plan
       instead of trusting the argument. The argument still works and can only
       make the cap stricter.

  WILL THIS BREAK THE PRACTICE FEATURE? No, and it is tested rather than
  assumed. cortex_practice_claim and cortex_practice_release are both SECURITY
  DEFINER, so inside them current_user is the function owner and the guard's
  first test lets them through. scripts/test-billing-guard.mjs now performs
  both the attack and the legitimate claim against a real Postgres.

  WILL IT BREAK WORKSPACE SETTINGS? No. The only places the app updates this
  table with the USER's client are api/workspace/industry and
  actions.ts:updateOrgProfile (name, industry, annual_revenue_cr, currency,
  accent, logo_url). None of those touches a protected column.

  After this runs, /api/health stops reporting these two as unapplied.
*/

-- ===========================================================================
-- 1. The guard, widened.
-- ===========================================================================

create or replace function cortex_guard_org_billing()
returns trigger
language plpgsql
/*
  SECURITY INVOKER (the default), deliberately. Written as SECURITY DEFINER
  this silently disables itself: inside a definer function current_user is the
  owner, so the `not in ('authenticated','anon')` test passes for everybody.
  That mistake was made once already on this trigger; see
  2026_org_billing_guard.sql.
*/
set search_path = public
as $$
declare
  protected constant text[] := array[
    'credits',
    'credits_allowance',
    'credits_reset_at',
    'plan',
    'subscription_status',
    'subscription_ends_at',
    'subscription_cycle',
    'subscription_ref',
    'trial_ends_at',
    'autorenew_status',
    'autorenew_next',
    'practice_org_id',      -- whose credits pay, and whose plan entitles
    'referral_code'         -- the key another org's reward is attributed by
  ];
  col       text;
  old_json  jsonb := to_jsonb(OLD);
  new_json  jsonb := to_jsonb(NEW);
begin
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  foreach col in array protected loop
    if (old_json -> col) is distinct from (new_json -> col) then
      raise exception
        'column "%" on organizations is billing-controlled and cannot be changed by role "%"',
        col, current_user
        using errcode = '42501';
    end if;
  end loop;

  return NEW;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'cortex_org_billing_guard'
       and tgrelid = 'public.organizations'::regclass
  ) then
    create trigger cortex_org_billing_guard
      before update on organizations
      for each row execute function cortex_guard_org_billing();
  end if;
end $$;

-- ===========================================================================
-- 2. The client cap, moved off the caller's parameter.
-- ===========================================================================

create or replace function cortex_practice_claim(p_firm uuid, p_client uuid, p_limit int default 25)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_rank       text;
  v_plan       text;
  v_count      int;
  v_plan_limit int;
  v_limit      int;
begin
  if v_user is null then return 'not-signed-in'; end if;
  if p_firm is null or p_client is null then return 'missing-argument'; end if;
  if p_firm = p_client then return 'cannot-claim-self'; end if;

  select role into v_rank from memberships
   where org_id = p_firm and user_id = v_user limit 1;
  if v_rank is null then return 'not-a-member-of-firm'; end if;
  if v_rank not in ('owner', 'admin') then return 'insufficient-rank'; end if;

  if not exists (select 1 from memberships where org_id = p_client and user_id = v_user) then
    return 'not-a-member-of-client';
  end if;

  select lower(coalesce(plan, '')) into v_plan from organizations where id = p_firm;
  if v_plan is null then return 'firm-not-found'; end if;
  if v_plan not in ('practice', 'enterprise') then return 'firm-plan-has-no-pooling'; end if;

  /* Mirrors PRACTICE_CLIENTS in src/lib/config.ts. Anything unlisted gets 0,
     so a new pooling plan fails loudly rather than pooling without a ceiling. */
  v_plan_limit := case v_plan
                    when 'practice'   then 25
                    when 'enterprise' then -1
                    else 0
                  end;

  if v_plan_limit < 0 then
    v_limit := case when p_limit is null or p_limit < 0 then -1 else p_limit end;
  else
    v_limit := case when p_limit is null or p_limit < 0 then v_plan_limit
                    else least(p_limit, v_plan_limit) end;
  end if;

  if v_limit >= 0 then
    select count(*) into v_count from organizations
     where practice_org_id = p_firm and id <> p_client;
    if v_count >= v_limit then return 'client-limit-reached'; end if;
  end if;

  update organizations set practice_org_id = p_firm where id = p_client;
  return 'ok';
end $$;


/*
  TELL POSTGREST THE SCHEMA CHANGED.

  Supabase's API layer (PostgREST) keeps its own cache of which functions
  exist. DDL run in the SQL editor does not always invalidate it. Without this
  line a function created above can be present in pg_proc and still return
  PGRST202 "not found in the schema cache" to the app — which /api/health then
  reports as NOT INSTALLED, and an operator who has just run this file is told
  to run it again. That exact loop happened on 4 October.
*/
notify pgrst, 'reload schema';

-- ===========================================================================
-- 3. VERIFY. One row. All four columns must be true.
-- ===========================================================================
/*
  Each of the first three reads the function body Postgres actually holds, so
  only the replacements above can satisfy them — not a version table someone
  has to remember to bump.

  If any column is false, STOP and re-run: the hole is still open.
*/
select
  (select prosrc like '%practice_org_id%' from pg_proc
    where proname = 'cortex_guard_org_billing' limit 1)  as practice_link_protected,
  (select prosrc like '%referral_code%' from pg_proc
    where proname = 'cortex_guard_org_billing' limit 1)  as referral_code_protected,
  (select prosrc like '%v_plan_limit%' from pg_proc
    where proname = 'cortex_practice_claim' limit 1)     as client_cap_server_side,
  cortex_has_billing_guard()                             as trigger_installed;
