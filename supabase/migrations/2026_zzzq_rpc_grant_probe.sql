/*
  "NO REVOKE FOUND IN ANY OF THE 103 SQL FILES" — AND THE REVOKE WAS THERE.

  ============================================================================
  WHY THIS EXISTS
  ============================================================================

  A portfolio audit raised, as HIGH: "Credit RPCs executable by any member.
  grant_credits / charge_credits / sync_allowance are SECURITY INVOKER with
  default PUBLIC EXECUTE → rpc('grant_credits',{p_org:myOrg,p_amount:1e9}).
  No revoke found in any of the 103 SQL files on main."

  The revoke IS there, in 2026_hardening.sql. The auditor could not find it,
  and neither could the first grep run against this repo afterwards, because
  it is not written as a literal statement. It is assembled at run time:

      foreach fn in array array['charge_credits(uuid,bigint,uuid,text,jsonb)', …]
        execute format('revoke execute on function %s from public, anon, authenticated', fn);
        execute format('grant execute on function %s to service_role', fn);

  So `grep "revoke execute on function grant_credits"` returns nothing, in a
  repo where 103 SQL files are applied BY HAND and the only way anyone checks
  what is installed is by reading them. A control that cannot be found by the
  obvious search is a control that gets re-implemented, or — as here — gets
  reported as missing to the person who owns the product.

  That is the smaller half of the problem. The larger half:

  ============================================================================
  THE LOOP SWALLOWS ITS OWN FAILURE
  ============================================================================

      exception when undefined_function or undefined_object then
        null; -- not created on this database yet

  Correct intent — 2026_hardening.sql must not abort on a database where
  credit metering has not been installed. But the consequence is that if the
  function is absent, or its signature differs by one type, the revoke is
  skipped SILENTLY and never retried. There is no second pass. The database
  then has grant_credits executable by `authenticated`, the repo contains a
  file that appears to have locked it, and nothing anywhere disagrees.

  (Checked while writing this: ORDER.txt puts 2026_credit_metering.sql at
  line 59 and 2026_hardening.sql at 67, and all four signatures match the
  array exactly — `sync_allowance(p_org uuid, p_amount bigint, p_days int)`
  against `sync_allowance(uuid,bigint,integer)`, since int IS integer. So on
  a database built in the documented order this is fine. "Fine if everyone
  followed the order" is not the same as verified.)

  ============================================================================
  WHAT THIS ADDS
  ============================================================================

  One read-only helper that answers, from the live catalogue, whether the
  dangerous RPCs are actually unreachable by the two browser roles. Not
  whether a file says so — whether Postgres agrees.

  It is the grant-level sibling of cortex_fn_has() from
  2026_zzzo_fn_body_probe.sql, which answers the same question for function
  BODIES. Both exist because this product's schema is applied by hand, and
  the only honest way to report on a hand-applied change is to look.

  Safe, by the same reasoning as that file: read-only and `stable`; returns a
  BOOLEAN, never a privilege listing; `security definer` with search_path
  pinned to pg_catalog, public so a caller cannot shadow pg_proc; and EXECUTE
  revoked from public, anon and authenticated, then granted to service_role —
  which is the convention 2026_zzzo got wrong and 2026_zzzp fixed.

  Idempotent.
*/

create or replace function cortex_rpcs_locked()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  /*
    TRUE when NONE of the four privileged RPCs is executable by `anon` or
    `authenticated`.

    A function that does not exist cannot be called, so it counts as locked —
    this probe answers "is anything reachable that should not be", not "is
    everything installed". cortex_fn_has() and the column probes cover
    installation.
  */
  select not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('charge_credits', 'grant_credits', 'sync_allowance', 'bump_memory_refs')
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'))
  );
$$;

revoke execute on function cortex_rpcs_locked() from public, anon, authenticated;
grant execute on function cortex_rpcs_locked() to service_role;

/* ---------------------------------------------------------------- verify ---
   Two columns, both must be true.

   `rpcs_locked` is the thing itself. `probe_installed` guards against the
   failure where the probe is missing and its absence reads as silence — the
   exact mistake 2026_zzzo_fn_body_probe.sql was written about.

   If rpcs_locked is FALSE, re-run the privileged-function block in
   2026_hardening.sql; the names it could not find are listed by the query
   below it.
   -------------------------------------------------------------------------- */
select
  cortex_rpcs_locked()                                    as rpcs_locked,
  (select count(*) = 1 from pg_proc
    where proname = 'cortex_rpcs_locked')                 as probe_installed;

/* Which ones, if any, are still open — for the operator, not the app. */
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('charge_credits', 'grant_credits', 'sync_allowance', 'bump_memory_refs')
 order by 1;
