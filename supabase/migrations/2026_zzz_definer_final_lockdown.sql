/* ===========================================================================
   THE SWEEP HAS TO BE THE LAST THING THAT RUNS. IT WASN'T.

   THE MECHANISM, WHICH IS DULLER AND MORE DANGEROUS THAN A BUG IN THE SQL.

   Migrations apply in FILENAME ORDER. 2026_definer_grant_sweep.sql revokes
   EXECUTE from anon and authenticated on every SECURITY DEFINER function in
   public that is not on its allowlist. It works — test-definer-grants.cjs
   proves it against real Postgres.

   But `d` sorts early. Every migration whose name sorts after
   `2026_definer_grant_sweep` and which CREATES a definer function gets that
   function back from Supabase's default-privileges rule:

       alter default privileges in schema public
         grant execute on functions to postgres, anon, authenticated, service_role;

   A newly created function therefore arrives with a DIRECT grant to
   `authenticated`. The sweep already ran. Nothing takes it away.

   So the sweep did not fix a class of bug. It fixed the instances that existed
   on the day it was written, and every file added afterwards reopened the
   class one function at a time. Five had accumulated:

     cortex_aggregate          (2026_zz_aggregate_ist_overdue)  — SERIOUS
     cortex_has_billing_guard  (2026_org_billing_guard)
     cortex_upsert_arbiters_ok (2026_upsert_arbiter_fix)
     cortex_guard_last_owner   (2026_rls_privilege_fix)
     handle_new_user           (2026_signup_trigger)

   cortex_aggregate is the one that mattered, and it is fixed at source in its
   own file — it takes the org id as a parameter and checks no membership, so
   the grant published any workspace's revenue, receivables and total monthly
   payroll to anyone holding that org's UUID. Org UUIDs ship to the browser in
   the org switcher, which means removing someone's membership would not have
   stopped them reading the business's numbers.

   The other four are much smaller, and are closed here rather than argued
   about:

   - cortex_has_billing_guard() and cortex_upsert_arbiters_ok() take no
     arguments and return one boolean each about the PLATFORM's configuration,
     not about any workspace. Harmless to a tenant. But `false` from the first
     one is a precise statement that credits metering is currently bypassable,
     which is a reconnaissance answer we should not hand to a stranger for the
     price of a free signup. lib/health.ts calls both with the SERVICE client,
     so revoking costs nothing.

   - cortex_guard_last_owner() and handle_new_user() both `returns trigger`.
     PostgREST does not expose trigger-returning functions and calling one
     directly raises an error, so neither was reachable in practice. Revoked
     for hygiene: "not exploitable today" is a property of PostgREST's
     behaviour, not of our intent.

   WHY THIS FILE IS NAMED `zzz`.

   So it runs last. That is a convention, not a guarantee — the next person to
   add a definer function in a file named `2027_...` reopens the same class,
   and a comment will not stop them.

   What stops them is scripts/test-definer-final-acl.cjs, added alongside this
   file. It replays every grant and revoke across the whole migrations
   directory in filename order and asserts the FINAL privilege on every definer
   function. A later file that re-grants one fails the suite, which is the
   check that was missing: the old test could only see the file it was pointed
   at, and it passed the entire time cortex_aggregate was open.

   Safe to run, and safe to run twice: it only removes privileges, and the
   allowlist below is byte-identical to the sweep's.
   =========================================================================== */

do $$
declare
  fn record;
  allowed text[] := array[
    -- The RLS helpers. Every tenant policy calls these through the anon+cookie
    -- client; revoking them breaks every read and write in the product. Both
    -- resolve auth.uid() themselves and answer only about the caller.
    'user_org_rank', 'user_org_ids',

    -- Authenticate on a credential they are HANDED rather than on the session:
    -- an API key (api_ingest, api_metrics) or a share token (public_report).
    -- Anon reachability is the feature.
    'api_ingest', 'api_metrics', 'public_report',

    -- Called with the user's client, and both check membership themselves.
    'seed_demo_data', 'seed_demo_customers',

    -- One global boolean, no org parameter, no writes, same answer for all.
    'cortex_collections_enabled',

    -- Pure function over its argument. No table access.
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
       and p.prosecdef
       and p.proname <> all (allowed)
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    /*
      `public` as well as the two named roles. `authenticated` holds EXECUTE by
      two routes — the direct grant from the default-privileges rule and the
      implicit one it inherits as a member of PUBLIC. Revoking only the named
      roles leaves the PUBLIC entry and the function stays callable; that exact
      half-fix is what left cortex_collections_trip_check open originally.
    */
    execute format('revoke execute on function public.%I(%s) from public, anon, authenticated',
                   fn.proname, fn.args);
    execute format('grant execute on function public.%I(%s) to service_role',
                   fn.proname, fn.args);
    revoked := revoked + 1;
    raise notice 'locked down after the fact: %(%)', fn.proname, fn.args;
  end loop;

  raise notice 'final definer lockdown: % function(s) restricted to service_role', revoked;
end $$;

/* ---------------------------------------------------------------- report ---
   Run this and read it. An empty result is the pass condition; any row is a
   SECURITY DEFINER function a signed-in stranger can call, and definer rights
   bypass RLS, so for these the grant IS the access control — there is no
   policy underneath to catch the mistake.
   -------------------------------------------------------------------------- */
select p.proname                                   as still_reachable,
       pg_get_function_identity_arguments(p.oid)   as args,
       case when has_function_privilege('anon', p.oid, 'execute')
            then 'anon' else 'authenticated' end   as by_role
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
   and p.proname <> all (array['user_org_rank','user_org_ids','api_ingest','api_metrics',
                               'public_report','seed_demo_data','seed_demo_customers',
                               'cortex_collections_enabled','cortex_norm_name'])
   and (has_function_privilege('anon', p.oid, 'execute')
     or has_function_privilege('authenticated', p.oid, 'execute'))
 order by 1;
