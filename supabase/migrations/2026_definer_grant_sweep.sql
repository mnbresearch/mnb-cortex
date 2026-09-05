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
