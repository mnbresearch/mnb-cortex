-- =====================================================================
-- MNB CORTEX — migrations to apply, 5 September 2026
--
-- Paste this WHOLE file into the Supabase SQL editor and run it once.
--
-- Order matters and is already correct below. Every section is
-- idempotent — re-running one that has already been applied is a no-op,
-- so it is safe to run this even if you are unsure what you ran before.
--
-- The FIRST section is the urgent one: until it runs, anyone holding the
-- public anon key (which ships in the browser bundle) can overwrite any
-- workspace's dashboard, invoices and ledger with no account at all.
--
-- If a section fails, everything before it has still applied. Send me the
-- error and the section name.
-- =====================================================================



-- =====================================================================
-- SECTION 1/10 — 2026_seed_rpc_lockdown.sql
-- =====================================================================

/*
  CRITICAL — unauthenticated cross-tenant write. Run this before anything else.

  THE HOLE.

  `seed_demo_data(p_org uuid)` is SECURITY DEFINER, takes the target workspace
  as a PARAMETER, and never checks that the caller belongs to it. Postgres
  grants EXECUTE on a new function to PUBLIC, and both `anon` and
  `authenticated` are members of PUBLIC — so PostgREST exposed it at
  /rest/v1/rpc/seed_demo_data to anyone holding the anon key, which ships in
  the browser bundle of every page we serve.

      POST /rest/v1/rpc/seed_demo_data
      apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
      {"p_org": "<any org uuid>"}

  No account. No membership. The function then runs fifteen DELETEs and fifteen
  INSERTs against that workspace's health_metrics, finance_ledger, invoices,
  sales_orders, purchase_orders, employees and alerts. health_metrics IS the
  dashboard, so an attacker chooses what a stranger's business appears to be
  worth. This is a financial system of record.

  Reproduced in Postgres before writing this: as role `anon`, with no
  membership row of any kind, a victim's revenue metric went from ₹42,50,000 to
  a value chosen by the caller.

  `seed_demo_customers` has the identical shape. It was revoked from `public`
  but re-granted to `authenticated`, so there the bar is merely "have signed
  up" — thirty seconds and a throwaway address.

  WHY IT WAS MISSED.

  2026_hardening.sql locked down the money-moving RPCs and explicitly exempted
  four functions on the grounds that they "ARE called with the anon/user client
  and do their own key/RLS checks". True of api_ingest (checks an API key) and
  public_report (checks a share token). NOT true of seed_demo_data, which
  checks nothing. The same reasoning error was caught and fixed for
  cortex_aggregate in 2026_tenancy_aggregate.sql; this one was left behind.

  SECURITY DEFINER is precisely why RLS does not save us here: definer rights
  bypass the row policies that would otherwise scope these tables.

  THE FIX, AND WHY IT IS SHAPED THIS WAY.

  The app calls both functions with the SIGNED-IN USER'S own client
  (src/lib/actions.ts:50 and :70), not the service role. So revoking to
  service-role-only would break sample data for every customer. `authenticated`
  has to keep EXECUTE, which means the grant cannot be the control — the
  membership check inside the function has to be.

  Rather than restate thirty DELETE/INSERT statements here and risk them
  drifting from supabase/seed.sql, the existing function is RENAMED to
  `seed_demo_rows` (body preserved byte for byte) and a thin guarded wrapper
  takes its place. The inner function is service-role only, so the guard cannot
  be stepped around by calling it directly.

  `>= 2` is the write rank the tenant RLS policies already use: a `viewer` must
  not be able to overwrite a workspace's numbers either.
*/

-- ---------------------------------------------------------------------------
-- 1. seed_demo_data
-- ---------------------------------------------------------------------------

do $$
declare
  src text;
begin
  select p.prosrc into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seed_demo_data'
     and pg_get_function_identity_arguments(p.oid) = 'p_org uuid';

  if src is null then
    raise notice 'seed_demo_data(uuid) not present — nothing to lock down';
    return;
  end if;

  /*
    IDEMPOTENCY. If the guard is already in place this migration has run, and
    renaming again would move the WRAPPER out of the way and leave the hole
    open — the migration would break the thing it exists to fix on its second
    run. Detect and stop.
  */
  if position('user_org_rank' in src) > 0 then
    raise notice 'seed_demo_data already guarded — skipping';
    return;
  end if;

  execute 'alter function public.seed_demo_data(uuid) rename to seed_demo_rows';
  execute 'revoke all on function public.seed_demo_rows(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.seed_demo_rows(uuid) to service_role';

  execute $fn$
    create function public.seed_demo_data(p_org uuid)
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $body$
    begin
      /*
        THE CHECK THAT WAS MISSING.

        user_org_rank() reads auth.uid(), which PostgREST sets from the
        caller's JWT. Role `anon` has no JWT and no membership, so this raises
        and the attack stops here. It runs FIRST, before any DELETE, so a
        rejected call cannot destroy anything on its way out.
      */
      if p_org is null or coalesce(user_org_rank(p_org), 0) < 2 then
        raise exception 'seed_demo_data: not a member of workspace %', p_org
          using errcode = '42501';
      end if;
      perform public.seed_demo_rows(p_org);
    end
    $body$;
  $fn$;

  execute 'revoke all on function public.seed_demo_data(uuid) from public, anon';
  execute 'grant execute on function public.seed_demo_data(uuid) to authenticated, service_role';
end $$;

-- ---------------------------------------------------------------------------
-- 2. seed_demo_customers — same shape, same fix
-- ---------------------------------------------------------------------------

do $$
declare
  src text;
begin
  select p.prosrc into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'seed_demo_customers'
     and pg_get_function_identity_arguments(p.oid) = 'p_org uuid';

  if src is null then
    raise notice 'seed_demo_customers(uuid) not present — nothing to lock down';
    return;
  end if;
  if position('user_org_rank' in src) > 0 then
    raise notice 'seed_demo_customers already guarded — skipping';
    return;
  end if;

  execute 'alter function public.seed_demo_customers(uuid) rename to seed_demo_customer_rows';
  execute 'revoke all on function public.seed_demo_customer_rows(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.seed_demo_customer_rows(uuid) to service_role';

  execute $fn$
    create function public.seed_demo_customers(p_org uuid)
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $body$
    begin
      if p_org is null or coalesce(user_org_rank(p_org), 0) < 2 then
        raise exception 'seed_demo_customers: not a member of workspace %', p_org
          using errcode = '42501';
      end if;
      perform public.seed_demo_customer_rows(p_org);
    end
    $body$;
  $fn$;

  execute 'revoke all on function public.seed_demo_customers(uuid) from public, anon';
  execute 'grant execute on function public.seed_demo_customers(uuid) to authenticated, service_role';
end $$;

/*
  ---------------------------------------------------------------------------
  3. A standing report, so this CLASS of bug is visible rather than waiting for
     the next auditor.

  Every SECURITY DEFINER function taking an org id as its first argument is by
  construction a potential cross-tenant hole: definer rights bypass RLS, so the
  only thing between a caller and someone else's data is a check the author
  remembered to write. This lists the ones reachable by anon or authenticated.

  Deliberately a report and not an assertion. Several are legitimate —
  api_ingest authenticates with an API key, public_report with a share token —
  and a migration that refused to apply because of them would simply be
  deleted by whoever hit it.
*/
/*
  DROP first, for the same reason 2026_msme_exposure_fix.sql does: `create or
  replace` cannot change a `returns table` signature, and 2026_definer_grant_sweep
  later redefines this function with a different third column. Without the drop,
  re-running the two migrations in sequence fails on "cannot change return type
  of existing function" — which is exactly the kind of half-applied migration
  that leaves a database in a state nobody can reason about.
*/
drop function if exists public.cortex_definer_audit();

create function public.cortex_definer_audit()
returns table (function_name text, granted_to text, has_membership_check boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select p.proname::text,
         string_agg(distinct r.rolname, ', ' order by r.rolname)::text,
         (position('user_org_rank' in p.prosrc) > 0
          or position('user_org_ids' in p.prosrc) > 0)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('authenticated')) as r(rolname)
    join pg_roles a on a.rolname = r.rolname
   where n.nspname = 'public'
     and p.prosecdef
     and p.pronargs > 0
     and (p.proargtypes::oid[])[0] = 'uuid'::regtype
     and has_function_privilege(a.oid, p.oid, 'execute')
   group by p.proname, p.prosrc
   order by 3, 1
$$;

revoke all on function public.cortex_definer_audit() from public, anon, authenticated;
grant execute on function public.cortex_definer_audit() to service_role;


-- =====================================================================
-- SECTION 2/10 — 2026_rls_privilege_fix.sql
-- =====================================================================

/*
  Three privilege holes in the tenant RLS policies.

  The common cause: 2026_tenancy.sql applies one generic policy set to a list of
  thirty-odd tables — read for members, write for rank >= 2 (analyst). That is
  the right default for `invoices` and `sales_orders`. It is the wrong default
  for the three tables below, where a row IS a permission, and where "analyst
  can insert" therefore means "analyst can grant themselves anything".

  RLS constrains WHICH ROWS you may write, never WHICH COLUMNS. A policy that
  only pins org_id lets the caller choose every other value in the row. That is
  the whole of holes 1 and 2.

  And none of this is reachable only through our UI: PostgREST exposes these
  tables directly at /rest/v1/<table> to anyone holding the anon key, which
  ships in the browser bundle. Server-side checks in actions.ts are simply not
  in the path.
*/

-- ---------------------------------------------------------------------------
-- 1. PRIVILEGE ESCALATION: analyst -> owner, by inserting an invite
-- ---------------------------------------------------------------------------

/*
  `invites` was in the generic list, so it got:

      for insert with check (user_org_rank(org_id) >= 2)

  which constrains org_id and says nothing about `role`. The app requires admin
  (actions.ts requireRole("admin")), but PostgREST does not go through the app:

      POST /rest/v1/invites
      {"org_id":"<my own org>","email":"me2@x.com","role":"owner","status":"pending"}

  Sign in as me2@x.com, and claimInvites() trusts inv.role verbatim and writes
  a membership with role 'owner'. A read-mostly analyst now owns the workspace:
  billing, members, deletion. The role ladder this migration set exists to
  enforce is defeated by one POST.

  Fix: inviting is an ADMIN action (rank >= 4), and — separately — you may not
  invite someone to a rank above your own. The second half matters on its own:
  without it an admin (4) can mint an owner (5), which is a quieter escalation
  but the same one.
*/
do $$
begin
  if to_regclass('public.invites') is null then return; end if;

  drop policy if exists "tenant insert invites" on invites;
  create policy "tenant insert invites" on invites for insert
    with check (
      user_org_rank(org_id) >= 4
      and coalesce(
            case lower(role::text)
              when 'viewer' then 1 when 'analyst' then 2 when 'manager' then 3
              when 'admin' then 4 when 'owner' then 5 else 99
            end, 99) <= user_org_rank(org_id)
    );

  /* Updating an invite is how you would edit `role` after the fact. */
  drop policy if exists "tenant update invites" on invites;
  create policy "tenant update invites" on invites for update
    using (user_org_rank(org_id) >= 4)
    with check (
      user_org_rank(org_id) >= 4
      and coalesce(
            case lower(role::text)
              when 'viewer' then 1 when 'analyst' then 2 when 'manager' then 3
              when 'admin' then 4 when 'owner' then 5 else 99
            end, 99) <= user_org_rank(org_id)
    );

  drop policy if exists "tenant delete invites" on invites;
  create policy "tenant delete invites" on invites for delete
    using (user_org_rank(org_id) >= 4);
end $$;

/*
  The same shape one level down: "admins manage members" was
  `for all using (user_org_rank(org_id) >= 4)`, with no WITH CHECK — so an admin
  could UPDATE their own memberships row and set role = 'owner'.

  An owner may still set any role. An admin may not create or promote to owner.
*/
do $$
begin
  if to_regclass('public.memberships') is null then return; end if;

  drop policy if exists "admins manage members" on memberships;
  /* Idempotency: this migration must survive being re-run. Without these drops
     the second run fails on "policy already exists" — halfway through, leaving
     some tables fixed and others not. */
  drop policy if exists "admins read members" on memberships;
  drop policy if exists "admins write members" on memberships;
  drop policy if exists "admins update members" on memberships;
  drop policy if exists "admins remove members" on memberships;

  create policy "admins read members" on memberships for select
    using (org_id in (select user_org_ids()));

  create policy "admins write members" on memberships for insert
    with check (user_org_rank(org_id) >= 4 and (lower(role::text) <> 'owner' or user_org_rank(org_id) >= 5));

  create policy "admins update members" on memberships for update
    using (user_org_rank(org_id) >= 4)
    with check (user_org_rank(org_id) >= 4 and (lower(role::text) <> 'owner' or user_org_rank(org_id) >= 5));

  /*
    An admin must not be able to remove an OWNER.

    The insert and update policies above stop an admin promoting themselves to
    owner — but delete was left open, so the same admin could simply DELETE the
    owner's membership row instead. That leaves a workspace with no owner at
    all, and owner is the only role that can delete a workspace or change
    billing. Same escalation this migration exists to close, reached by removing
    someone rather than promoting yourself.
  */
  create policy "admins remove members" on memberships for delete
    using (
      user_org_rank(org_id) >= 4
      and (lower(role::text) <> 'owner' or user_org_rank(org_id) >= 5)
    );
end $$;

-- ---------------------------------------------------------------------------
-- 2. A `viewer` could read the API key, and write through it
-- ---------------------------------------------------------------------------

/*
  `api_keys` was in the generic list, so SELECT was open to every member:

      GET /rest/v1/api_keys?select=key

  The key is stored in plaintext (it has to be comparable on ingest), and
  api_ingest() authorises on the key ALONE. So a `viewer` — a role that exists
  precisely to deny writes, and is given to accountants, interns and clients —
  reads the key and then POSTs to /api/v1/ingest to write sales_orders,
  invoices, inventory_items, customers and leads. The read/write split is
  bypassed completely, and the resulting rows are attributed to nobody.

  The same policy exposed `webhook_endpoints.secret`, which is the HMAC signing
  secret: with it, a viewer can forge a payload that the customer's own
  receiving system will verify as genuinely from Cortex.

  Fix: reading a credential is an admin action. Everything else about these
  tables stays as it was.
*/
do $$
declare t text;
begin
  foreach t in array array['api_keys', 'webhook_endpoints'] loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "tenant read %1$s" on %1$I;', t);
    execute format($f$create policy "tenant read %1$s" on %1$I for select
      using (user_org_rank(org_id) >= 4);$f$, t);

    execute format('drop policy if exists "tenant insert %1$s" on %1$I;', t);
    execute format($f$create policy "tenant insert %1$s" on %1$I for insert
      with check (user_org_rank(org_id) >= 4);$f$, t);

    execute format('drop policy if exists "tenant update %1$s" on %1$I;', t);
    execute format($f$create policy "tenant update %1$s" on %1$I for update
      using (user_org_rank(org_id) >= 4) with check (user_org_rank(org_id) >= 4);$f$, t);

    execute format('drop policy if exists "tenant delete %1$s" on %1$I;', t);
    execute format($f$create policy "tenant delete %1$s" on %1$I for delete
      using (user_org_rank(org_id) >= 4);$f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Anonymous cross-tenant INSERT into `leads`
-- ---------------------------------------------------------------------------

/*
  migration_leads_orgid.sql created:

      create policy "anon insert leads" on leads for insert to anon with check (true);

  `with check (true)` means an anonymous caller may set org_id to ANY value.
  2026_tenant_leads.sql later tightened the `authenticated` policy and left this
  one untouched, so the hole stayed open on the role that needs no account:

      POST /rest/v1/leads {"org_id":"<victim>","name":"…","email":"…"}

  Unbounded rows of attacker-chosen text landing on a stranger's Leads screen —
  spam, phishing copy shown inside a product they trust, and unbounded storage
  growth. Our rate limiter guards Next.js routes, not PostgREST, so nothing
  slows it down.

  The public capture form legitimately needs anonymous insert — that is how a
  website visitor becomes a lead — but those rows belong to NO workspace until
  the app assigns one. `org_id is null` is exactly that rule.
*/
do $$
begin
  if to_regclass('public.leads') is null then return; end if;

  drop policy if exists "anon insert leads" on leads;
  create policy "anon insert leads" on leads for insert to anon
    with check (org_id is null);
end $$;

-- ---------------------------------------------------------------------------
-- 4. A workspace must never be left without an owner
-- ---------------------------------------------------------------------------

/*
  RLS decides row by row and cannot count what would remain, so "you may not
  remove the last owner" is not expressible as a policy. It needs a trigger.

  Two ways to reach an ownerless workspace, both real:

    an admin deletes the owner's membership   (closed by the policy above)
    the owner demotes or removes THEMSELVES   (nothing stopped this)

  The second is the likelier accident, and it is unrecoverable through the
  product: owner is the only role that can change billing or delete the
  workspace, so an ownerless workspace needs us to intervene in the database.

  Deliberately allows the case that looks similar but is fine — removing an
  owner while ANOTHER owner remains — because a two-owner business removing a
  departing founder is a normal Tuesday.
*/
create or replace function cortex_guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
  target_org uuid;
begin
  target_org := coalesce(old.org_id, new.org_id);

  /* Only care when an owner is being removed or demoted. */
  if lower(old.role::text) <> 'owner' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and lower(new.role::text) = 'owner' then return new; end if;

  select count(*) into remaining
    from memberships
   where org_id = target_org
     and lower(role::text) = 'owner'
     and user_id <> old.user_id;

  if remaining = 0 then
    raise exception
      'A workspace must have at least one owner. Make someone else an owner first, or delete the workspace from Settings.'
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_last_owner on memberships;
create trigger trg_guard_last_owner
  before update or delete on memberships
  for each row execute function cortex_guard_last_owner();

/*
  Erasure deletes every membership before dropping the org row, which would trip
  the trigger above on the last owner. lib/erasure.ts is service-role, and
  session_replication_role is not available to us on hosted Postgres — so the
  trigger explicitly stands down when the ORG ITSELF is already going away.
*/
create or replace function cortex_guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
  target_org uuid;
begin
  target_org := coalesce(old.org_id, new.org_id);

  /* The workspace is being deleted outright — there is no owner to protect. */
  if not exists (select 1 from organizations where id = target_org) then
    return coalesce(new, old);
  end if;

  if lower(old.role::text) <> 'owner' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and lower(new.role::text) = 'owner' then return new; end if;

  select count(*) into remaining
    from memberships
   where org_id = target_org
     and lower(role::text) = 'owner'
     and user_id <> old.user_id;

  if remaining = 0 then
    raise exception
      'A workspace must have at least one owner. Make someone else an owner first, or delete the workspace from Settings.'
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end $$;


-- =====================================================================
-- SECTION 3/10 — 2026_erasure_retention.sql
-- =====================================================================

/*
  Somewhere to keep the records we are legally required to keep, after the
  workspace they belonged to is gone.

  THE PROBLEM WITH THE OBVIOUS APPROACH.

  Workspace erasure anonymises financial records instead of destroying them:
  a completed payment is a tax record, Indian law requires books and vouchers to
  be retained for years, and both parties need them in a dispute or chargeback.
  Our privacy policy says exactly this, and the delete dialog repeats it.

  For `payments` that works — `org_id` is nullable, so severing the link leaves
  the row in place.

  For `subscriptions` it does NOT. That column is:

      org_id uuid not null references organizations(id) on delete cascade

  NOT NULL, so `update ... set org_id = null` cannot succeed. And the way it
  fails is the dangerous part: supabase-js RETURNS an error rather than throwing
  one, so a `try/catch` around it never fires. The update silently did nothing,
  the count was undefined, nothing was recorded — and then the org delete
  cascaded the subscription rows away entirely, while the UI told the customer
  their payment history had been retained.

  A promise that fails silently is worse than one that fails loudly, and this
  one failed silently in the direction of destroying records we had said we
  would keep.

  THE FIX.

  A table with NO foreign key to organizations, so nothing can cascade it away.
  Erasure copies into it BEFORE deleting, and refuses to proceed at all if the
  copy fails — because "we could not keep what we promised to keep" is a reason
  to stop, not to continue.

  WHAT IS DELIBERATELY NOT COPIED.

  No org_id, no user id, no email, no workspace name. The retention obligation
  is over the FINANCIAL FACT — that an amount was paid, under which plan,
  against which provider reference — not over who paid it. Keeping the identity
  would turn a tax-retention exception into a way of holding personal data after
  someone asked us to erase it, which is the opposite of the point.

  `original_id` and `reference` are kept because a dispute is looked up by the
  provider's reference, and without it the row cannot be matched to anything.
*/

create table if not exists erased_subscriptions (
  id           uuid primary key default gen_random_uuid(),

  /* The subscription's own id, so a provider dispute can be traced back. */
  original_id  uuid,

  plan         text,
  status       text,
  provider     text,
  amount       numeric,
  /* The payment provider's reference — how a chargeback is actually looked up. */
  reference    text,

  /* When the subscription was created, and when the workspace was erased. */
  created_at   timestamptz,
  erased_at    timestamptz not null default now()
);

create index if not exists erased_subscriptions_reference on erased_subscriptions (reference);
create index if not exists erased_subscriptions_erased_at on erased_subscriptions (erased_at desc);

/*
  RLS on, with NO policy for anon or authenticated.

  These rows belong to no workspace by construction, so there is no tenant who
  could legitimately be shown them — and a row with no owner and no policy is
  reachable only by the service role, which is what we want. Finance and support
  read it out of band.

  Enabling RLS with no policy is deny-all, which is the correct default here and
  is worth stating explicitly rather than leaving to the reader to infer from
  the absence of a `create policy`.
*/
alter table erased_subscriptions enable row level security;

revoke all on table erased_subscriptions from public, anon, authenticated;
grant select, insert on table erased_subscriptions to service_role;

comment on table erased_subscriptions is
  'Subscription records retained after workspace erasure, for tax and dispute '
  'purposes. No org_id, no user identity — the retention obligation is over the '
  'financial fact, not over who transacted. See lib/erasure.ts.';


-- =====================================================================
-- SECTION 4/10 — 2026_collections.sql
-- =====================================================================

/*
  The collections agent.

  WHY THIS IS THE MOST IMPORTANT MODULE IN THE PRODUCT.

  Cortex already works out that Sharma Traders owes ₹8,00,000 and is 62 days
  late. Then it stops. The owner still has to open WhatsApp and type the
  message. So the product sells INFORMATION, and the customer does the work —
  which is why it is hard to price above a dashboard.

  This closes the loop: Cortex drafts the reminder, sends it on the owner's
  behalf, watches for payment, and reports what came back. That turns "here is
  what is wrong" into "here is ₹4.2 lakh I recovered for you", which is the only
  sentence that makes a ₹15,000/month subscription renew itself.

  AND IT IS THE MOST DANGEROUS MODULE IN THE PRODUCT.

  Every other feature is read-only or writes to the customer's own workspace.
  This one sends messages, in the customer's name, to THEIR customers. The
  failure modes are not "a wrong number on a dashboard" — they are a valued
  client being dunned twice a day, a payment reminder going to someone who
  already paid, or a business relationship damaged by a machine.

  So the schema is built around refusing to do that:

    - `auto_send` DEFAULTS TO FALSE. Nothing leaves the building until a human
      has approved it. Opting into automatic sending is a deliberate act.
    - a thread STOPS the moment its invoice is marked paid, and the stop is a
      status on the row rather than a rule someone has to remember
    - `max_attempts` and `min_gap_days` are policy, enforced in SQL, not
      conventions in application code
    - a do-not-contact list exists and is checked before anything is drafted
    - quiet hours, because a dunning message at 11pm is worse than none
    - every message ever drafted is kept, sent or not, so the owner can always
      answer "what did you say to my customer?"

  None of these are optional niceties. A collections feature that misfires once
  costs the customer a relationship, and they will never trust the product
  again — which makes it a worse business decision than not shipping it.
*/

-- ---------------------------------------------------------------- policy

create table if not exists collection_policies (
  org_id           uuid primary key references organizations(id) on delete cascade,

  /* Master switch. Off until the owner turns it on and sees a draft. */
  enabled          boolean not null default false,

  /*
    Send without asking.

    Default FALSE and it should stay false for most workspaces. The value of the
    feature is mostly in the drafting and the tracking; the marginal convenience
    of skipping approval is small next to the cost of one wrong message.
  */
  auto_send        boolean not null default false,

  /* How the reminder should read. Anything harsher than 'firm' is not offered. */
  tone             text not null default 'polite'
                   check (tone in ('polite', 'neutral', 'firm')),

  channels         text[] not null default array['email'],

  /* Days past the DUE DATE before the first reminder. */
  first_after_days int not null default 3 check (first_after_days between 0 and 90),
  /* Minimum days between two messages to the same party. */
  min_gap_days     int not null default 7 check (min_gap_days between 1 and 90),
  /* Total messages per invoice, ever. */
  max_attempts     int not null default 3 check (max_attempts between 1 and 10),
  /* Ceiling across the whole workspace per day, so a bad import cannot spam. */
  max_per_day      int not null default 25 check (max_per_day between 1 and 200),

  /* Local quiet hours (IST). Nothing sends outside 09:00–19:00 by default. */
  send_from_hour   int not null default 9  check (send_from_hour between 0 and 23),
  send_to_hour     int not null default 19 check (send_to_hour between 0 and 23),

  /* Never contact these parties. Matched on normalised name. */
  do_not_contact   text[] not null default '{}',

  /* Appended to every message so the recipient knows who is writing. */
  signature        text,
  /* Where to pay. A reminder without this is just nagging. */
  payment_note     text,

  updated_at       timestamptz not null default now()
);

-- --------------------------------------------------------------- threads

/*
  One chase per invoice.

  UNIQUE on (org_id, invoice_id): an invoice can only be chased by one thread,
  so a second run cannot start a parallel conversation with the same person
  about the same money.
*/
create table if not exists collection_threads (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  invoice_id    uuid not null references invoices(id) on delete cascade,

  party         text not null,
  amount        numeric not null default 0,
  due_date      date,

  status        text not null default 'open'
                check (status in ('open', 'paused', 'recovered', 'excluded', 'exhausted')),
  attempts      int not null default 0,
  last_sent_at  timestamptz,
  next_due_at   timestamptz,

  /*
    Set when the invoice is seen to be paid. `recovered_amount` is what makes
    the Prove layer possible — and it is only ever written for a thread that
    actually sent something, so the product cannot take credit for money that
    would have arrived anyway.
  */
  recovered_at     timestamptz,
  recovered_amount numeric,

  created_at    timestamptz not null default now(),
  unique (org_id, invoice_id)
);

create index if not exists collection_threads_due_idx
  on collection_threads (org_id, status, next_due_at);

-- -------------------------------------------------------------- messages

create table if not exists collection_messages (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  thread_id    uuid not null references collection_threads(id) on delete cascade,

  attempt      int not null default 1,
  channel      text not null check (channel in ('email', 'whatsapp')),
  /* Where it went. Kept on the message so an audit does not depend on the
     customer record still holding the same address. */
  recipient    text,
  subject      text,
  body         text not null,

  status       text not null default 'draft'
               check (status in ('draft', 'approved', 'sent', 'failed', 'skipped', 'cancelled')),
  error        text,
  provider_id  text,

  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  sent_at      timestamptz
);

create index if not exists collection_messages_thread_idx
  on collection_messages (thread_id, created_at desc);
create index if not exists collection_messages_pending_idx
  on collection_messages (org_id, status) where status in ('draft', 'approved');

-- ------------------------------------------------------------------- RLS

alter table collection_policies enable row level security;
alter table collection_threads  enable row level security;
alter table collection_messages enable row level security;

do $$
declare t text;
begin
  foreach t in array array['collection_policies','collection_threads','collection_messages'] loop
    execute format('drop policy if exists "members read %1$s" on %1$s', t);
    execute format('create policy "members read %1$s" on %1$s for select using (org_id in (select user_org_ids()))', t);

    execute format('drop policy if exists "members write %1$s" on %1$s', t);
    execute format('create policy "members write %1$s" on %1$s for insert with check (org_id in (select user_org_ids()))', t);

    execute format('drop policy if exists "members update %1$s" on %1$s', t);
    execute format('create policy "members update %1$s" on %1$s for update using (org_id in (select user_org_ids())) with check (org_id in (select user_org_ids()))', t);

    execute format('drop policy if exists "members delete %1$s" on %1$s', t);
    execute format('create policy "members delete %1$s" on %1$s for delete using (org_id in (select user_org_ids()))', t);
  end loop;
end $$;

-- ------------------------------------------------- stop the moment it is paid

/*
  The single most important rule in this module.

  Chasing someone who has already paid is the failure that loses a customer's
  customer. It must not depend on the cron running, on the application
  remembering, or on anyone marking the thread by hand — so it is a trigger on
  the invoice itself. The instant `status` becomes 'paid', every open thread for
  that invoice is closed and every unsent message is cancelled.

  `recovered_amount` is recorded ONLY when at least one message was actually
  sent. Money that arrived without Cortex saying anything is not recovery, and a
  Prove layer that counts it would be lying to the customer about its own value.
*/
create or replace function cortex_collections_stop_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(NEW.status, '')) = 'paid'
     and lower(coalesce(OLD.status, '')) is distinct from 'paid' then

    update collection_threads t
       set status = 'recovered',
           recovered_at = now(),
           recovered_amount = case when t.attempts > 0 then NEW.amount else null end,
           next_due_at = null
     where t.invoice_id = NEW.id
       and t.status in ('open', 'paused');

    update collection_messages m
       set status = 'cancelled'
     where m.status in ('draft', 'approved')
       and m.thread_id in (select id from collection_threads where invoice_id = NEW.id);
  end if;
  return NEW;
end $$;

drop trigger if exists cortex_invoice_paid_stops_collection on invoices;
create trigger cortex_invoice_paid_stops_collection
  after update on invoices
  for each row
  execute function cortex_collections_stop_on_paid();

-- ------------------------------------------------------------ the ledger

/*
  What Cortex actually recovered, per workspace.

  Deliberately conservative: only threads that SENT something and then saw the
  invoice paid. Overstating this number is the fastest way to lose the trust the
  number exists to build.
*/
create or replace function cortex_recovery_summary(p_org uuid, p_days int default 90)
returns table (
  invoices_recovered bigint,
  amount_recovered   numeric,
  messages_sent      bigint,
  still_chasing      bigint,
  amount_chasing     numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from collection_threads
      where org_id = p_org and status = 'recovered'
        and recovered_amount is not null
        and recovered_at > now() - make_interval(days => p_days)),
    (select coalesce(sum(recovered_amount), 0) from collection_threads
      where org_id = p_org and status = 'recovered'
        and recovered_amount is not null
        and recovered_at > now() - make_interval(days => p_days)),
    (select count(*) from collection_messages
      where org_id = p_org and status = 'sent'
        and sent_at > now() - make_interval(days => p_days)),
    (select count(*) from collection_threads
      where org_id = p_org and status = 'open'),
    (select coalesce(sum(amount), 0) from collection_threads
      where org_id = p_org and status = 'open');
$$;

revoke all on function cortex_recovery_summary(uuid, int) from public, anon;
grant execute on function cortex_recovery_summary(uuid, int) to authenticated, service_role;


-- =====================================================================
-- SECTION 5/10 — 2026_collections_safety.sql
-- =====================================================================

/*
  The brakes you need before strangers can use this.

  Collections sends messages, in a customer's name, to people who never signed
  up for anything. Everything in 2026_collections.sql is a per-workspace control
  the customer sets. This file adds the two controls the OPERATOR needs, which
  are a different problem:

    1. a global stop, so a misfire can be halted for everyone in seconds without
       waiting for a deploy — the difference between one bad hour and one bad day
    2. a per-workspace circuit breaker that trips itself on repeated failures,
       so a workspace with a broken WhatsApp token does not spend all day
       retrying and burning its own provider quota

  Neither is a nice-to-have at launch. A feature that messages third parties
  needs an off switch that does not require an engineer, and it needs to notice
  when it is failing rather than continuing cheerfully.
*/

-- ------------------------------------------------------------ global stop

/*
  One row. `id = true` so a second row is impossible — a kill switch with two
  rows and disagreeing values is worse than none, because the reader picks one
  arbitrarily.
*/
create table if not exists platform_switches (
  id                  boolean primary key default true check (id),
  collections_enabled boolean not null default true,
  /* Shown to the operator and in the health check so nobody has to guess why. */
  reason              text,
  updated_at          timestamptz not null default now(),
  constraint one_row check (id)
);

insert into platform_switches (id) values (true) on conflict (id) do nothing;

alter table platform_switches enable row level security;

/*
  Readable by any signed-in user — it is a single boolean about the platform,
  not about any workspace, and the collections UI needs to explain itself when
  sending is paused. Writable only by the service role, i.e. by a super-admin
  action, never from the browser.
*/
drop policy if exists "anyone may read switches" on platform_switches;
create policy "anyone may read switches" on platform_switches for select using (true);

create or replace function cortex_collections_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select collections_enabled from platform_switches where id), true);
$$;

grant execute on function cortex_collections_enabled() to authenticated, service_role;

-- ------------------------------------------------- per-workspace breaker

/*
  Trip a workspace's collections after repeated send failures.

  The realistic failure is an expired WhatsApp token or a revoked email key. The
  engine already marks each attempt failed, but without this it would keep
  presenting the same messages every run — the customer sees nothing working and
  we spend their provider quota discovering it again each time.

  Counted over a rolling window rather than all time, so one bad afternoon
  months ago does not keep a healthy workspace switched off.
*/
alter table collection_policies add column if not exists tripped_at    timestamptz;
alter table collection_policies add column if not exists tripped_reason text;

create or replace function cortex_collections_trip_check(p_org uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  fails int;
  sends int;
begin
  select count(*) into fails
    from collection_messages
   where org_id = p_org and status = 'failed'
     and created_at > now() - interval '24 hours';

  select count(*) into sends
    from collection_messages
   where org_id = p_org and status = 'sent'
     and sent_at > now() - interval '24 hours';

  /*
    Five consecutive-ish failures with nothing getting through. Requiring
    sends = 0 matters: a busy workspace sending 200 reminders a day will have
    the odd bounce, and tripping it for that would be worse than the failures.
  */
  if fails >= 5 and sends = 0 then
    update collection_policies
       set enabled = false,
           tripped_at = now(),
           tripped_reason = fails || ' sends failed in 24h with none delivered — check your email or WhatsApp credentials'
     where org_id = p_org and enabled = true;
    return true;
  end if;
  return false;
end $$;

revoke all on function cortex_collections_trip_check(uuid) from public, anon;
grant execute on function cortex_collections_trip_check(uuid) to service_role;

-- ------------------------------------------------------- operator control

/*
  Flip the global switch. Service-role only, called by the super-admin console.
*/
create or replace function cortex_set_collections_switch(p_on boolean, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update platform_switches
     set collections_enabled = p_on,
         reason = case when p_on then null else coalesce(p_reason, 'paused by operator') end,
         updated_at = now()
   where id;
  return p_on;
end $$;

revoke all on function cortex_set_collections_switch(boolean, text) from public, anon, authenticated;
grant execute on function cortex_set_collections_switch(boolean, text) to service_role;


-- =====================================================================
-- SECTION 6/10 — 2026_collections_whatsapp.sql
-- =====================================================================

/*
  WhatsApp collections: the workspace's own approved template.

  WHY THIS COLUMN HAS TO EXIST.

  Meta will not deliver a message to someone who has not messaged the business
  first unless it uses a template Meta approved in advance. A debtor being
  chased has never messaged the business — that is what makes them a debtor and
  not a conversation. So free-form WhatsApp dunning is not a thing that can
  work, and the send path was using it: every WhatsApp reminder failed with
  error 131047, and because the circuit breaker trips on "failures with no
  successes", the permanently-impossible channel switched the whole policy off
  and took EMAIL down with it.

  We cannot create the template on the customer's behalf. It is submitted from
  their own Meta Business Manager against their own verified business and
  reviewed by Meta. All we can do is let them tell us its name, explain exactly
  how to get one, and refuse to pretend until they have.

  `whatsapp_lang` matters more than it looks: Meta treats a template name and a
  language as one identity, so "payment_reminder" in en and en_US are different
  templates and sending to the wrong one is a hard error. Default 'en'.
*/

alter table collection_policies
  add column if not exists whatsapp_template text,
  add column if not exists whatsapp_lang     text not null default 'en';

/*
  Length only, deliberately. The exact character rule (lowercase, digits and
  underscores) is enforced in lib/collections/whatsapp.ts, where a violation can
  be returned to the owner as a sentence they can act on rather than as a
  constraint-violation stack trace on save.
*/
alter table collection_policies
  drop constraint if exists collection_policies_whatsapp_template_len;
alter table collection_policies
  add constraint collection_policies_whatsapp_template_len
  check (whatsapp_template is null or char_length(whatsapp_template) <= 512);

/*
  'skipped' already exists on collection_messages. This comment is here to
  record WHY the send path now uses it for setup refusals rather than 'failed':

  "You have not connected WhatsApp" is not a delivery failure. It is a standing
  fact that stays true on every run until the owner acts, so recording it as a
  failure would guarantee cortex_collections_trip_check disables the policy —
  including the email channel, which was working. The breaker counts 'failed'
  only, so a setup refusal must never be written as one.
*/
comment on column collection_messages.status is
  'draft | approved | sent | failed | skipped | cancelled. '
  'failed = the provider was reached and refused, and counts toward the circuit breaker. '
  'skipped = we declined to send (not configured, no template), and must NOT count.';

/*
  ---------------------------------------------------------------------------
  Fair rotation for the nightly collections sweep.

  The cron read `collection_policies where enabled = true limit 200`. PostgREST
  applies no ordering unless asked, so which 200 came back was whatever the
  planner felt like — and once more than 200 workspaces switch collections on,
  some are served every night and others never are, with nothing anywhere
  saying so. A customer paying for automated chasing would simply find it had
  silently stopped, and no error would exist to explain it.

  Recording when a workspace was last swept lets the cron take the 200
  LEAST-RECENTLY-SWEPT each run. Every workspace is then reached within
  ceil(n/200) days, the order is deterministic, and the column is visible when
  someone asks why a particular workspace has not run.

  NULL sorts first under `nulls first`, so a workspace that has never been
  swept — the one most likely to be waiting — goes to the front of the queue.
*/
alter table collection_policies
  add column if not exists last_swept_at timestamptz;

create index if not exists collection_policies_sweep_order
  on collection_policies (last_swept_at nulls first)
  where enabled = true;


-- =====================================================================
-- SECTION 7/10 — 2026_msme_exposure_fix.sql
-- =====================================================================

/*
  The 43B(h) exposure was overstating itself, by a lot.

  THE BUG.

  cortex_msme_exposure grouped every unpaid bill by party and returned:

      sum(m.amount)                                       as total_amount,
      max(current_date - m.dated) > min(m.window_days)    as past_window

  `past_window` was a PER-PARTY flag driven by the party's OLDEST bill, while
  `total_amount` was the sum of ALL that party's bills. lib/msme.ts then adds the
  whole group to `atRisk` whenever the flag is true.

  Worked through, for a micro supplier with a written agreement (45-day window):

      one bill of ₹1,00,000 dated 60 days ago      -> genuinely at risk
      nine bills of ₹1,00,000 dated 5 days ago     -> nowhere near the window

      reported: past_window = (60 > 45) = true, total = ₹10,00,000, count = 10
      truth:                                        ₹1,00,000,  count = 1

  Ten times over. And this is a TAX number: the page tells an owner how much of
  their deduction is at risk, which is a figure they act on before a year end.
  The module's own header says inflating it is the failure it exists to prevent,
  and it was inflating it.

  THE FIX.

  Split the aggregate. Only bills actually past their own window count toward
  the exposure; the party's remaining balance is returned separately so the
  screen can still show the full relationship without adding it to the number
  that matters.

  Note the window is evaluated PER BILL rather than per party. Two bills from the
  same supplier can sit under different agreements, and taking min() across the
  group applied the harsher window to bills it did not govern.
*/

/*
  DROP first. Postgres refuses `create or replace` when the RETURN TYPE changes,
  and this adds two columns — so replacing in place fails with "cannot change
  return type of existing function" and the migration would abort halfway,
  leaving the broken version live.
*/
drop function if exists cortex_msme_exposure(uuid);

create function cortex_msme_exposure(p_org uuid)
returns table (
  party            text,
  udyam_category   text,
  invoice_count    bigint,   -- bills PAST the window
  total_amount     numeric,  -- value of those bills only
  oldest_days      int,
  window_days      int,
  past_window      boolean,
  other_count      bigint,   -- bills still inside the window
  other_amount     numeric   -- and their value, reported but never counted
)
language sql
stable
security invoker
set search_path = public
as $$
  with payables as (
    select i.party,
           i.amount,
           coalesce(i.issue_date, i.created_at::date) as dated,
           cortex_norm_name(i.party)                  as norm
      from invoices i
     where i.org_id = p_org
       and lower(i.type) = 'payable'
       /*
         Case-insensitive. A Tally or Vyapar export writes "Paid", and the old
         `<> 'paid'` let those bills through — inflating a tax figure with money
         that had already gone out.
       */
       and lower(coalesce(i.status, 'pending')) <> 'paid'
  ),
  matched as (
    select p.*,
           v.udyam_category,
           /* Per BILL, not per party: two bills from one supplier can sit under
              different agreements, and min() applied the harsher window to bills
              it did not govern. */
           case when coalesce(v.has_written_agreement, true) then 45 else 15 end as window_days,
           (current_date - p.dated) as age_days
      from payables p
      left join vendors v
        on v.org_id = p_org
       and cortex_norm_name(v.name) = p.norm
  )
  select
    m.party,
    coalesce(m.udyam_category, 'unclassified')                                  as udyam_category,
    count(*) filter (where m.age_days > m.window_days)                          as invoice_count,
    coalesce(sum(m.amount) filter (where m.age_days > m.window_days), 0)        as total_amount,
    coalesce(max(m.age_days) filter (where m.age_days > m.window_days), 0)::int as oldest_days,
    min(m.window_days)                                                          as window_days,
    bool_or(m.age_days > m.window_days)                                         as past_window,
    count(*) filter (where m.age_days <= m.window_days)                         as other_count,
    coalesce(sum(m.amount) filter (where m.age_days <= m.window_days), 0)       as other_amount
  from matched m
  group by m.party, coalesce(m.udyam_category, 'unclassified')
  /* Worst exposure first; a party with nothing past the window sorts last. */
  order by coalesce(sum(m.amount) filter (where m.age_days > m.window_days), 0) desc,
           sum(m.amount) desc
$$;

revoke all on function cortex_msme_exposure(uuid) from public, anon;
grant execute on function cortex_msme_exposure(uuid) to authenticated, service_role;

/*
  Backfill issue_date where it is missing but derivable.

  The importer now maps issue_date, but rows imported before that fix have NULL,
  and the ageing then runs from the import timestamp. A due date is the better
  anchor: for the overwhelming majority of Indian SME purchase bills the terms
  are 30 days, so due_date - 30 is far closer to the truth than "the day this
  spreadsheet was uploaded".

  Only where issue_date is null AND due_date is known — never overwriting a real
  value, and never inventing one out of nothing.
*/
update invoices
   set issue_date = (due_date - interval '30 days')::date
 where issue_date is null
   and due_date is not null
   and type = 'payable';


-- =====================================================================
-- SECTION 8/10 — 2026_metric_snapshots.sql
-- =====================================================================

/*
  Daily metric snapshots — so "what changed this week" is a fact, not a claim.

  WHY THIS DID NOT EXIST, AND WHY THAT WAS A PROBLEM.

  `health_metrics` holds ONE row per (org_id, metric_key) and recomputeMetrics()
  upserts over it on every write. It is a picture of right now, and it has no
  memory: the moment receivables move from ₹12L to ₹19L, the ₹12L is gone.

  Everything Cortex sells is a change over time. The positioning is early
  warning. The Practice plan bullet is literally "Whose receivables moved this
  week". The weekly brief is supposed to say what moved. None of that was
  computable, because nothing anywhere retained yesterday's number — so the
  bullet was a promise with no mechanism behind it.

  This is that mechanism: an append-only row per workspace, per metric, per day.

  WHY ONE ROW PER DAY AND NOT PER RECOMPUTE.

  recomputeMetrics() runs inline after every write. A busy workspace importing a
  spreadsheet triggers it hundreds of times in a minute, and storing each would
  be both enormous and useless — the question is never "what did receivables do
  between 14:02 and 14:03". The primary key is (org_id, metric_key, as_of) and
  the write is an upsert, so the last recompute of a day wins and a day costs
  one row per metric. Roughly 12 metrics x 365 days = 4,400 rows per workspace
  per year, which is nothing.

  WHY `numeric` AND NOT THE WHOLE ROW.

  Only the value is kept. Labels, units and status bands are presentation and
  live in health_metrics, where they are always current; copying them here would
  create two sources of truth for the same string and guarantee they diverge.
*/

create table if not exists metric_snapshots (
  org_id     uuid not null references organizations(id) on delete cascade,
  metric_key text not null,
  as_of      date not null,
  value      numeric not null,
  created_at timestamptz not null default now(),
  primary key (org_id, metric_key, as_of)
);

/* The only query this table serves: one org, one metric, walking back in time. */
create index if not exists metric_snapshots_lookup
  on metric_snapshots (org_id, metric_key, as_of desc);

alter table metric_snapshots enable row level security;

/*
  Read-only to members. Nothing in the app writes here through a user session —
  recomputeMetrics() uses the service role — and a history a tenant can edit is
  a history that cannot be trusted to show what actually happened.
*/
drop policy if exists "members read metric_snapshots" on metric_snapshots;
create policy "members read metric_snapshots" on metric_snapshots
  for select using (org_id in (select user_org_ids()));

/*
  ---------------------------------------------------------------------------
  What moved, and by how much.

  Compares each metric's latest value against the newest snapshot at least
  `p_days` old. Note "at least", not "exactly": a workspace that was not touched
  last Tuesday has no Tuesday row, and an exact-date lookup would report nothing
  moved rather than comparing against the most recent reading before then.

  `previous_as_of` is returned so the caller can SAY which date it compared
  against. "Receivables up 38% since 28 August" is a sentence an owner can
  check; "receivables up 38% this week" from a comparison against an unknown
  date is one they cannot.

  security invoker, so RLS applies and this cannot be used to read across
  tenants. The org_billing_guard migration explains why definer rights on a
  tenant-scoped function is the mistake that keeps being made.
*/
drop function if exists cortex_metric_movement(uuid, int, numeric);

create function cortex_metric_movement(
  p_org uuid,
  p_days int default 7,
  p_min_pct numeric default 0
)
returns table (
  metric_key     text,
  current_value  numeric,
  previous_value numeric,
  previous_as_of date,
  delta          numeric,
  delta_pct      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with latest as (
    select s.metric_key, s.value, s.as_of
      from metric_snapshots s
     where s.org_id = p_org
       and s.as_of = (
         select max(s2.as_of) from metric_snapshots s2
          where s2.org_id = p_org and s2.metric_key = s.metric_key
       )
  ),
  prior as (
    select distinct on (s.metric_key) s.metric_key, s.value, s.as_of
      from metric_snapshots s
     where s.org_id = p_org
       and s.as_of <= current_date - p_days
     order by s.metric_key, s.as_of desc
  )
  select
    l.metric_key,
    l.value                                                   as current_value,
    p.value                                                   as previous_value,
    p.as_of                                                   as previous_as_of,
    (l.value - p.value)                                       as delta,
    /*
      Percentage is NULL, not zero, when the previous value was zero. Going
      from ₹0 to ₹5,00,000 is not a 0% change and it is not an infinite one;
      it is a change that a percentage cannot describe, and the caller should
      render the absolute figure instead of a made-up ratio.
    */
    case when p.value = 0 then null
         else round(((l.value - p.value) / abs(p.value)) * 100, 1) end as delta_pct
  from latest l
  join prior p on p.metric_key = l.metric_key
  where p_min_pct <= 0
     or (p.value <> 0 and abs((l.value - p.value) / abs(p.value)) * 100 >= p_min_pct)
  order by
    case when p.value = 0 then null
         else abs((l.value - p.value) / abs(p.value)) end desc nulls last,
    abs(l.value - p.value) desc
$$;

revoke all on function cortex_metric_movement(uuid, int, numeric) from public, anon;
grant execute on function cortex_metric_movement(uuid, int, numeric) to authenticated, service_role;

/*
  ---------------------------------------------------------------------------
  Seed today from whatever health_metrics currently holds.

  Without this the feature is silent for a week after deployment, which reads as
  broken. This gives every existing workspace one honest data point — today's —
  so the comparison starts working as soon as there is a second one, and never
  claims to know a value from before this migration ran.
*/
insert into metric_snapshots (org_id, metric_key, as_of, value)
select h.org_id, h.metric_key, current_date, h.value
  from health_metrics h
 where h.value is not null
on conflict (org_id, metric_key, as_of) do nothing;


-- =====================================================================
-- SECTION 9/10 — 2026_default_alert_rules.sql
-- =====================================================================

/*
  Default alert rules, so "watched daily" is true on the plan that sells it.

  THE PROBLEM.

  "Receivables, payables & cash — watched daily" is a bullet on Watch, the
  ₹4,999 entry plan, and the landing page goes further: "Cortex emails you the
  day an invoice crosses its due date — with the name and the number."

  The mechanism behind both is alert_rules → deliverAlerts(). But no default
  rules were ever seeded — 2026_alert_rules.sql creates the table and nothing
  writes to it — so a new workspace has ZERO rules and the nightly evaluation
  has nothing to evaluate. Nothing is watched, nothing is emailed, and the
  customer's experience of the plan's headline promise is silence.

  Worse, the fix that suggested itself was the wrong one. Custom alert rules are
  a Watch Pro differentiator, so gating rule CREATION to Watch Pro would have
  been consistent with the price list and would have made Watch's own bullet
  permanently unbackable — enforcing the pricing by breaking the product.

  THE SPLIT THAT MAKES BOTH TRUE.

    Watch      gets these defaults, applied automatically. It is watched daily,
               with no setup, which is exactly what the bullet says.
    Watch Pro  additionally gets "Alert rules YOU set" — thresholds of their
               own choosing, on any metric. That is the differentiator, and it
               is a real one.

  WHY THESE THRESHOLDS.

  A default that fires constantly is worse than no default: people learn to
  ignore the sender, and then the one that mattered is ignored too. So these
  are deliberately conservative, and each is a number an owner would agree is
  worth an email rather than a number that is merely unusual.

    receivables > 500000   ₹5,00,000 past due. Below this most SMEs are simply
                           carrying normal float; above it, cash is at risk.
    risk        > 60       The composite risk score, on a 0-100 scale where the
                           product already bands 50+ as "warning".
    cash        < 30       Days of runway. Under a month is the point at which
                           an owner needs to be doing something about it.

  Only rules for metrics the workspace ACTUALLY EMITS would be ideal, but a
  rule for an absent metric is harmless: the evaluator joins against
  health_metrics and a missing key simply never matches. Inserting all three
  up front means the rule is already there on the day the metric first appears.
*/

-- ---------------------------------------------------------------------------
-- 1. One row per (org, metric, op), so re-running cannot duplicate a rule.
-- ---------------------------------------------------------------------------

/*
  saveAlertRule() already upserts on this conflict target, so the index it
  needs may or may not exist depending on which migrations a deployment has
  had. Creating it here makes the backfill below safe either way.
*/
create unique index if not exists alert_rules_org_metric_op
  on alert_rules (org_id, metric_key, op);

-- ---------------------------------------------------------------------------
-- 2. Backfill every existing workspace.
-- ---------------------------------------------------------------------------

/*
  `on conflict do nothing` matters more than it looks: a customer who has
  already set their own threshold on one of these metrics must keep THEIR
  number. Overwriting a deliberate choice with our default would be the kind of
  silent change that destroys trust in the whole alerting feature.
*/
insert into alert_rules (org_id, metric_key, op, threshold, enabled)
select o.id, d.metric_key, d.op, d.threshold, true
  from organizations o
  cross join (values
    ('receivables', '>', 500000),
    ('risk',        '>', 60),
    ('cash',        '<', 30)
  ) as d(metric_key, op, threshold)
on conflict (org_id, metric_key, op) do nothing;

-- ---------------------------------------------------------------------------
-- 3. And for every workspace created from now on.
-- ---------------------------------------------------------------------------

/*
  A trigger rather than application code, for the same reason
  2026_default_weekly_brief.sql uses one: organizations rows are created from
  more than one path (the signup trigger, ensureWorkspace, and by hand during
  support), and a default that depends on which path you came through is a
  default that is missing for somebody.
*/
create or replace function cortex_seed_default_alert_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into alert_rules (org_id, metric_key, op, threshold, enabled)
  values (new.id, 'receivables', '>', 500000, true),
         (new.id, 'risk',        '>', 60,     true),
         (new.id, 'cash',        '<', 30,     true)
  on conflict (org_id, metric_key, op) do nothing;
  return new;
exception when others then
  /* Never let alerting setup block workspace creation. A workspace with no
     default rules is a degraded product; a signup that fails is no product. */
  return new;
end $$;

drop trigger if exists trg_seed_default_alert_rules on organizations;
create trigger trg_seed_default_alert_rules
  after insert on organizations
  for each row execute function cortex_seed_default_alert_rules();

revoke all on function cortex_seed_default_alert_rules() from public, anon, authenticated;




-- =====================================================================
-- SECTION 10/10 — 2026_definer_grant_sweep.sql
-- Added after cortex_definer_audit() was run against production and
-- found cortex_collections_trip_check still reachable by authenticated.
-- =====================================================================

/*
  `revoke ... from public, anon` is NOT enough on Supabase.

  HOW THIS WAS FOUND.

  The standing report added in 2026_seed_rpc_lockdown — cortex_definer_audit()
  — was run against production and listed cortex_collections_trip_check as
  SECURITY DEFINER, reachable by `authenticated`, with no membership check.
  That function was supposed to be service-role only. Its migration says:

      revoke all on function cortex_collections_trip_check(uuid) from public, anon;
      grant execute on function cortex_collections_trip_check(uuid) to service_role;

  which looks complete and is not.

  THE MECHANISM.

  Supabase ships a default-privileges rule on the public schema:

      alter default privileges in schema public
        grant execute on functions to postgres, anon, authenticated, service_role;

  So a newly created function gets a DIRECT grant to `authenticated`, not merely
  the implicit one it inherits as a member of PUBLIC. `revoke ... from public`
  removes the PUBLIC entry from the ACL and leaves the direct entry untouched.
  The function stays callable by every signed-in user, and the migration reads
  as though it does not.

  WHAT THAT COST.

  Reproduced in Postgres: with the revoke exactly as written above, a signed-in
  user who is not a member of the target workspace called
  cortex_collections_trip_check('<victim org>') and the victim's
  collection_policies.enabled went from true to false. Any account — signup is
  free — could switch off any customer's collections. The precondition (five
  failures and no sends in 24h) narrows it, but the function also returns a
  boolean about another tenant's send health, so it doubles as a probe.

  The money-moving functions were fine: 2026_hardening.sql revokes
  charge_credits, grant_credits, sync_allowance and bump_memory_refs from
  `public, anon, authenticated` explicitly. Fifteen other revokes across the
  migrations name only `public, anon`. This is the sweep that fixes the class
  rather than the one instance.
*/

-- ---------------------------------------------------------------------------
-- 1. Revoke EXECUTE from anon and authenticated on every SECURITY DEFINER
--    function in public, except the ones that are supposed to be callable.
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
  allowed text[] := array[
    /*
      THE ALLOWLIST, with the reason each one is on it. Anything not named here
      is service-role only. Adding a name to this list is a security decision
      and should be argued for in a comment, not just typed.
    */

    -- The RLS helpers. EVERY tenant policy calls these through the anon+cookie
    -- client, so revoking them breaks every read and write in the product.
    -- They are safe: both resolve auth.uid() themselves and return only what
    -- the CALLER is entitled to. They take an org id but do not act on it.
    'user_org_rank', 'user_org_ids',

    -- Authenticate on their own credential rather than on the session:
    -- an API key (api_ingest, api_metrics) or a share token (public_report).
    -- These are deliberately reachable by anon; that is the feature.
    'api_ingest', 'api_metrics', 'public_report',

    -- Called with the USER's client, and both now check membership
    -- themselves — see 2026_seed_rpc_lockdown.sql.
    'seed_demo_data', 'seed_demo_customers',

    -- Reads whether the global collections switch is on. No org parameter,
    -- no writes, and the answer is the same for everyone.
    'cortex_collections_enabled',

    -- Normalisation helpers: pure functions over their input, no table access.
    'cortex_norm_name'
  ];
  revoked int := 0;
begin
  for fn in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef                              -- SECURITY DEFINER only
       and p.proname <> all (allowed)
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    /*
      Definer rights bypass RLS, so for these the grant IS the access control —
      there is no policy underneath to catch a mistake. SECURITY INVOKER
      functions are deliberately left alone: RLS still applies to them, so a
      grant to authenticated is not by itself a hole (cortex_msme_exposure and
      cortex_metric_movement are both invoker, and both are called with the
      user's client on purpose).
    */
    /*
      PUBLIC as well as the two named roles, and that ordering matters.

      `authenticated` holds EXECUTE by TWO routes: the direct grant from
      Supabase's default-privileges rule, and the implicit one it inherits as a
      member of PUBLIC. Revoking only from anon and authenticated leaves the
      PUBLIC entry, and the function is still callable — which is the same
      half-fix that left cortex_collections_trip_check open in the first place.
      Verified: without `public` here, a function whose PUBLIC grant had never
      been revoked survived this sweep untouched.
    */
    execute format('revoke execute on function public.%I(%s) from public, anon, authenticated',
                   fn.proname, fn.args);
    execute format('grant execute on function public.%I(%s) to service_role',
                   fn.proname, fn.args);
    revoked := revoked + 1;
    raise notice 'locked down: %(%)', fn.proname, fn.args;
  end loop;

  raise notice 'definer sweep: % function(s) restricted to service_role', revoked;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Stop the default-privileges rule from re-opening the next one.
-- ---------------------------------------------------------------------------

/*
  DEFENCE IN DEPTH, AND UNVERIFIED — read this before relying on it.

  The intent is to stop the same bug arriving with the next migration: a new
  function should not be reachable by anon or authenticated unless someone
  grants it deliberately.

  I could NOT confirm this works. In the PGlite harness the default ACL is set
  correctly (pg_default_acl ends up as `{service_role=X/postgres}`) and a
  function created afterwards STILL comes out with `=X/postgres` — the built-in
  PUBLIC grant — so `authenticated` can still execute it. That may be a fidelity
  gap in PGlite's WASM build rather than real Postgres behaviour; Postgres
  documents `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM
  PUBLIC` as exactly the way to drop that default. Either way, it is not proven
  here, so it must not be treated as the control.

  THE CONTROL IS SECTION 1 — the sweep, which is verified. This is a belt on
  top of those braces, and section 3 is how you find out if both failed.

  Also note ALTER DEFAULT PRIVILEGES applies per role-that-creates, so it only
  affects functions created by the role running this migration. Another role
  creating a function is unaffected — another reason the audit matters more
  than this statement does.

  Deliberately does NOT touch table privileges: PostgREST needs those, and RLS
  is the control there. Functions only, where definer rights mean the grant is
  the only thing between a caller and the data.
*/
do $$
begin
  /*
     PUBLIC first. Postgres grants EXECUTE on a new function to PUBLIC as a
     built-in default, independently of any ALTER DEFAULT PRIVILEGES rule — so
     revoking only the Supabase-added grants to anon and authenticated changes
     nothing observable. Verified: a function created after that weaker version
     of this statement was still executable by authenticated.

     service_role is deliberately not included; it keeps its direct grant, and
     the sweep above re-grants it explicitly on everything it touched.
  */
  execute 'alter default privileges in schema public revoke execute on functions from public';
  execute 'alter default privileges in schema public revoke execute on functions from anon, authenticated';
  raise notice 'default privileges: new functions are no longer auto-granted to anon/authenticated';
exception when insufficient_privilege or others then
  raise notice 'could not change default privileges (%) — rely on cortex_definer_audit() instead', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Make the audit quieter, so it stays worth reading.
-- ---------------------------------------------------------------------------

/*
  The first version of this report flagged user_org_rank as "no membership
  check", which is true and meaningless — it IS the membership check, and it
  necessarily has to be callable by authenticated. A report that cries wolf on
  its own foundations is a report people stop reading, which is worse than
  having none.

  It now names WHY each remaining row is allowed, so the only rows that need
  thought are the ones whose reason is 'REVIEW'.
*/
/*
  DROP first. This changes the return type (has_membership_check -> verdict) and
  `create or replace` cannot widen or alter a `returns table` signature — it
  fails with "cannot change return type of existing function" and aborts the
  migration midway. Same trap as 2026_msme_exposure_fix.sql.
*/
drop function if exists public.cortex_definer_audit();

create function public.cortex_definer_audit()
returns table (
  function_name text,
  granted_to    text,
  verdict       text
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.proname::text,
         string_agg(distinct r.rolname, ', ' order by r.rolname)::text,
         case
           when p.proname in ('user_org_rank', 'user_org_ids')
             then 'OK — this IS the membership check; every RLS policy calls it'
           when p.proname in ('api_ingest', 'api_metrics')
             then 'OK — authenticates on an API key, not the session'
           when p.proname = 'public_report'
             then 'OK — authenticates on a share token'
           when p.proname = 'cortex_collections_enabled'
             then 'OK — no org parameter, no writes'
           when p.proname = 'cortex_norm_name'
             then 'OK — pure function, no table access'
           when position('user_org_rank' in p.prosrc) > 0
             or position('user_org_ids' in p.prosrc) > 0
             then 'OK — checks membership itself'
           else 'REVIEW — definer rights bypass RLS and nothing here checks membership'
         end
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('authenticated')) as r(rolname)
    join pg_roles a on a.rolname = r.rolname
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege(a.oid, p.oid, 'execute')
   group by p.proname, p.prosrc
   order by (case when position('user_org_rank' in p.prosrc) > 0
                   or position('user_org_ids' in p.prosrc) > 0
                   or p.proname in ('user_org_rank','user_org_ids','api_ingest','api_metrics',
                                    'public_report','cortex_collections_enabled','cortex_norm_name')
                  then 1 else 0 end), p.proname
$$;

revoke all on function public.cortex_definer_audit() from public, anon, authenticated;
grant execute on function public.cortex_definer_audit() to service_role;


-- =====================================================================
-- VERIFY — this last section changes nothing. It reports.
-- Every row below should say PASS.
-- =====================================================================

select 'anon cannot run seed_demo_data' as check,
       case when has_function_privilege('anon', 'public.seed_demo_data(uuid)', 'execute')
            then 'FAIL — still executable by anon' else 'PASS' end as result
union all
select 'seed_demo_data checks membership',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='seed_demo_data'
                            and position('user_org_rank' in p.prosrc) > 0)
            then 'PASS' else 'FAIL — the guard is not in the function body' end
union all
select 'api_keys readable by admins only',
       case when exists (select 1 from pg_policies where tablename='api_keys'
                          and cmd='SELECT' and qual like '%user_org_rank%')
            then 'PASS' else 'FAIL — a viewer can still read the key' end
union all
select 'invites cannot be created by an analyst',
       case when exists (select 1 from pg_policies where tablename='invites'
                          and cmd='INSERT' and with_check like '%>= 4%')
            then 'PASS' else 'FAIL' end
union all
select 'anon leads insert is org-scoped',
       case when exists (select 1 from pg_policies where tablename='leads'
                          and policyname='anon insert leads' and with_check like '%org_id IS NULL%')
            then 'PASS' else 'FAIL — anon can still write into any workspace' end
union all
select 'a workspace cannot lose its last owner',
       case when exists (select 1 from pg_trigger where tgname='trg_guard_last_owner')
            then 'PASS' else 'FAIL' end
union all
select 'erased_subscriptions exists (erasure retention)',
       case when to_regclass('public.erased_subscriptions') is not null then 'PASS' else 'FAIL' end
union all
select 'metric_snapshots exists (what moved this week)',
       case when to_regclass('public.metric_snapshots') is not null then 'PASS' else 'FAIL' end
union all
select 'MSME exposure splits past-window from the rest',
       case when exists (select 1 from information_schema.routines r
                          join information_schema.parameters pa on pa.specific_name=r.specific_name
                          where r.routine_name='cortex_msme_exposure' and pa.parameter_name='other_amount')
            then 'PASS' else 'FAIL — the 15x over-count is still live' end
union all
select 'collections has the WhatsApp template column',
       case when exists (select 1 from information_schema.columns
                          where table_name='collection_policies' and column_name='whatsapp_template')
            then 'PASS' else 'FAIL' end
union all
select 'every workspace has default alert rules',
       case when not exists (
              select 1 from organizations o
               where not exists (select 1 from alert_rules a where a.org_id=o.id))
            then 'PASS' else 'FAIL — some workspaces have none' end;

-- A standing report, not an assertion: every SECURITY DEFINER function that
-- takes an org id and is reachable by anon or authenticated. `false` in the
-- last column means it does not check membership — look at each one.
select * from cortex_definer_audit();
