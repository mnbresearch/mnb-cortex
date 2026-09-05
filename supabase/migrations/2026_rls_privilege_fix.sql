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
