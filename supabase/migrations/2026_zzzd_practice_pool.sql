/* ===========================================================================
   PRACTICE CREDIT POOLING — one firm's allowance, spendable in its clients.

   WHAT WAS SOLD AND WHAT EXISTED

   The Practice plan lists "Up to 25 client workspaces" immediately above
   "27,750 AI credits / month". A CA firm reads one budget across twenty-five
   businesses. The code charged credits strictly against the workspace the
   action happened in (lib/credits.ts -> charge_credits(p_org => current org)),
   so a partner opening a client workspace and asking Cortex a question was
   refused for want of credits that client had never been given. config.ts
   asserts "The credit allowance is POOLED across clients" in a comment — the
   intent was always pooling; only this was missing.

   THE DANGEROUS PART, AND WHERE THE CONTROL LIVES

   "Charge another workspace's balance" is the single most abusable sentence
   that could be added to this product. The naive version — a column a
   workspace can set on itself — is a one-line exploit: sign up, point at a
   large paying firm, spend their month.

   So the direction of the claim is inverted and enforced in Postgres:

     - The column sits on the CLIENT row, and the client cannot write it.
     - Only cortex_practice_claim() writes it, and that function proves, for
       the CALLING USER: owner-or-admin rank in the firm, and membership of the
       client. Both. In the same transaction as the write.
     - The firm must be on a pooling plan and under its client cap.

   RLS alone is not sufficient here, which is why this is a SECURITY DEFINER
   function rather than a policy: the check spans two organizations and the
   caller legitimately has rights in both, so "can this user write this row"
   is the wrong question. The right one is "is this user an ADMIN of the firm
   that is claiming, and a member of the claimed" — and that needs both rows.

   Safe to run, and safe to run twice.
   =========================================================================== */

/* ------------------------------------------------------------------ column */

/*
  `on delete set null`, not cascade. Deleting a firm must orphan the link, not
  the client: the client workspace is a real business with its own data and
  must survive its accountant closing an account. After this it simply pays
  for itself again — see resolvePayer()'s fail-safe direction.
*/
alter table organizations
  add column if not exists practice_org_id uuid references organizations(id) on delete set null;

/*
  A workspace may not pool to itself. Cheap to state, and it removes the
  degenerate case from every reader — including the one place that would
  otherwise read the same row twice in one charge.
*/
do $$
begin
  alter table organizations add constraint organizations_pool_not_self
    check (practice_org_id is null or practice_org_id <> id);
exception when duplicate_object then null;
end $$;

/* The firm's own query: "which workspaces draw on me". */
create index if not exists idx_org_practice_pool on organizations(practice_org_id)
  where practice_org_id is not null;

/* ------------------------------------------------------------- claim/release */

/*
  Claim a client workspace into the firm's credit pool.

  Returns a short text outcome rather than raising, because every failure here
  is a thing the firm's UI has to explain — "you are not an admin of this
  firm", "you are not a member of that workspace", "you are at your limit of
  25" — and an exception would collapse all of them into one red box.
*/
create or replace function cortex_practice_claim(p_firm uuid, p_client uuid, p_limit int default 25)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_rank   text;
  v_plan   text;
  v_count  int;
begin
  if v_user is null then return 'not-signed-in'; end if;
  if p_firm is null or p_client is null then return 'missing-argument'; end if;
  if p_firm = p_client then return 'cannot-claim-self'; end if;

  /*
    RANK IN THE FIRM. This is the control that makes the whole feature safe:
    the caller must be an owner or admin of the workspace whose money is about
    to be spent. A plain member of the firm cannot enlist clients against it.
  */
  select role into v_rank from memberships
   where org_id = p_firm and user_id = v_user limit 1;
  if v_rank is null then return 'not-a-member-of-firm'; end if;
  if v_rank not in ('owner', 'admin') then return 'insufficient-rank'; end if;

  /*
    MEMBERSHIP OF THE CLIENT. Without this a firm could claim any workspace
    whose uuid it could guess or observe — which would be the same exploit
    wearing the firm's hat instead of the client's.
  */
  if not exists (select 1 from memberships where org_id = p_client and user_id = v_user) then
    return 'not-a-member-of-client';
  end if;

  /* The firm must actually be on a plan that pools. Mirrors POOLING_PLANS in
     lib/credit-pool.ts; the two are pinned by scripts/test-credit-pool.mjs. */
  select lower(coalesce(plan, '')) into v_plan from organizations where id = p_firm;
  if v_plan is null then return 'firm-not-found'; end if;
  if v_plan not in ('practice', 'enterprise') then return 'firm-plan-has-no-pooling'; end if;

  /* The cap the pricing page advertises, enforced where it cannot be bypassed.
     -1 means negotiated/unlimited (enterprise). */
  if p_limit >= 0 then
    select count(*) into v_count from organizations
     where practice_org_id = p_firm and id <> p_client;
    if v_count >= p_limit then return 'client-limit-reached'; end if;
  end if;

  update organizations set practice_org_id = p_firm where id = p_client;
  return 'ok';
end $$;

/*
  Release a client from the pool.

  Deliberately more permissive than claiming: an admin of EITHER side may
  break the link. A client business that parts ways with its accountant must
  be able to stop them seeing its spend without needing their cooperation, and
  the consequence of releasing is only that the workspace pays for itself.
  Asymmetric on purpose — the dangerous direction is attaching, not detaching.
*/
create or replace function cortex_practice_release(p_client uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_firm uuid;
  v_rank text;
begin
  if v_user is null then return 'not-signed-in'; end if;
  select practice_org_id into v_firm from organizations where id = p_client;
  if v_firm is null then return 'not-pooled'; end if;

  select role into v_rank from memberships
   where org_id = p_client and user_id = v_user limit 1;
  if v_rank in ('owner', 'admin') then
    update organizations set practice_org_id = null where id = p_client;
    return 'ok';
  end if;

  select role into v_rank from memberships
   where org_id = v_firm and user_id = v_user limit 1;
  if v_rank in ('owner', 'admin') then
    update organizations set practice_org_id = null where id = p_client;
    return 'ok';
  end if;

  return 'insufficient-rank';
end $$;

/*
  Granted to `authenticated` — both functions authenticate the caller
  THEMSELVES via auth.uid() and the membership checks above, which is the
  pattern cortex_definer_audit() recognises as acceptable ("checks membership
  itself"). anon has no auth.uid() and would fall at the first line, but it is
  revoked regardless: a function that can move money should never be one
  `revoke` away from being reachable.
*/
revoke all on function cortex_practice_claim(uuid, uuid, int)   from public, anon;
revoke all on function cortex_practice_release(uuid)            from public, anon;
grant execute on function cortex_practice_claim(uuid, uuid, int) to authenticated, service_role;
grant execute on function cortex_practice_release(uuid)          to authenticated, service_role;

/* ---------------------------------------------------------------- verify ---
   Expect: column present, constraint present, both functions present, and
   ZERO rows from the reachability check.
   -------------------------------------------------------------------------- */
select
  case when exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='organizations'
                       and column_name='practice_org_id') then 'ok' else 'MISSING' end as pool_column,
  case when exists (select 1 from pg_constraint where conname='organizations_pool_not_self')
       then 'ok' else 'MISSING' end as self_link_blocked,
  case when to_regprocedure('public.cortex_practice_claim(uuid,uuid,int)') is not null
       then 'ok' else 'MISSING' end as claim_fn,
  case when to_regprocedure('public.cortex_practice_release(uuid)') is not null
       then 'ok' else 'MISSING' end as release_fn;

select p.proname as reachable_by_anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('cortex_practice_claim', 'cortex_practice_release')
   and has_function_privilege('anon', p.oid, 'execute');
